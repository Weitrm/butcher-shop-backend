import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Product } from '../products/entities';
import { User } from '../auth/entities/user.entity';
import { CreateSectorDto, UpdateSectorDto } from './dto';
import { Sector } from './entities/sector.entity';

@Injectable()
export class SectorsService {
  private readonly logger = new Logger('SectorsService');

  constructor(
    @InjectRepository(Sector)
    private readonly sectorRepository: Repository<Sector>,

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createSectorDto: CreateSectorDto) {
    const payload = this.normalizePayload(createSectorDto);
    await this.validateProductSlugs(payload.allowedProductSlugs);

    try {
      const sector = this.sectorRepository.create(payload);
      return await this.sectorRepository.save(sector);
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async findAll() {
    return this.sectorRepository.find({
      order: { title: 'ASC' },
    });
  }

  async findOne(id: string) {
    const sector = await this.sectorRepository.findOneBy({ id });
    if (!sector) {
      throw new NotFoundException(`Sector con id ${id} no encontrado`);
    }
    return sector;
  }

  async update(id: string, updateSectorDto: UpdateSectorDto) {
    const current = await this.findOne(id);
    const payload = this.normalizePayload(updateSectorDto);
    const merged = this.sectorRepository.merge(current, payload);

    await this.validateProductSlugs(merged.allowedProductSlugs);

    try {
      return await this.sectorRepository.save(merged);
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const usersWithSector = await this.userRepository.count({
      where: { sectorId: id },
    });
    if (usersWithSector > 0) {
      throw new BadRequestException(
        'No se puede eliminar el sector porque tiene usuarios asignados',
      );
    }

    await this.sectorRepository.delete({ id });
    return { id };
  }

  private async validateProductSlugs(slugs?: string[]) {
    if (!slugs?.length) return;
    const products = await this.productRepository.find({
      where: { slug: In(slugs) },
      select: { slug: true },
    });
    const found = new Set((products || []).map((product) => product.slug));
    const missing = slugs.filter((slug) => !found.has(slug));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Slugs de productos no encontrados: ${missing.join(', ')}`,
      );
    }
  }

  private normalizePayload(payload: Partial<CreateSectorDto>) {
    const normalizeSlugs = (slugs?: string[]) =>
      Array.from(
        new Set(
          (slugs || [])
            .map((slug) => slug?.trim().toLowerCase())
            .filter((slug) => Boolean(slug)),
        ),
      );
    const normalizeColor = (color?: string) => {
      const normalized = color?.trim().toUpperCase();
      return /^#[0-9A-F]{6}$/.test(normalized || '') ? normalized : '#E2E8F0';
    };
    const hasAllowedProducts = Object.prototype.hasOwnProperty.call(
      payload,
      'allowedProductSlugs',
    );
    const hasMaxTotalKg = Object.prototype.hasOwnProperty.call(
      payload,
      'maxTotalKg',
    );
    const hasMaxItems = Object.prototype.hasOwnProperty.call(payload, 'maxItems');
    const hasColor = Object.prototype.hasOwnProperty.call(payload, 'color');

    return {
      ...payload,
      title: payload.title?.trim(),
      ...(hasColor ? { color: normalizeColor(payload.color) } : {}),
      ...(hasMaxTotalKg ? { maxTotalKg: payload.maxTotalKg || null } : {}),
      ...(hasMaxItems ? { maxItems: payload.maxItems || null } : {}),
      ...(hasAllowedProducts
        ? { allowedProductSlugs: normalizeSlugs(payload.allowedProductSlugs) }
        : {}),
    };
  }

  private handleDBExceptions(error: any): never {
    if (error?.code === '23505') {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }
}
