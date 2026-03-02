import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderItem } from './entities';
import { Product } from '../products/entities';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { UserWeeklyOrderException } from '../auth/entities/user-weekly-order-exception.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product, User, UserWeeklyOrderException]),
    AuthModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
