import { Inject, Injectable } from '@nestjs/common';

import { OrdersQueryDto } from '../../dto/orders-query.dto';
import { User } from '../../../auth/entities/user.entity';
import { OrderDateService } from '../../domain/services/order-date.service';
import { OrderResponseMapper } from '../mappers/order-response.mapper';
import { ORDER_READ_REPOSITORY } from '../../domain/repositories/repository-tokens';
import { OrderReadRepository } from '../../domain/repositories/order-read.repository';

@Injectable()
export class FindAllByUserUseCase {
  constructor(
    @Inject(ORDER_READ_REPOSITORY)
    private readonly orderReadRepository: OrderReadRepository,
    private readonly orderDateService: OrderDateService,
    private readonly orderResponseMapper: OrderResponseMapper,
  ) {}

  async execute(user: User, queryDto: OrdersQueryDto) {
    const { limit = 10, offset = 0, fromDate, toDate } = queryDto;
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);
    const { from, to } = this.orderDateService.buildDateRange(fromDate, toDate);

    const { orders, totalOrders } = await this.orderReadRepository.findAllByUser({
      userId: user.id,
      limit: safeLimit,
      offset: safeOffset,
      from,
      to,
    });

    return {
      count: totalOrders,
      pages: Math.ceil(totalOrders / safeLimit),
      orders: orders.map((order) => this.orderResponseMapper.mapOrderResponse(order)),
    };
  }
}
