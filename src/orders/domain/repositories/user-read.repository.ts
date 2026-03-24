import { User } from '../../../auth/entities/user.entity';

export interface UserReadRepository {
  findByIdWithSector(userId: string): Promise<User | null>;
}
