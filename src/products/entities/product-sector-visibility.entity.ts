import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Product } from './product.entity';
import { Sector } from '../../sectors/entities';

@Entity({ name: 'product_sector_visibility' })
export class ProductSectorVisibility {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  productId: string;

  @Column('uuid')
  sectorId: string;

  @ManyToOne(() => Product, (product) => product.productSectorVisibilities, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Sector, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sectorId' })
  sector: Sector;
}
