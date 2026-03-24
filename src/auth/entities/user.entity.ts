import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../products/entities';
import { Order } from '../../orders/entities/order.entity';
import { Sector } from '../../sectors/entities';
import { UserWeeklyOrderException } from './user-weekly-order-exception.entity';
import { UserRole } from './user-role.entity';


@Entity('users')
export class User {
    
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('text', {
        unique: true
    })
    employeeNumber: string;

    @Column('text', {
        unique: true
    })
    nationalId: string;

    @Column('text', {
        select: false
    })
    password: string;

    @Column('text')
    fullName: string;

    @Column('bool', {
        default: true
    })
    isActive: boolean;

    @Column('bool', {
        default: false
    })
    isSuperUser: boolean;

    roles: string[];

    @Column('uuid', { nullable: true })
    sectorId: string | null;

    @ManyToOne(() => Sector, (sector) => sector.users, {
        eager: true,
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'sectorId' })
    sector: Sector | null;

    @OneToMany(
        () => Product,
        ( product ) => product.user
    )
    product: Product[];

    @OneToMany(
        () => Order,
        ( order ) => order.user
    )
    orders: Order[];

    @OneToMany(
        () => UserWeeklyOrderException,
        (weeklyOrderException) => weeklyOrderException.user,
    )
    weeklyOrderExceptions: UserWeeklyOrderException[];

    @OneToMany(
        () => UserRole,
        (userRole) => userRole.user,
    )
    userRoles: UserRole[];


    @BeforeInsert()
    checkFieldsBeforeInsert() {
        this.employeeNumber = this.employeeNumber?.trim();
        this.nationalId = this.nationalId?.trim();
        this.fullName = this.fullName?.trim();
    }

    @BeforeUpdate()
    checkFieldsBeforeUpdate() {
        this.checkFieldsBeforeInsert();   
    }

}
