import { BeforeInsert, BeforeUpdate, Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import { ProductImage } from './';
import { User } from '../../auth/entities/user.entity';
import { ProductSectorVisibility } from './product-sector-visibility.entity';

@Entity({ name: 'products' })
export class Product {

    @ApiProperty({
        example: 'cd533345-f1f3-48c9-a62e-7dc2da50c8f8',
        description: 'Product ID',
        uniqueItems: true
    })
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty({
        example: 'T-Shirt Teslo',
        description: 'Product Title',
        uniqueItems: true
    })
    @Column('text', {
        unique: true,
    })
    title: string;

    @ApiProperty({
        example: 0,
        description: 'Product price',
    })
    @Column('float',{
        default: 0
    })
    price: number;

    @ApiProperty({
        example: 'Anim reprehenderit nulla in anim mollit minim irure commodo.',
        description: 'Product description',
        default: null,
    })
    @Column({
        type: 'text',
        nullable: true
    })
    description: string;

    @ApiProperty({
        example: 't_shirt_teslo',
        description: 'Product SLUG - for SEO',
        uniqueItems: true
    })
    @Column('text', {
        unique: true
    })
    slug: string;

    @ApiProperty({
        example: 10,
        description: 'Product stock',
        default: 0
    })
    @Column('int', {
        default: 0
    })
    stock: number;

    @ApiProperty({
        example: true,
        description: 'Product availability status',
        default: true
    })
    @Column('bool', {
        default: true
    })
    isActive: boolean;

    @ApiProperty({
        example: 5,
        description: 'Maximum kg allowed per order for this product',
        default: 10,
    })
    @Column('int', {
        default: 10,
    })
    maxKgPerOrder: number;

    @ApiProperty({
        example: false,
        description: 'Whether this product can be ordered as boxes',
        default: false,
    })
    @Column('bool', {
        default: false,
    })
    allowBoxes: boolean;

    @ApiProperty({
        example: true,
        description: 'Whether this product is visible to all sectors in the new sector-based visibility model',
        default: true,
    })
    @Column('bool', {
        default: true,
    })
    allowAllSectors: boolean;

    @ApiProperty({
        example: ['f88f9880-2f58-470f-90d2-0f7db24695c2'],
        description: 'Explicit sector IDs that can see this product when allowAllSectors is false.',
        required: false,
    })
    @Column('uuid', {
        array: true,
        default: [],
    })
    allowedSectorIds: string[];

    // images
    @ApiProperty()
    @OneToMany(
        () => ProductImage,
        (productImage) => productImage.product,
        { cascade: true, eager: true }
    )
    images?: ProductImage[];

    @OneToMany(
        () => ProductSectorVisibility,
        (productSectorVisibility) => productSectorVisibility.product,
    )
    productSectorVisibilities?: ProductSectorVisibility[];


    @ManyToOne(
        () => User,
        ( user ) => user.product,
        {
            eager: true,
            nullable: true,
            onDelete: 'SET NULL',
        }
    )
    user: User | null


    @BeforeInsert()
    checkSlugInsert() {

        if ( !this.slug ) {
            this.slug = this.title;
        }

        this.slug = this.slug
            .toLowerCase()
            .replaceAll(' ','_')
            .replaceAll("'",'')
        this.allowedSectorIds = this.normalizeSectorIds(this.allowedSectorIds)

    }

    @BeforeUpdate()
    checkSlugUpdate() {
        this.slug = this.slug
            .toLowerCase()
            .replaceAll(' ','_')
            .replaceAll("'",'')
        this.allowedSectorIds = this.normalizeSectorIds(this.allowedSectorIds)
    }

    private normalizeSectorIds(sectorIds?: string[]) {
        if (!Array.isArray(sectorIds)) return []

        return Array.from(
            new Set(
                sectorIds
                    .map((sectorId) => sectorId?.trim())
                    .filter((sectorId) => Boolean(sectorId)),
            ),
        )
    }

}
