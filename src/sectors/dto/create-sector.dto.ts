import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSectorDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn([-1, 0, 1, 2, 3, 4, 5, 6])
  preparationWeekday?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalKg?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxItems?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOrdersPerWeek?: number;
}
