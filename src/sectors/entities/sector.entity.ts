import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../auth/entities/user.entity';

@Entity({ name: 'sectors' })
export class Sector {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  title: string;

  @Column('text', { default: '#E2E8F0' })
  color: string;

  @Column('bool', { default: true })
  isActive: boolean;

  @Column('int', { default: 1 })
  preparationWeekday: number;

  @Column('int', { nullable: true })
  maxTotalKg: number | null;

  @Column('int', { nullable: true })
  maxItems: number | null;

  @Column('int', { nullable: true, default: 1 })
  maxOrdersPerWeek: number | null;

  @OneToMany(() => User, (user) => user.sector)
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  normalizeFields() {
    this.title = this.title?.trim();
    this.color = this.normalizeColor(this.color);
  }

  private normalizeColor(color?: string) {
    const normalized = color?.trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(normalized || '') ? normalized : '#E2E8F0';
  }
}
