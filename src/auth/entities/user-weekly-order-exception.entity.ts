import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'user_weekly_order_exceptions' })
export class UserWeeklyOrderException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, (user) => user.weeklyOrderExceptions, {
    eager: false,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('date')
  weekStartDate: string;

  @Column('int', { default: 1 })
  extraOrders: number;

  @Column('text', { nullable: true })
  reason: string | null;

  @Column('uuid', { nullable: true })
  grantedByUserId: string | null;

  @ManyToOne(() => User, {
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'grantedByUserId' })
  grantedByUser: User | null;

  @CreateDateColumn()
  createdAt: Date;
}
