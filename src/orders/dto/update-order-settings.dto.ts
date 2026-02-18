import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateOrderSettingsDto {
  @ApiProperty({
    example: 10,
    minimum: 1,
    description: 'Maximum total kg allowed per order for regular users',
  })
  @IsInt()
  @Min(1)
  maxTotalKg: number;

  @ApiProperty({
    example: 2,
    minimum: 1,
    description: 'Maximum distinct products allowed per order for regular users',
  })
  @IsInt()
  @Min(1)
  maxItems: number;
}
