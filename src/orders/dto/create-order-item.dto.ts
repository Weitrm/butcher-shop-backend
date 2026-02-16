import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Kg for the product', minimum: 1 })
  @IsInt()
  @Min(1)
  kg: number;

  @ApiProperty({
    description: 'Whether this product is requested as box',
    required: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isBox?: boolean;
}
