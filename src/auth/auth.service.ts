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
import {
  CreateUserDto,
  CreateUserWeeklyOrderExceptionDto,
  LoginUserDto,
  UsersQueryDto,
} from './dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { Sector } from '../sectors/entities';
import { Order } from '../orders/entities';
import { UserRole } from './entities/user-role.entity';
import { UserWeeklyOrderException } from './entities/user-weekly-order-exception.entity';

const LEGACY_SUPER_ROLE = 'super';
const SUPER_USER_ROLE = 'super-user';
const ADMIN_ROLE = 'admin';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Sector)
    private readonly sectorRepository: Repository<Sector>,

    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,

    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(UserWeeklyOrderException)
    private readonly weeklyOrderExceptionRepository: Repository<UserWeeklyOrderException>,

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
      await this.syncUserRoles(user.id, user.roles || []);
      delete user.password;

      return {
        user: await this.enrichUserWithWeeklyState(
          this.normalizeSuperUser(await this.mergeRolesFromTable(user)),
        ),
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

    await this.mergeRolesFromTable(user);
    this.normalizeSuperUser(user);
    delete user.password;

    return {
      user: await this.enrichUserWithWeeklyState(user),
      token: this.getJwtToken({ id: user.id }),
    };
  }

  async checkAuthStatus(user: User) {
    await this.mergeRolesFromTable(user);
    this.normalizeSuperUser(user);

    return {
      user: await this.enrichUserWithWeeklyState(user),
      token: this.getJwtToken({ id: user.id }),
    };
  }

  async findAll(queryDto?: UsersQueryDto) {
    const usersQuery = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.sector', 'sector')
      .leftJoin('user.userRoles', 'userRole')
      .distinct(true)
      .orderBy('user.fullName', 'ASC');

    if (queryDto?.role) {
      usersQuery.andWhere('(:role = ANY(user.roles) OR userRole.role = :role)', {
        role: queryDto.role,
      });
    }

    if (queryDto?.sectorId) {
      usersQuery.andWhere('user.sectorId = :sectorId', {
        sectorId: queryDto.sectorId,
      });
    }

    const users = await usersQuery.getMany();
    const usersWithMergedRoles = await this.mergeRolesForUsers(users);
    const normalizedUsers = usersWithMergedRoles.map((listedUser) =>
      this.normalizeSuperUser(listedUser),
    );
    return this.enrichUsersWithWeeklyState(normalizedUsers);
  }

  async updateStatus(userId: string, isActive: boolean, actor: User) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }
    await this.mergeRolesFromTable(user);

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

    return this.enrichUserWithWeeklyState(
      this.normalizeSuperUser(await this.mergeRolesFromTable(user)),
    );
  }

  async updateSuperUser(userId: string, isSuperUser: boolean) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }
    await this.mergeRolesFromTable(user);

    user.isSuperUser = isSuperUser;
    user.roles = this.getRolesForSuperFlag(isSuperUser, user.roles || []);
    await this.userRepository.save(user);
    await this.syncUserRoles(user.id, user.roles || []);

    return this.enrichUserWithWeeklyState(
      this.normalizeSuperUser(await this.mergeRolesFromTable(user)),
    );
  }

  async updateAdminRole(userId: string, isAdmin: boolean, actor: User) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }
    await this.mergeRolesFromTable(user);

    const isCurrentlyAdmin = (user.roles || []).includes(ADMIN_ROLE);
    if (isAdmin === isCurrentlyAdmin) {
      return this.normalizeSuperUser(await this.mergeRolesFromTable(user));
    }

    if (!isAdmin && isCurrentlyAdmin) {
      if (user.id === actor.id) {
        throw new BadRequestException(
          'No puedes quitarte el permiso de admin a ti mismo',
        );
      }

      if (user.isActive) {
        const activeAdmins = await this.countActiveAdmins();
        if (activeAdmins <= 1) {
          throw new BadRequestException(
            'No puedes quitar el ultimo admin activo',
          );
        }
      }
    }

    user.roles = this.toggleRole(user.roles || [], ADMIN_ROLE, isAdmin);
    await this.userRepository.save(user);
    await this.syncUserRoles(user.id, user.roles || []);
    return this.enrichUserWithWeeklyState(
      this.normalizeSuperUser(await this.mergeRolesFromTable(user)),
    );
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
      return this.enrichUserWithWeeklyState(
        this.normalizeSuperUser(await this.mergeRolesFromTable(user)),
      );
    }

    const sector = await this.sectorRepository.findOneBy({ id: sectorId });
    if (!sector) {
      throw new NotFoundException(`Sector con id ${sectorId} no encontrado`);
    }

    user.sectorId = sector.id;
    user.sector = sector;
    await this.userRepository.save(user);
    return this.enrichUserWithWeeklyState(
      this.normalizeSuperUser(await this.mergeRolesFromTable(user)),
    );
  }

  async createWeeklyOrderException(
    userId: string,
    createUserWeeklyOrderExceptionDto: CreateUserWeeklyOrderExceptionDto,
    actor: User,
  ) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    await this.mergeRolesFromTable(user);
    this.normalizeSuperUser(user);
    if (user.isSuperUser) {
      throw new BadRequestException(
        'Los super usuarios no necesitan pedidos extra semanales',
      );
    }

    const weekStartDate = this.formatDateKey(this.getStartOfWeek());
    const reason =
      createUserWeeklyOrderExceptionDto.reason?.trim() ||
      'Aprobado manualmente desde el panel de usuarios';

    const weeklyOrderException = this.weeklyOrderExceptionRepository.create({
      userId: user.id,
      user,
      weekStartDate,
      extraOrders: createUserWeeklyOrderExceptionDto.extraOrders,
      reason,
      grantedByUserId: actor.id,
      grantedByUser: actor,
    });

    await this.weeklyOrderExceptionRepository.save(weeklyOrderException);

    return this.enrichUserWithWeeklyState(user);
  }

  async updatePassword(userId: string, password: string) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    user.password = bcrypt.hashSync(password, 10);
    await this.userRepository.save(user);

    delete user.password;
    return this.enrichUserWithWeeklyState(
      this.normalizeSuperUser(await this.mergeRolesFromTable(user)),
    );
  }

  async removeUser(userId: string, actor: User) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }
    await this.mergeRolesFromTable(user);

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

  private async enrichUserWithWeeklyState(user: User) {
    if (!user?.id) return user;

    const { extraOrdersByUserId, ordersCountByUserId } =
      await this.loadWeeklyOrderState([user.id]);

    return Object.assign(user, {
      currentWeekExtraOrders: extraOrdersByUserId.get(user.id) || 0,
      currentWeekOrdersCount: ordersCountByUserId.get(user.id) || 0,
    });
  }

  private async enrichUsersWithWeeklyState(users: User[]) {
    if (!users.length) return users;

    const userIds = users.map((user) => user.id).filter(Boolean);
    const { extraOrdersByUserId, ordersCountByUserId } =
      await this.loadWeeklyOrderState(userIds);

    return users.map((user) =>
      Object.assign(user, {
        currentWeekExtraOrders: extraOrdersByUserId.get(user.id) || 0,
        currentWeekOrdersCount: ordersCountByUserId.get(user.id) || 0,
      }),
    );
  }

  private async loadWeeklyOrderState(userIds: string[]) {
    if (!userIds.length) {
      return {
        extraOrdersByUserId: new Map<string, number>(),
        ordersCountByUserId: new Map<string, number>(),
      };
    }

    const startOfWeek = this.getStartOfWeek();
    const weekStartDate = this.formatDateKey(startOfWeek);

    const [ordersCountRaw, extraOrdersRaw] = await Promise.all([
      this.orderRepository.query(
        `
          SELECT "userId", COUNT(*)::int AS "count"
          FROM "orders"
          WHERE "userId" = ANY($1)
            AND "createdAt" >= $2
          GROUP BY "userId"
        `,
        [userIds, startOfWeek],
      ),
      this.weeklyOrderExceptionRepository.query(
        `
          SELECT "userId", COALESCE(SUM("extraOrders"), 0)::int AS "extraOrders"
          FROM "user_weekly_order_exceptions"
          WHERE "userId" = ANY($1)
            AND "weekStartDate" = $2::date
          GROUP BY "userId"
        `,
        [userIds, weekStartDate],
      ),
    ]);

    const ordersCountByUserId = new Map<string, number>(
      (ordersCountRaw || []).map((row: { userId: string; count: number | string }) => [
        row.userId,
        Number(row.count || 0),
      ]),
    );
    const extraOrdersByUserId = new Map<string, number>(
      (
        extraOrdersRaw || []
      ).map((row: { userId: string; extraOrders: number | string }) => [
        row.userId,
        Number(row.extraOrders || 0),
      ]),
    );

    return {
      extraOrdersByUserId,
      ordersCountByUserId,
    };
  }

  private async countActiveAdmins(): Promise<number> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.userRoles', 'userRole')
      .where('(:role = ANY(user.roles) OR userRole.role = :role)', {
        role: ADMIN_ROLE,
      })
      .andWhere('user.isActive = true')
      .distinct(true)
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

  private toggleRole(currentRoles: string[], role: string, enabled: boolean) {
    const normalized = Array.from(new Set((currentRoles || []).filter(Boolean)));
    const withoutRole = normalized.filter((candidate) => candidate !== role);
    return enabled ? [...withoutRole, role] : withoutRole;
  }

  private getStartOfWeek(reference = new Date()) {
    const startOfWeek = new Date(reference);
    startOfWeek.setHours(0, 0, 0, 0);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    return startOfWeek;
  }

  private formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async syncUserRoles(userId: string, roles: string[]) {
    const uniqueRoles = Array.from(
      new Set((roles || []).map((role) => role?.trim()).filter(Boolean)),
    );
    await this.userRoleRepository.delete({ userId });
    if (!uniqueRoles.length) return;

    const records = uniqueRoles.map((role) =>
      this.userRoleRepository.create({ userId, role }),
    );
    await this.userRoleRepository.save(records);
  }

  private async mergeRolesFromTable(user: User) {
    if (!user?.id) return user;

    const rolesFromTable = await this.userRoleRepository.find({
      where: { userId: user.id },
      select: { role: true },
    });
    if (!rolesFromTable.length) return user;

    user.roles = Array.from(
      new Set([...(user.roles || []), ...rolesFromTable.map((entry) => entry.role)]),
    );
    return user;
  }

  private async mergeRolesForUsers(users: User[]) {
    if (!users.length) return users;
    const userIds = users.map((user) => user.id).filter(Boolean);
    if (!userIds.length) return users;

    const roleRows = await this.userRoleRepository
      .createQueryBuilder('userRole')
      .select(['userRole.userId AS "userId"', 'userRole.role AS "role"'])
      .where('userRole.userId IN (:...userIds)', { userIds })
      .getRawMany<{ userId: string; role: string }>();

    const roleMap = new Map<string, string[]>();
    for (const row of roleRows) {
      if (!row?.userId || !row?.role) continue;
      const current = roleMap.get(row.userId) || [];
      current.push(row.role);
      roleMap.set(row.userId, current);
    }

    return users.map((user) => {
      const tableRoles = roleMap.get(user.id) || [];
      user.roles = Array.from(new Set([...(user.roles || []), ...tableRoles]));
      return user;
    });
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
