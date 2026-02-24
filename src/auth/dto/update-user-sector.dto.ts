import { IsOptional, IsUUID } from 'class-validator';

export class UpdateUserSectorDto {
  @IsOptional()
  @IsUUID()
  sectorId?: string | null;
}

