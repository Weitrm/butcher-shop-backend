import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../../../auth/entities/user.entity';
import { UserReadRepository } from '../../../domain/repositories/user-read.repository';

@Injectable()
export class TypeOrmUserReadRepository implements UserReadRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findByIdWithSector(userId: string) {
    return this.userRepository.findOne({
      where: { id: userId },
      relations: { sector: true },
    });
  }
}
