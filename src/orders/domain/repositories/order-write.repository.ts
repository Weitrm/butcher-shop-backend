import { OrderStatus } from '../../entities';
import { Order } from '../../entities/order.entity';
import { Product } from '../../../products/entities';
import { User } from '../../../auth/entities/user.entity';

export interface CreateOrderItemRecordInput {
  product: Product;
  kg: number;
  isBox: boolean;
  unitPrice: number;
  subtotal: number;
}

export interface CreateOrderRecordInput {
  orderingUser: User;
  items: CreateOrderItemRecordInput[];
  totalKg: number;
  totalPrice: number;
  sectorIdSnapshot: string | null;
  sectorTitleSnapshot: string | null;
  sectorColorSnapshot: string | null;
  preparationWeekdaySnapshot: number | null;
  preparationDate: string | null;
}

export interface OrderWriteRepository {
  countByUserSince(userId: string, startDate: Date): Promise<number>;
  createOrder(input: CreateOrderRecordInput): Promise<Order>;
  findOneByIdAndUser(orderId: string, userId: string): Promise<Order | null>;
  updateOrderStatus(id: string, nextStatus: OrderStatus): Promise<Order>;
}
