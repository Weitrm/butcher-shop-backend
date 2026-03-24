import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserWeeklyOrderException } from '../../../../auth/entities/user-weekly-order-exception.entity';
import { WeeklyOrderExceptionReadRepository } from '../../../domain/repositories/weekly-order-exception-read.repository';

@Injectable()
export class TypeOrmWeeklyOrderExceptionReadRepository
  implements WeeklyOrderExceptionReadRepository
{
  constructor(
    @InjectRepository(UserWeeklyOrderException)
    private readonly weeklyOrderExceptionRepository: Repository<UserWeeklyOrderException>,
  ) {}

  async getCurrentWeekExtraOrders(userId: string, weekStartDate: string) {
    const result = await this.weeklyOrderExceptionRepository
      .createQueryBuilder('weeklyException')
      .select('COALESCE(SUM(weeklyException.extraOrders), 0)', 'total')
      .where('weeklyException.userId = :userId', { userId })
      .andWhere('weeklyException.weekStartDate = :weekStartDate', {
        weekStartDate,
      })
      .getRawOne<{ total: string }>();

    return Number(result?.total || 0);
  }
}
