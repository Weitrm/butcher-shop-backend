import { Product } from '../../../products/entities';

export interface ProductReadRepository {
  findByIds(ids: string[]): Promise<Product[]>;
}
