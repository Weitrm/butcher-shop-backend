import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

import { PaginationDto } from '../../common/dtos/pagination.dto';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'fromDate must be YYYY-MM-DD' })
  fromDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'toDate must be YYYY-MM-DD' })
  toDate?: string;

  @IsOptional()
  @IsUUID()
  sectorId?: string;

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'preparationDate must be YYYY-MM-DD' })
  preparationDate?: string;
}
