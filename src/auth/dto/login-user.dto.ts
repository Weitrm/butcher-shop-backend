import { IsString, Matches, MaxLength, MinLength } from 'class-validator';


export class LoginUserDto {

    @IsString()
    @MinLength(1)
    @MaxLength(20)
    employeeNumber: string;

    @IsString()
    @MinLength(6)
    @MaxLength(20)
    @Matches(
        /^\d+$/, {
        message: 'The password must contain only numbers'
    })
    password: string;

}
