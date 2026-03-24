import { OrdersQueryDto } from '../../dto/orders-query.dto';
import { Order } from '../../entities';

export interface FindOrdersByUserInput {
  userId: string;
  limit: number;
  offset: number;
  from?: Date;
  to?: Date;
}

export interface FindAllAdminOrdersInput extends Partial<OrdersQueryDto> {
  limit: number;
  offset: number;
  sort?: OrdersQueryDto['sort'];
}

export interface OrderReadRepository {
  findAllByUser(
    input: FindOrdersByUserInput,
  ): Promise<{ orders: Order[]; totalOrders: number }>;
  findAllAdmin(
    input: FindAllAdminOrdersInput,
  ): Promise<{ orders: Order[]; totalOrders: number }>;
  findAdminOrdersForSummary(filters: Partial<OrdersQueryDto>): Promise<Order[]>;
  findAdminOrdersForHistorySummary(
    filters: Partial<OrdersQueryDto>,
  ): Promise<Order[]>;
}
