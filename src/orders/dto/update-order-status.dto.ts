import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { OrderStatus } from '../entities';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
