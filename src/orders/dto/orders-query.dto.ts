import {
  IsBooleanString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

import { PaginationDto } from '../../common/dtos/pagination.dto';
import { OrderStatus } from '../entities';

const DATE_OR_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;

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
  @Matches(DATE_OR_ISO_PATTERN, { message: 'fromDate must be YYYY-MM-DD or ISO' })
  fromDate?: string;

  @IsOptional()
  @Matches(DATE_OR_ISO_PATTERN, { message: 'toDate must be YYYY-MM-DD or ISO' })
  toDate?: string;

  @IsOptional()
  @IsUUID()
  sectorId?: string;

  @IsOptional()
  @Matches(DATE_OR_ISO_PATTERN, { message: 'preparationDate must be YYYY-MM-DD or ISO' })
  preparationDate?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsBooleanString()
  hasBoxes?: string;
}
