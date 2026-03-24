import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user-role.entity';

const LEGACY_SUPER_ROLE = 'super';
const SUPER_USER_ROLE = 'super-user';
const ADMIN_ROLE = 'admin';
const USER_ROLE = 'user';

@Injectable()
export class UserRoleResolverService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
  ) {}

  async resolveAndSyncUserRoles(user: User) {
    if (!user) return user;
    if (!user.id) return this.normalizeSuperUser(user);

    const currentRoles = user.roles || [];
    const rolesFromTable = await this.userRoleRepository.find({
      where: { userId: user.id },
      select: { role: true },
    });
    const tableRoles = rolesFromTable.map((entry) => entry.role);
    const legacyRoles = await this.loadLegacyRoles(user.id);
    const mergedRoles = Array.from(
      new Set([...currentRoles, ...tableRoles, ...legacyRoles]),
    );
    const resolvedRoles = await this.repairRolesIfNeeded(user, mergedRoles);
    user.roles = resolvedRoles;

    if (!this.haveSameRoleSet(tableRoles, resolvedRoles)) {
      await this.replaceUserRoles(user.id, resolvedRoles);
    }

    return this.normalizeSuperUser(user);
  }

  async resolveUsersWithTableRoles(users: User[]) {
    if (!users.length) return users;

    const userIds = users.map((user) => user.id).filter(Boolean);
    if (!userIds.length) return users.map((user) => this.normalizeSuperUser(user));

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
      return this.normalizeSuperUser(user);
    });
  }

  async replaceUserRoles(userId: string, roles: string[]) {
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

  getRolesForSuperFlag(isSuperUser: boolean, currentRoles: string[] = [USER_ROLE]) {
    const normalized = Array.from(new Set((currentRoles || []).filter(Boolean)));
    const withoutLegacy = normalized.filter(
      (role) => role !== LEGACY_SUPER_ROLE && role !== SUPER_USER_ROLE,
    );
    return isSuperUser ? [...withoutLegacy, SUPER_USER_ROLE] : withoutLegacy;
  }

  toggleRole(currentRoles: string[], role: string, enabled: boolean) {
    const normalized = Array.from(new Set((currentRoles || []).filter(Boolean)));
    const withoutRole = normalized.filter((candidate) => candidate !== role);
    return enabled ? [...withoutRole, role] : withoutRole;
  }

  normalizeSuperUser(user: User) {
    if (!user) return user;
    const roles = user.roles || [];
    user.isSuperUser =
      user.isSuperUser === true ||
      roles.includes(SUPER_USER_ROLE) ||
      roles.includes(LEGACY_SUPER_ROLE);
    return user;
  }

  private async loadLegacyRoles(userId: string): Promise<string[]> {
    try {
      const rows = await this.userRepository.query(
        `SELECT "roles" FROM "users" WHERE "id" = $1 LIMIT 1`,
        [userId],
      );
      const roles = rows?.[0]?.roles;
      if (!Array.isArray(roles)) return [];
      return Array.from(
        new Set(
          roles
            .map((role: unknown) => String(role || '').trim())
            .filter((role: string) => Boolean(role)),
        ),
      );
    } catch {
      return [];
    }
  }

  private async repairRolesIfNeeded(user: User, roles: string[]) {
    const normalizedRoles = Array.from(
      new Set(
        (roles || [])
          .map((role) => String(role || '').trim().toLowerCase())
          .filter(Boolean),
      ),
    );

    if (user.isSuperUser && !normalizedRoles.includes(SUPER_USER_ROLE)) {
      normalizedRoles.push(SUPER_USER_ROLE);
    }

    if (normalizedRoles.length === 0) {
      normalizedRoles.push(USER_ROLE);
    }

    const isProd = process.env.STAGE === 'prod';
    if (!isProd && !normalizedRoles.includes(ADMIN_ROLE)) {
      const activeAdmins = await this.countActiveAdmins();
      if (activeAdmins === 0) {
        normalizedRoles.push(ADMIN_ROLE);
      }
    }

    return normalizedRoles;
  }

  private async countActiveAdmins(): Promise<number> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.userRoles', 'userRole')
      .where('userRole.role = :role', {
        role: ADMIN_ROLE,
      })
      .andWhere('user.isActive = true')
      .distinct(true)
      .getCount();
  }

  private haveSameRoleSet(left: string[], right: string[]) {
    const leftSet = new Set((left || []).map((role) => role?.trim()).filter(Boolean));
    const rightSet = new Set((right || []).map((role) => role?.trim()).filter(Boolean));
    if (leftSet.size !== rightSet.size) return false;
    for (const role of leftSet) {
      if (!rightSet.has(role)) return false;
    }
    return true;
  }
}
