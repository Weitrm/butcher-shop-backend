import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  Repository,
} from 'typeorm';

import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';

import { validate as isUUID } from 'uuid';
import { ProductImage, Product } from './entities';
import { User } from '../auth/entities/user.entity';
import { ProductSectorVisibilityService } from './services/product-sector-visibility.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger('ProductsService');

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly dataSource: DataSource,
    private readonly productSectorVisibilityService: ProductSectorVisibilityService,
  ) {}

  async create(createProductDto: CreateProductDto, user: User) {
    try {
      const { images = [], ...productDetails } = createProductDto;
      const visibilityConfig =
        await this.productSectorVisibilityService.resolveCreateVisibilityConfig({
          allowAllSectors: productDetails.allowAllSectors,
          allowedSectorIds: productDetails.allowedSectorIds,
        });
      const { allowAllSectors, allowedSectorIds } = visibilityConfig;

      const product = this.productRepository.create({
        ...productDetails,
        allowAllSectors,
        allowedSectorIds,
        images: images.map((image) =>
          this.productImageRepository.create({ url: image }),
        ),
        user,
      });

      await this.productRepository.save(product);
      await this.productSectorVisibilityService.syncProductSectorVisibility(
        product.id,
        allowedSectorIds,
      );

      return { ...product, images };
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async findAll(
    paginationDto: PaginationDto,
    includeInactive = false,
    visibleSectorId?: string | null,
  ) {
    const {
      limit = 10,
      offset = 0,
      minPrice,
      maxPrice,
      q: query,
      isActive,
    } = paginationDto;

    const activeFilter = includeInactive
      ? isActive === 'true'
        ? true
        : isActive === 'false'
        ? false
        : undefined
      : true;

    const normalizedQuery = query?.trim();

    const baseQuery = this.productRepository.createQueryBuilder('product');

    if (minPrice !== undefined) {
      baseQuery.andWhere('product.price >= :minPrice', { minPrice });
    }

    if (maxPrice !== undefined) {
      baseQuery.andWhere('product.price <= :maxPrice', { maxPrice });
    }

    if (activeFilter !== undefined) {
      baseQuery.andWhere('product.isActive = :isActive', {
        isActive: activeFilter,
      });
    }

    if (visibleSectorId !== undefined) {
      this.productSectorVisibilityService.applySectorVisibilityFilter(
        baseQuery,
        visibleSectorId,
      );
    }

    if (normalizedQuery) {
      baseQuery.andWhere(
        new Brackets((qb) => {
          qb.where('product.title ILIKE :query', {
            query: `%${normalizedQuery}%`,
          }).orWhere('product.slug ILIKE :query', {
            query: `%${normalizedQuery}%`,
          });
        }),
      );
    }

    const totalProducts = await baseQuery.getCount();

    const products = await baseQuery
      .clone()
      .leftJoinAndSelect('product.images', 'productImages')
      .orderBy('product.id', 'ASC')
      .take(limit)
      .skip(offset)
      .getMany();
    const productsWithMergedVisibility =
      await this.productSectorVisibilityService.mergeProductsWithSectorVisibility(
        products,
      );

    return {
      count: totalProducts,
      pages: Math.ceil(totalProducts / limit),
      products: productsWithMergedVisibility.map((product) => ({
        ...product,
        images: product.images.map((img) => img.url),
      })),
    };
  }

  async findAllForShop(paginationDto: PaginationDto, user: User) {
    const canViewHidden =
      user?.isSuperUser === true || user?.roles?.includes('super-user');
    if (canViewHidden) {
      return this.findAll(paginationDto, true);
    }

    const authUser = await this.userRepository.findOneBy({ id: user.id });
    const sectorId = authUser?.sectorId || null;

    return this.findAll(paginationDto, false, sectorId);
  }

  async findOne(term: string, onlyActive = false) {
    let product: Product;

    if (isUUID(term)) {
      const where: { id: string; isActive?: boolean } = { id: term };
      if (onlyActive) {
        where.isActive = true;
      }
      product = await this.productRepository.findOneBy(where);
    } else {
      const queryBuilder = this.productRepository.createQueryBuilder('prod');
      queryBuilder.where('UPPER(title) =:title or slug =:slug', {
        title: term.toUpperCase(),
        slug: term.toLowerCase(),
      });

      if (onlyActive) {
        queryBuilder.andWhere('prod.isActive = :isActive', { isActive: true });
      }

      product = await queryBuilder
        .leftJoinAndSelect('prod.images', 'prodImages')
        .getOne();
    }

    if (!product) throw new NotFoundException(`Product with ${term} not found`);

    return product;
  }

  async findOnePlain(term: string, onlyActive = false) {
    const [product] =
      await this.productSectorVisibilityService.mergeProductsWithSectorVisibility([
        await this.findOne(term, onlyActive),
      ]);
    const { images = [], ...rest } = product;
    return {
      ...rest,
      images: images.map((image) => image.url),
    };
  }

  async findOneForShop(term: string, user: User) {
    const canViewHidden =
      user?.isSuperUser === true || user?.roles?.includes('super-user');
    const product = await this.findOnePlain(term, !canViewHidden);

    if (canViewHidden) {
      return product;
    }

    const authUser = await this.userRepository.findOneBy({ id: user.id });
    const sectorId = authUser?.sectorId || null;

    if (
      !(await this.productSectorVisibilityService.canAccessProductBySector(
        product,
        sectorId,
      ))
    ) {
      throw new NotFoundException(`Product with ${term} not found`);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, user: User) {
    const { images, ...toUpdate } = updateProductDto;

    const product = await this.productRepository.preload({ id, ...toUpdate });

    if (!product)
      throw new NotFoundException(`Product with id: ${id} not found`);

    const hasSectorVisibilityPatch =
      Object.prototype.hasOwnProperty.call(updateProductDto, 'allowAllSectors') ||
      Object.prototype.hasOwnProperty.call(updateProductDto, 'allowedSectorIds');

    if (hasSectorVisibilityPatch) {
      const visibilityConfig =
        await this.productSectorVisibilityService.resolveUpdateVisibilityConfig({
          productId: id,
          currentAllowAllSectors: product.allowAllSectors,
          allowAllSectors: updateProductDto.allowAllSectors,
          allowedSectorIds: updateProductDto.allowedSectorIds,
          hasAllowAllPatch: Object.prototype.hasOwnProperty.call(
            updateProductDto,
            'allowAllSectors',
          ),
          hasAllowedSectorIdsPatch: Object.prototype.hasOwnProperty.call(
            updateProductDto,
            'allowedSectorIds',
          ),
        });

      product.allowAllSectors = visibilityConfig.allowAllSectors;
      product.allowedSectorIds = visibilityConfig.allowedSectorIds;
    }

    // Create query runner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (images) {
        await queryRunner.manager.delete(ProductImage, { product: { id } });

        product.images = images.map((image) =>
          this.productImageRepository.create({ url: image }),
        );
      }

      // await this.productRepository.save( product );
      product.user = user;

      await queryRunner.manager.save(product);
      if (hasSectorVisibilityPatch) {
        await this.productSectorVisibilityService.syncProductSectorVisibility(
          id,
          product.allowAllSectors ? [] : product.allowedSectorIds || [],
          queryRunner.manager,
        );
      }

      await queryRunner.commitTransaction();
      await queryRunner.release();

      return this.findOnePlain(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.handleDBExceptions(error);
    }
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    await this.productRepository.remove(product);
  }

  private handleDBExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);

    this.logger.error(error);
    // console.log(error)
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }

  async deleteAllProducts() {
    const query = this.productRepository.createQueryBuilder('product');

    try {
      return await query.delete().where({}).execute();
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }
}
