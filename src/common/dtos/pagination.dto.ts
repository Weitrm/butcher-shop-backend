import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsPositive, Min } from 'class-validator';

export class PaginationDto {
  @ApiProperty({
    default: 10,
    description: 'How many rows do you need',
  })
  @IsOptional()
  @IsPositive()
  @Type(() => Number) // enableImplicitConversions: true
  limit?: number;

  @ApiProperty({
    default: 0,
    description: 'How many rows do you want to skip',
  })
  @IsOptional()
  @Min(0)
  @Type(() => Number) // enableImplicitConversions: true
  offset?: number;

  @ApiProperty({
    required: false,
    description: 'Precio mínimo para filtrar resultados',
    example: 0,
  })
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  minPrice?: number;

  @ApiProperty({
    required: false,
    description: 'Precio máximo para filtrar resultados',
    example: 50,
  })
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  maxPrice?: number;

  @ApiProperty({
    required: false,
    description: 'Query para filtrar resultados',
    example: 'query',
  })
  @IsOptional()
  @Type(() => String)
  q?: string;

  @ApiProperty({
    required: false,
    description: 'Estado del producto para filtrar resultados',
    example: 'true',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;
}
