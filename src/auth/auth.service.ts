import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { CreateUserDto, LoginUserDto, UsersQueryDto } from './dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { Sector } from '../sectors/entities';

const LEGACY_SUPER_ROLE = 'super';
const SUPER_USER_ROLE = 'super-user';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Sector)
    private readonly sectorRepository: Repository<Sector>,

    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async create(createUserDto: CreateUserDto) {
    try {
      const { password, isSuperUser, sectorId, ...userData } = createUserDto;
      const sector = sectorId
        ? await this.sectorRepository.findOneBy({ id: sectorId })
        : null;

      if (sectorId && !sector) {
        throw new NotFoundException(`Sector con id ${sectorId} no encontrado`);
      }

      const user = this.userRepository.create({
        ...userData,
        isSuperUser: Boolean(isSuperUser),
        roles: this.getRolesForSuperFlag(Boolean(isSuperUser)),
        sectorId: sector?.id || null,
        sector: sector || null,
        password: bcrypt.hashSync(password, 10),
      });

      await this.userRepository.save(user);
      delete user.password;

      return {
        user,
        token: this.getJwtToken({ id: user.id }),
      };
    } catch (error) {
      this.handleDBErrors(error);
    }
  }

  async login(loginUserDto: LoginUserDto) {
    const { password, employeeNumber } = loginUserDto;

    const user = await this.userRepository.findOne({
      where: { employeeNumber },
      select: {
        employeeNumber: true,
        nationalId: true,
        password: true,
        id: true,
        fullName: true,
        isActive: true,
        isSuperUser: true,
        roles: true,
        sectorId: true,
      },
      relations: {
        sector: true,
      },
    });

    if (!user)
      throw new UnauthorizedException(
        'Credentials are not valid (employee number)',
      );

    if (!user.isActive) throw new UnauthorizedException('User is inactive');

    if (!bcrypt.compareSync(password, user.password))
      throw new UnauthorizedException('Credentials are not valid (password)');

    this.normalizeSuperUser(user);
    delete user.password;

    return {
      user,
      token: this.getJwtToken({ id: user.id }),
    };
  }

  async checkAuthStatus(user: User) {
    this.normalizeSuperUser(user);

    return {
      user,
      token: this.getJwtToken({ id: user.id }),
    };
  }

  async findAll(queryDto?: UsersQueryDto) {
    const usersQuery = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.sector', 'sector')
      .orderBy('user.fullName', 'ASC');

    if (queryDto?.role) {
      usersQuery.andWhere(':role = ANY(user.roles)', { role: queryDto.role });
    }

    if (queryDto?.sectorId) {
      usersQuery.andWhere('user.sectorId = :sectorId', {
        sectorId: queryDto.sectorId,
      });
    }

    const users = await usersQuery.getMany();
    return users.map((listedUser) => this.normalizeSuperUser(listedUser));
  }

  async updateStatus(userId: string, isActive: boolean, actor: User) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    if (user.roles?.includes('admin')) {
      if (user.id === actor.id) {
        throw new BadRequestException(
          'No puedes cambiar el estado de tu propio usuario',
        );
      }
      if (!isActive && user.isActive) {
        const activeAdmins = await this.countActiveAdmins();
        if (activeAdmins <= 1) {
          throw new BadRequestException(
            'No puedes desactivar el ultimo admin activo',
          );
        }
      }
    }

    user.isActive = isActive;
    await this.userRepository.save(user);

    return this.normalizeSuperUser(user);
  }

  async updateSuperUser(userId: string, isSuperUser: boolean) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    user.isSuperUser = isSuperUser;
    user.roles = this.getRolesForSuperFlag(isSuperUser, user.roles || []);
    await this.userRepository.save(user);

    return this.normalizeSuperUser(user);
  }

  async updateSector(userId: string, sectorId?: string | null) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    if (!sectorId) {
      user.sectorId = null;
      user.sector = null;
      await this.userRepository.save(user);
      return this.normalizeSuperUser(user);
    }

    const sector = await this.sectorRepository.findOneBy({ id: sectorId });
    if (!sector) {
      throw new NotFoundException(`Sector con id ${sectorId} no encontrado`);
    }

    user.sectorId = sector.id;
    user.sector = sector;
    await this.userRepository.save(user);
    return this.normalizeSuperUser(user);
  }

  async updatePassword(userId: string, password: string) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    user.password = bcrypt.hashSync(password, 10);
    await this.userRepository.save(user);

    delete user.password;
    return this.normalizeSuperUser(user);
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
          throw new BadRequestException(
            'No puedes eliminar el ultimo admin activo',
          );
        }
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.query(
        'UPDATE "orders" SET "userId" = NULL WHERE "userId" = $1',
        [userId],
      );
      await queryRunner.manager.query(
        'UPDATE "products" SET "userId" = NULL WHERE "userId" = $1',
        [userId],
      );
      await queryRunner.manager.delete(User, { id: userId });
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error?.code === '23503') {
        throw new BadRequestException(
          'No se pudo eliminar el usuario por dependencias activas',
        );
      }
      this.handleDBErrors(error);
    } finally {
      await queryRunner.release();
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

  private getJwtToken(payload: JwtPayload) {
    return this.jwtService.sign(payload);
  }

  private handleDBErrors(error: any): never {
    if (error instanceof NotFoundException) {
      throw error;
    }

    if (error?.code === '23505') {
      throw new BadRequestException(error.detail);
    }

    console.log(error);
    throw new InternalServerErrorException('Please check server logs');
  }

  private getRolesForSuperFlag(
    isSuperUser: boolean,
    currentRoles: string[] = ['user'],
  ) {
    const normalized = Array.from(new Set((currentRoles || []).filter(Boolean)));
    const withoutLegacy = normalized.filter(
      (role) => role !== LEGACY_SUPER_ROLE && role !== SUPER_USER_ROLE,
    );
    return isSuperUser ? [...withoutLegacy, SUPER_USER_ROLE] : withoutLegacy;
  }

  private normalizeSuperUser(user: User) {
    if (!user) return user;
    const roles = user.roles || [];
    user.isSuperUser =
      user.isSuperUser === true ||
      roles.includes(SUPER_USER_ROLE) ||
      roles.includes(LEGACY_SUPER_ROLE);
    return user;
  }
}

