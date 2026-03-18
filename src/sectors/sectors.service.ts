import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { CreateSectorDto, UpdateSectorDto } from './dto';
import { Sector } from './entities/sector.entity';

@Injectable()
export class SectorsService {
  private readonly logger = new Logger('SectorsService');

  constructor(
    @InjectRepository(Sector)
    private readonly sectorRepository: Repository<Sector>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createSectorDto: CreateSectorDto) {
    const payload = this.normalizePayload(createSectorDto);

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

  private normalizePayload(payload: Partial<CreateSectorDto>) {
    const normalizeColor = (color?: string) => {
      const normalized = color?.trim().toUpperCase();
      return /^#[0-9A-F]{6}$/.test(normalized || '') ? normalized : '#E2E8F0';
    };
    const hasMaxTotalKg = Object.prototype.hasOwnProperty.call(
      payload,
      'maxTotalKg',
    );
    const hasMaxItems = Object.prototype.hasOwnProperty.call(payload, 'maxItems');
    const hasMaxOrdersPerWeek = Object.prototype.hasOwnProperty.call(
      payload,
      'maxOrdersPerWeek',
    );
    const hasColor = Object.prototype.hasOwnProperty.call(payload, 'color');

    return {
      ...payload,
      title: payload.title?.trim(),
      ...(hasColor ? { color: normalizeColor(payload.color) } : {}),
      ...(hasMaxTotalKg ? { maxTotalKg: payload.maxTotalKg || null } : {}),
      ...(hasMaxItems ? { maxItems: payload.maxItems || null } : {}),
      ...(hasMaxOrdersPerWeek
        ? { maxOrdersPerWeek: payload.maxOrdersPerWeek || null }
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
