import { IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationDto } from '../../common/dtos/pagination.dto';

export class OrdersQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['week', 'history', 'all'])
  scope?: string;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  product?: string;
}
