import { IsBoolean } from 'class-validator';

export class UpdateUserSuperUserDto {
  @IsBoolean()
  isSuperUser: boolean;
}
