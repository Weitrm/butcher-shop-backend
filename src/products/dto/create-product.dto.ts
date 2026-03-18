import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';


export class CreateProductDto {

    @ApiProperty({
        description: 'Product title (unique)',
        nullable: false,
        minLength: 1
    })
    @IsString()
    @MinLength(1)
    title: string;

    @ApiProperty()
    @IsNumber()
    @IsPositive()
    @IsOptional()
    price?: number;

    @ApiProperty()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    slug?: string;

    @ApiProperty()
    @IsInt()
    @IsPositive()
    @IsOptional()
    stock?: number; 

    @ApiProperty()
    @IsString({ each: true })
    @IsArray()
    @IsOptional()
    images?: string[];

    @ApiProperty()
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @ApiProperty({
        required: false,
        minimum: 1,
        default: 10,
    })
    @IsInt()
    @IsPositive()
    @IsOptional()
    maxKgPerOrder?: number;

    @ApiProperty({
        required: false,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    allowBoxes?: boolean;

    @ApiProperty({
        required: false,
        default: true,
        description: 'When true, the product is visible to all sectors in the new model',
    })
    @IsBoolean()
    @IsOptional()
    allowAllSectors?: boolean;

    @ApiProperty({
        required: false,
        type: [String],
        description:
            'List of sector IDs that can view this product when allowAllSectors is false.',
    })
    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsUUID('4', { each: true })
    allowedSectorIds?: string[];

}
