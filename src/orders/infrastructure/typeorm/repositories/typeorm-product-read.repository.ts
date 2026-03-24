import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from '../../../../products/entities';
import { ProductReadRepository } from '../../../domain/repositories/product-read.repository';

@Injectable()
export class TypeOrmProductReadRepository implements ProductReadRepository {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async findByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect(
        'product.productSectorVisibilities',
        'productSectorVisibility',
      )
      .where('product.id IN (:...ids)', { ids })
      .getMany();
  }
}
