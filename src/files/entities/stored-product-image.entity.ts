import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'stored_product_images' })
export class StoredProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  fileName: string;

  @Column('text')
  mimeType: string;

  @Column('bytea')
  data: Buffer;

  @CreateDateColumn()
  createdAt: Date;
}
