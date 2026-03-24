import { Injectable } from '@nestjs/common';

import { User } from '../../../auth/entities/user.entity';

@Injectable()
export class OrderRulesService {
  isSuperOrderingUser(user: User | null | undefined) {
    return user?.isSuperUser === true || user?.roles?.includes('super-user');
  }

  getWeeklyOrderLimit(user: User | null | undefined) {
    if (!user) return 1;

    if (!user.sector) {
      return 1;
    }

    const parsed = Number(user.sector.maxOrdersPerWeek);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return null;
    }

    return Math.floor(parsed);
  }

  parseOptionalBoolean(value?: string) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }
}
