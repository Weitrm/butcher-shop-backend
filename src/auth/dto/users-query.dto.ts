import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UsersQueryDto {
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsUUID()
  sectorId?: string;
}

