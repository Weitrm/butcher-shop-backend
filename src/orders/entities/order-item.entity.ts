import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import { Order } from './order.entity';
import { Product } from '../../products/entities';

@Entity({ name: 'order_items' })
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, {
    onDelete: 'CASCADE',
  })
  order: Order;

  @ManyToOne(() => Product, { eager: true })
  product: Product;

  @ApiProperty({ example: 2, description: 'Kg ordered for the product' })
  @Column('int')
  kg: number;

  @ApiProperty({ example: 1500, description: 'Unit price at order time' })
  @Column('float')
  unitPrice: number;

  @ApiProperty({ example: 3000, description: 'Subtotal for the item' })
  @Column('float')
  subtotal: number;
}
