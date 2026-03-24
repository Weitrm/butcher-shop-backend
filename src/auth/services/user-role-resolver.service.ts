import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user-role.entity';

const SUPER_USER_ROLE = 'super-user';
const USER_ROLE = 'user';

@Injectable()
export class UserRoleResolverService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
  ) {}

  async resolveAndSyncUserRoles(user: User) {
    if (!user) return user;
    if (!user.id) return this.normalizeSuperUser(user);

    const currentRoles = this.normalizeRoleList(user.roles || []);
    const rolesFromTable = await this.userRoleRepository.find({
      where: { userId: user.id },
      select: { role: true },
    });
    const tableRoles = this.normalizeRoleList(
      rolesFromTable.map((entry) => entry.role),
    );
    const mergedRoles = this.normalizeRoleList([...currentRoles, ...tableRoles]);
    const resolvedRoles = this.repairRolesIfNeeded(user, mergedRoles);
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
      user.roles = this.repairRolesIfNeeded(
        user,
        this.normalizeRoleList([...(user.roles || []), ...tableRoles]),
      );
      return this.normalizeSuperUser(user);
    });
  }

  async replaceUserRoles(userId: string, roles: string[]) {
    const uniqueRoles = this.normalizeRoleList(roles);
    await this.userRoleRepository.delete({ userId });
    if (!uniqueRoles.length) return;

    const records = uniqueRoles.map((role) =>
      this.userRoleRepository.create({ userId, role }),
    );
    await this.userRoleRepository.save(records);
  }

  getRolesForSuperFlag(isSuperUser: boolean, currentRoles: string[] = [USER_ROLE]) {
    const normalized = this.normalizeRoleList(currentRoles);
    const withoutSuper = normalized.filter(
      (role) => role !== SUPER_USER_ROLE,
    );
    return isSuperUser ? [...withoutSuper, SUPER_USER_ROLE] : withoutSuper;
  }

  toggleRole(currentRoles: string[], role: string, enabled: boolean) {
    const normalized = this.normalizeRoleList(currentRoles);
    const normalizedTargetRole = this.normalizeRole(role);
    const withoutRole = normalized.filter(
      (candidate) => candidate !== normalizedTargetRole,
    );
    return enabled ? [...withoutRole, normalizedTargetRole] : withoutRole;
  }

  normalizeSuperUser(user: User) {
    if (!user) return user;
    const roles = user.roles || [];
    user.isSuperUser = user.isSuperUser === true || roles.includes(SUPER_USER_ROLE);
    return user;
  }

  private repairRolesIfNeeded(user: User, roles: string[]) {
    const normalizedRoles = this.normalizeRoleList(roles);

    if (user.isSuperUser && !normalizedRoles.includes(SUPER_USER_ROLE)) {
      normalizedRoles.push(SUPER_USER_ROLE);
    }

    if (normalizedRoles.length === 0) {
      normalizedRoles.push(USER_ROLE);
    }

    return normalizedRoles;
  }

  private normalizeRole(value: string) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'super') return SUPER_USER_ROLE;
    return normalized;
  }

  private normalizeRoleList(values: string[]) {
    return Array.from(
      new Set((values || []).map((value) => this.normalizeRole(value)).filter(Boolean)),
    );
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
