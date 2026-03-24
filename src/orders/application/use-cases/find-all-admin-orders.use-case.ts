import { Inject, Injectable } from '@nestjs/common';

import { OrdersQueryDto } from '../../dto/orders-query.dto';
import { OrderResponseMapper } from '../mappers/order-response.mapper';
import { ORDER_READ_REPOSITORY } from '../../domain/repositories/repository-tokens';
import { OrderReadRepository } from '../../domain/repositories/order-read.repository';

@Injectable()
export class FindAllAdminOrdersUseCase {
  constructor(
    @Inject(ORDER_READ_REPOSITORY)
    private readonly orderReadRepository: OrderReadRepository,
    private readonly orderResponseMapper: OrderResponseMapper,
  ) {}

  async execute(queryDto: OrdersQueryDto) {
    const { limit = 10, offset = 0, sort = 'default', ...filters } = queryDto;
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);

    const { orders, totalOrders } = await this.orderReadRepository.findAllAdmin({
      ...filters,
      sort,
      limit: safeLimit,
      offset: safeOffset,
    });

    return {
      count: totalOrders,
      pages: Math.ceil(totalOrders / safeLimit),
      orders: orders.map((order) =>
        this.orderResponseMapper.mapOrderResponse(order, true),
      ),
    };
  }
}
