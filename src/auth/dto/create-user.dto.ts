import { IsString, Matches, MaxLength, MinLength } from 'class-validator';


export class CreateUserDto {

    @IsString()
    @MinLength(1)
    @MaxLength(20)
    @Matches(/^\d+$/, {
        message: 'The employee number must contain only numbers'
    })
    employeeNumber: string;

    @IsString()
    @MinLength(1)
    @MaxLength(20)
    @Matches(/^\d+$/, {
        message: 'The national id must contain only numbers'
    })
    nationalId: string;

    @IsString()
    @MinLength(6)
    @MaxLength(20)
    @Matches(
        /^\d+$/, {
        message: 'The password must contain only numbers'
    })
    password: string;

    @IsString()
    @MinLength(1)
    fullName: string;

}

