import { Inject, Injectable } from '@nestjs/common';

import { OrdersQueryDto } from '../../dto/orders-query.dto';
import { OrderStatus } from '../../entities';
import { ORDER_READ_REPOSITORY } from '../../domain/repositories/repository-tokens';
import { OrderReadRepository } from '../../domain/repositories/order-read.repository';

@Injectable()
export class GetAdminOrdersHistorySummaryUseCase {
  constructor(
    @Inject(ORDER_READ_REPOSITORY)
    private readonly orderReadRepository: OrderReadRepository,
  ) {}

  async execute(queryDto: OrdersQueryDto) {
    const orders = await this.orderReadRepository.findAdminOrdersForHistorySummary(
      queryDto,
    );
    const summary = {
      total: 0,
      totalKg: 0,
      totalBoxes: 0,
      totalPrice: 0,
      completed: 0,
      hasBoxOrders: false,
    };

    for (const order of orders) {
      if (order.status === OrderStatus.Cancelled) {
        continue;
      }

      summary.total += 1;
      summary.totalPrice += Number(order.totalPrice || 0);
      if (order.status === OrderStatus.Completed) summary.completed += 1;

      for (const item of order.items || []) {
        if (item.isBox) {
          summary.totalBoxes += Number(item.kg || 0);
          summary.hasBoxOrders = true;
        } else {
          summary.totalKg += Number(item.kg || 0);
        }
      }
    }

    return summary;
  }
}
