import { Inject, Injectable } from '@nestjs/common';

import { OrdersQueryDto } from '../../dto/orders-query.dto';
import { OrderStatus } from '../../entities';
import { ORDER_READ_REPOSITORY } from '../../domain/repositories/repository-tokens';
import { OrderReadRepository } from '../../domain/repositories/order-read.repository';

@Injectable()
export class GetAdminOrdersSummaryUseCase {
  constructor(
    @Inject(ORDER_READ_REPOSITORY)
    private readonly orderReadRepository: OrderReadRepository,
  ) {}

  async execute(queryDto: OrdersQueryDto) {
    const orders = await this.orderReadRepository.findAdminOrdersForSummary(
      queryDto,
    );
    const summary = {
      total: 0,
      pending: 0,
      completed: 0,
      cancelled: 0,
    };

    for (const order of orders) {
      if (order.status === OrderStatus.Cancelled) {
        summary.cancelled += 1;
        continue;
      }

      summary.total += 1;
      if (order.status === OrderStatus.Pending) summary.pending += 1;
      if (order.status === OrderStatus.Completed) summary.completed += 1;
    }

    return summary;
  }
}
