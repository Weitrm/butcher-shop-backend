import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateUserWeeklyOrderExceptionDto {
  @IsInt()
  @Min(1)
  extraOrders: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
