import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import { OrderItem } from './order-item.entity';
import { OrderStatus } from './order-status.enum';
import { User } from '../../auth/entities/user.entity';

@Entity({ name: 'orders' })
export class Order {
  @ApiProperty({
    example: 'fd5b6290-0fd1-4a1d-8bbf-3b920c40f1d1',
    description: 'Order ID',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.orders, { eager: true })
  user: User;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItem[];

  @ApiProperty({ example: 10, description: 'Total kg for the order' })
  @Column('int', { default: 0 })
  totalKg: number;

  @ApiProperty({ example: 5000, description: 'Total price for the order' })
  @Column('float', { default: 0 })
  totalPrice: number;

  @ApiProperty({ example: OrderStatus.Pending })
  @Column('text', { default: OrderStatus.Pending })
  status: OrderStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
