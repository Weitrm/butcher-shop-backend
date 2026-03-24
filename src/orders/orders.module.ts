import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderItem } from './entities';
import { Product } from '../products/entities';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { UserWeeklyOrderException } from '../auth/entities/user-weekly-order-exception.entity';
import { OrderRulesService } from './domain/services/order-rules.service';
import { OrderDateService } from './domain/services/order-date.service';
import { OrderResponseMapper } from './application/mappers/order-response.mapper';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { UpdateOrderStatusUseCase } from './application/use-cases/update-order-status.use-case';
import { TypeOrmOrderWriteRepository } from './infrastructure/typeorm/repositories/typeorm-order-write.repository';
import { TypeOrmOrderReadRepository } from './infrastructure/typeorm/repositories/typeorm-order-read.repository';
import { TypeOrmProductReadRepository } from './infrastructure/typeorm/repositories/typeorm-product-read.repository';
import { TypeOrmUserReadRepository } from './infrastructure/typeorm/repositories/typeorm-user-read.repository';
import { TypeOrmWeeklyOrderExceptionReadRepository } from './infrastructure/typeorm/repositories/typeorm-weekly-order-exception-read.repository';
import {
  ORDER_READ_REPOSITORY,
  ORDER_WRITE_REPOSITORY,
  PRODUCT_READ_REPOSITORY,
  USER_READ_REPOSITORY,
  WEEKLY_ORDER_EXCEPTION_READ_REPOSITORY,
} from './domain/repositories/repository-tokens';
import { FindAllByUserUseCase } from './application/use-cases/find-all-by-user.use-case';
import { FindAllAdminOrdersUseCase } from './application/use-cases/find-all-admin-orders.use-case';
import { GetAdminOrdersSummaryUseCase } from './application/use-cases/get-admin-orders-summary.use-case';
import { GetAdminOrdersHistorySummaryUseCase } from './application/use-cases/get-admin-orders-history-summary.use-case';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product, User, UserWeeklyOrderException]),
    AuthModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderRulesService,
    OrderDateService,
    OrderResponseMapper,
    CreateOrderUseCase,
    UpdateOrderStatusUseCase,
    FindAllByUserUseCase,
    FindAllAdminOrdersUseCase,
    GetAdminOrdersSummaryUseCase,
    GetAdminOrdersHistorySummaryUseCase,
    TypeOrmOrderWriteRepository,
    TypeOrmOrderReadRepository,
    TypeOrmProductReadRepository,
    TypeOrmUserReadRepository,
    TypeOrmWeeklyOrderExceptionReadRepository,
    {
      provide: ORDER_READ_REPOSITORY,
      useExisting: TypeOrmOrderReadRepository,
    },
    {
      provide: ORDER_WRITE_REPOSITORY,
      useExisting: TypeOrmOrderWriteRepository,
    },
    {
      provide: PRODUCT_READ_REPOSITORY,
      useExisting: TypeOrmProductReadRepository,
    },
    {
      provide: USER_READ_REPOSITORY,
      useExisting: TypeOrmUserReadRepository,
    },
    {
      provide: WEEKLY_ORDER_EXCEPTION_READ_REPOSITORY,
      useExisting: TypeOrmWeeklyOrderExceptionReadRepository,
    },
  ],
})
export class OrdersModule {}
