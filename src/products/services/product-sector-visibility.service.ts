import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  EntityManager,
  In,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { Product, ProductSectorVisibility } from '../entities';
import { Sector } from '../../sectors/entities';

type ProductVisibilityConfig = {
  allowAllSectors: boolean;
  allowedSectorIds: string[];
};

@Injectable()
export class ProductSectorVisibilityService {
  constructor(
    @InjectRepository(ProductSectorVisibility)
    private readonly productSectorVisibilityRepository: Repository<ProductSectorVisibility>,

    @InjectRepository(Sector)
    private readonly sectorRepository: Repository<Sector>,
  ) {}

  async resolveCreateVisibilityConfig(input: {
    allowAllSectors?: boolean;
    allowedSectorIds?: string[];
  }): Promise<ProductVisibilityConfig> {
    const normalizedSectorIds = this.normalizeSectorIds(input.allowedSectorIds);
    const allowAllSectors =
      normalizedSectorIds.length > 0 ? false : (input.allowAllSectors ?? true);

    if (!allowAllSectors) {
      await this.validateSectorIds(normalizedSectorIds);
    }

    return {
      allowAllSectors,
      allowedSectorIds: allowAllSectors ? [] : normalizedSectorIds,
    };
  }

  async resolveUpdateVisibilityConfig(input: {
    productId: string;
    currentAllowAllSectors: boolean;
    allowAllSectors?: boolean;
    allowedSectorIds?: string[];
    hasAllowAllPatch: boolean;
    hasAllowedSectorIdsPatch: boolean;
  }): Promise<ProductVisibilityConfig> {
    const {
      productId,
      currentAllowAllSectors,
      allowAllSectors,
      allowedSectorIds,
      hasAllowAllPatch,
      hasAllowedSectorIdsPatch,
    } = input;

    if (hasAllowAllPatch && allowAllSectors === true && !hasAllowedSectorIdsPatch) {
      return {
        allowAllSectors: true,
        allowedSectorIds: [],
      };
    }

    const currentAllowedSectorIds = await this.getAllowedSectorIds(productId);
    const normalizedSectorIds = this.normalizeSectorIds(
      hasAllowedSectorIdsPatch ? (allowedSectorIds ?? []) : currentAllowedSectorIds,
    );
    const nextAllowAllSectors =
      normalizedSectorIds.length > 0
        ? false
        : hasAllowAllPatch
        ? Boolean(allowAllSectors)
        : currentAllowAllSectors;

    if (!nextAllowAllSectors) {
      await this.validateSectorIds(normalizedSectorIds);
    }

    return {
      allowAllSectors: nextAllowAllSectors,
      allowedSectorIds: nextAllowAllSectors ? [] : normalizedSectorIds,
    };
  }

  async syncProductSectorVisibility(
    productId: string,
    sectorIds: string[],
    manager?: EntityManager,
  ) {
    const repository = manager
      ? manager.getRepository(ProductSectorVisibility)
      : this.productSectorVisibilityRepository;
    const normalizedSectorIds = this.normalizeSectorIds(sectorIds);

    await repository.delete({ productId });
    if (!normalizedSectorIds.length) return;

    const records = normalizedSectorIds.map((sectorId) =>
      repository.create({ productId, sectorId }),
    );
    await repository.save(records);
  }

  applySectorVisibilityFilter(
    queryBuilder: SelectQueryBuilder<Product>,
    sectorId?: string | null,
  ) {
    if (!sectorId) {
      queryBuilder.andWhere('product."allowAllSectors" = true');
      return;
    }

    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where('product."allowAllSectors" = true').orWhere(
          `EXISTS (
              SELECT 1
              FROM "product_sector_visibility" "psv"
              WHERE "psv"."productId" = "product"."id"
                AND "psv"."sectorId" = :sectorId
            )`,
          { sectorId },
        );
      }),
    );
  }

  async canAccessProductBySector(
    product: { id?: string; allowAllSectors?: boolean },
    sectorId?: string | null,
  ) {
    if (product.allowAllSectors) return true;
    if (!sectorId) return false;
    if (!product.id) return false;

    const visibilityCount = await this.productSectorVisibilityRepository.count({
      where: {
        productId: product.id,
        sectorId,
      },
    });
    return visibilityCount > 0;
  }

  async mergeProductsWithSectorVisibility(products: Product[]) {
    if (!products.length) return products;
    const productIds = Array.from(
      new Set(products.map((product) => product.id).filter(Boolean)),
    );
    if (!productIds.length) return products;

    const records = await this.productSectorVisibilityRepository.find({
      where: { productId: In(productIds) },
      select: { productId: true, sectorId: true },
    });
    const visibilityMap = new Map<string, string[]>();

    for (const record of records) {
      const current = visibilityMap.get(record.productId) || [];
      current.push(record.sectorId);
      visibilityMap.set(record.productId, current);
    }

    return products.map((product) => {
      product.allowedSectorIds = Array.from(
        new Set(visibilityMap.get(product.id) || []),
      );
      return product;
    });
  }

  private normalizeSectorIds(sectorIds?: string[]) {
    if (!Array.isArray(sectorIds)) return [];
    return Array.from(
      new Set(
        sectorIds
          .map((sectorId) => sectorId?.trim())
          .filter((sectorId): sectorId is string => Boolean(sectorId)),
      ),
    );
  }

  private async validateSectorIds(sectorIds: string[]) {
    if (!sectorIds.length) return;
    const uniqueSectorIds = Array.from(new Set(sectorIds));
    const sectors = await this.sectorRepository.find({
      where: { id: In(uniqueSectorIds) },
      select: { id: true },
    });
    const foundSectorIds = new Set((sectors || []).map((sector) => sector.id));
    const missingSectorIds = uniqueSectorIds.filter(
      (sectorId) => !foundSectorIds.has(sectorId),
    );
    if (missingSectorIds.length > 0) {
      throw new BadRequestException(
        `Sectores no encontrados: ${missingSectorIds.join(', ')}`,
      );
    }
  }

  private async getAllowedSectorIds(productId: string) {
    const records = await this.productSectorVisibilityRepository.find({
      where: { productId },
      select: { sectorId: true },
    });
    return Array.from(new Set(records.map((record) => record.sectorId)));
  }
}
