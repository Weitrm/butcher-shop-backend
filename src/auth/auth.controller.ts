import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';

import { IncomingHttpHeaders } from 'http';

import { AuthService } from './auth.service';
import { Auth, GetUser, RawHeaders } from './decorators';
import { RoleProtected } from './decorators/role-protected.decorator';
import {
  CreateUserDto,
  LoginUserDto,
  UpdateUserPasswordDto,
  UpdateUserSectorDto,
  UpdateUserStatusDto,
  UpdateUserSuperUserDto,
  UsersQueryDto,
} from './dto';
import { User } from './entities/user.entity';
import { UserRoleGuard } from './guards/user-role.guard';
import { ValidRoles } from './interfaces';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Auth(ValidRoles.admin)
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.authService.create(createUserDto);
  }

  @Post('login')
  loginUser(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Get('check-status')
  @Auth()
  checkAuthStatus(@GetUser() user: User) {
    return this.authService.checkAuthStatus(user);
  }

  @Get('users')
  @Auth(ValidRoles.admin)
  findAllUsers(@Query() usersQueryDto: UsersQueryDto) {
    return this.authService.findAll(usersQueryDto);
  }

  @Patch('users/:id/status')
  @Auth(ValidRoles.admin)
  updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
    @GetUser() user: User,
  ) {
    return this.authService.updateStatus(id, updateUserStatusDto.isActive, user);
  }

  @Patch('users/:id/password')
  @Auth(ValidRoles.admin)
  updateUserPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserPasswordDto: UpdateUserPasswordDto,
  ) {
    return this.authService.updatePassword(id, updateUserPasswordDto.password);
  }

  @Patch('users/:id/super-user')
  @Auth(ValidRoles.admin)
  updateUserSuperUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserSuperUserDto: UpdateUserSuperUserDto,
  ) {
    return this.authService.updateSuperUser(
      id,
      updateUserSuperUserDto.isSuperUser,
    );
  }

  @Patch('users/:id/sector')
  @Auth(ValidRoles.admin)
  updateUserSector(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserSectorDto: UpdateUserSectorDto,
  ) {
    return this.authService.updateSector(id, updateUserSectorDto.sectorId);
  }

  @Delete('users/:id')
  @Auth(ValidRoles.admin)
  removeUser(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.authService.removeUser(id, user);
  }

  @Get('private')
  @UseGuards(AuthGuard())
  testingPrivateRoute(
    @Req() request: Express.Request,
    @GetUser() user: User,
    @GetUser('employeeNumber') userEmployeeNumber: string,
    @RawHeaders() rawHeaders: string[],
    @Headers() headers: IncomingHttpHeaders,
  ) {
    return {
      ok: true,
      message: 'Hola Mundo Private',
      user,
      userEmployeeNumber,
      rawHeaders,
      headers,
    };
  }

  @Get('private2')
  @RoleProtected(ValidRoles.superUser, ValidRoles.admin)
  @UseGuards(AuthGuard(), UserRoleGuard)
  privateRoute2(@GetUser() user: User) {
    return {
      ok: true,
      user,
    };
  }

  @Get('private3')
  @Auth(ValidRoles.admin)
  privateRoute3(@GetUser() user: User) {
    return {
      ok: true,
      user,
    };
  }
}
