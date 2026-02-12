import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateUserPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  @Matches(/^\d+$/, {
    message: 'The password must contain only numbers',
  })
  password: string;
}
