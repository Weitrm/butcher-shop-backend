import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { LoginUserDto, CreateUserDto } from './dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';


@Injectable()
export class AuthService {

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly jwtService: JwtService,
  ) {}


  async create( createUserDto: CreateUserDto) {
    
    try {

      const { password, ...userData } = createUserDto;
      
      const user = this.userRepository.create({
        ...userData,
        password: bcrypt.hashSync( password, 10 )
      });

      await this.userRepository.save( user )
      delete user.password;

      return {
        user: user,
        token: this.getJwtToken({ id: user.id })
      };
      // TODO: Retornar el JWT de acceso

    } catch (error) {
      this.handleDBErrors(error);
    }

  }

  async login( loginUserDto: LoginUserDto ) {

    const { password, employeeNumber } = loginUserDto;

    const user = await this.userRepository.findOne({
      where: { employeeNumber },
      select: { employeeNumber: true, nationalId: true, password: true, id: true, fullName: true, isActive: true, roles: true}
    });

    if ( !user ) 
      throw new UnauthorizedException('Credentials are not valid (employee number)');

    if ( !user.isActive )
      throw new UnauthorizedException('User is inactive');
      
    if ( !bcrypt.compareSync( password, user.password ) )
      throw new UnauthorizedException('Credentials are not valid (password)');

    delete user.password;

    return {
      user: user,
      token: this.getJwtToken({ id: user.id })
    };
  }

  async checkAuthStatus( user: User ){

    return {
      user: user,
      token: this.getJwtToken({ id: user.id })
    };

  }

  async findAll() {
    return this.userRepository.find({
      order: { fullName: 'ASC' },
    });
  }

  async updateStatus(userId: string, isActive: boolean, actor: User) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    if (user.roles?.includes('admin')) {
      if (user.id === actor.id) {
        throw new BadRequestException('No puedes cambiar el estado de tu propio usuario');
      }
      if (!isActive && user.isActive) {
        const activeAdmins = await this.countActiveAdmins();
        if (activeAdmins <= 1) {
          throw new BadRequestException('No puedes desactivar el ultimo admin activo');
        }
      }
    }

    user.isActive = isActive;
    await this.userRepository.save(user);

    return user;
  }

  async updatePassword(userId: string, password: string) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    user.password = bcrypt.hashSync(password, 10);
    await this.userRepository.save(user);

    delete user.password;
    return user;
  }

  async removeUser(userId: string, actor: User) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    if (user.roles?.includes('admin')) {
      if (user.id === actor.id) {
        throw new BadRequestException('No puedes eliminar tu propio usuario');
      }
      if (user.isActive) {
        const activeAdmins = await this.countActiveAdmins();
        if (activeAdmins <= 1) {
          throw new BadRequestException('No puedes eliminar el ultimo admin activo');
        }
      }
    }

    try {
      await this.userRepository.remove(user);
    } catch (error) {
      if (error?.code === '23503') {
        throw new BadRequestException(
          'No se puede eliminar un usuario con pedidos o productos asociados',
        );
      }
      this.handleDBErrors(error);
    }

    return { id: userId };
  }


  
  private async countActiveAdmins(): Promise<number> {
    return this.userRepository
      .createQueryBuilder('user')
      .where(':role = ANY(user.roles)', { role: 'admin' })
      .andWhere('user.isActive = true')
      .getCount();
  }

  private getJwtToken( payload: JwtPayload ) {
    const token = this.jwtService.sign( payload );
    return token;

  }

  private handleDBErrors( error: any ): never {


    if ( error.code === '23505' ) 
      throw new BadRequestException( error.detail );

    console.log(error)

    throw new InternalServerErrorException('Please check server logs');

  }


}






