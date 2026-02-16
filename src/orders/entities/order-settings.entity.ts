import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'order_settings' })
export class OrderSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    example: 10,
    description: 'Maximum total kg allowed per order for regular users',
  })
  @Column('int', { default: 10 })
  maxTotalKg: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
