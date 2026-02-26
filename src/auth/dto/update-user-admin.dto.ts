import { IsBoolean } from 'class-validator';

export class UpdateUserAdminDto {
  @IsBoolean()
  isAdmin: boolean;
}
