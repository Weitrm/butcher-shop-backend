import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  ILike,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';

import { validate as isUUID } from 'uuid';
import { ProductImage, Product } from './entities';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger('ProductsService');

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly dataSource: DataSource,
  ) {}

  async create(createProductDto: CreateProductDto, user: User) {
    try {
      const { images = [], ...productDetails } = createProductDto;

      const product = this.productRepository.create({
        ...productDetails,
        images: images.map((image) =>
          this.productImageRepository.create({ url: image }),
        ),
        user,
      });

      await this.productRepository.save(product);

      return { ...product, images };
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async findAll(
    paginationDto: PaginationDto,
    includeInactive = false,
    visibleSlugs?: string[],
  ) {
    const {
      limit = 10,
      offset = 0,
      minPrice,
      maxPrice,
      q: query,
      isActive,
    } = paginationDto;

    const activeFilter = includeInactive
      ? isActive === 'true'
        ? true
        : isActive === 'false'
        ? false
        : undefined
      : true;

    const priceWhere =
      minPrice !== undefined && maxPrice !== undefined
        ? Between(minPrice, maxPrice)
        : minPrice !== undefined
        ? MoreThanOrEqual(minPrice)
        : maxPrice !== undefined
        ? LessThanOrEqual(maxPrice)
        : undefined;

    const normalizedVisibleSlugs = (visibleSlugs || [])
      .map((slug) => slug?.trim().toLowerCase())
      .filter((slug) => Boolean(slug));
    const slugWhere =
      normalizedVisibleSlugs.length > 0
        ? In(normalizedVisibleSlugs)
        : visibleSlugs
        ? In(['__no_matches__'])
        : undefined;

    const products = await this.productRepository.find({
      take: limit,
      skip: offset,
      relations: {
        images: true,
      },
      order: {
        id: 'ASC',
      },
      where: {
        price: priceWhere,
        title: query ? ILike(`%${query}%`) : undefined,
        isActive: activeFilter,
        slug: slugWhere,
      },
    });

    const totalProducts = await this.productRepository.count({
      where: {
        price: priceWhere,
        title: query ? ILike(`%${query}%`) : undefined,
        isActive: activeFilter,
        slug: slugWhere,
      },
    });

    return {
      count: totalProducts,
      pages: Math.ceil(totalProducts / limit),
      products: products.map((product) => ({
        ...product,
        images: product.images.map((img) => img.url),
      })),
    };
  }

  async findAllForShop(paginationDto: PaginationDto, user: User) {
    const canViewHidden =
      user?.isSuperUser === true ||
      user?.roles?.includes('super-user') ||
      user?.roles?.includes('super');
    if (canViewHidden) {
      return this.findAll(paginationDto, true);
    }

    const authUser = await this.userRepository.findOne({
      where: { id: user.id },
      relations: { sector: true },
    });
    const sector = authUser?.sector;
    const allowedSlugs =
      sector && !sector.allowAllProducts
        ? sector.allowedProductSlugs || []
        : undefined;

    return this.findAll(paginationDto, false, allowedSlugs);
  }

  async findOne(term: string, onlyActive = false) {
    let product: Product;

    if (isUUID(term)) {
      const where: { id: string; isActive?: boolean } = { id: term };
      if (onlyActive) {
        where.isActive = true;
      }
      product = await this.productRepository.findOneBy(where);
    } else {
      const queryBuilder = this.productRepository.createQueryBuilder('prod');
      queryBuilder.where('UPPER(title) =:title or slug =:slug', {
        title: term.toUpperCase(),
        slug: term.toLowerCase(),
      });

      if (onlyActive) {
        queryBuilder.andWhere('prod.isActive = :isActive', { isActive: true });
      }

      product = await queryBuilder
        .leftJoinAndSelect('prod.images', 'prodImages')
        .getOne();
    }

    if (!product) throw new NotFoundException(`Product with ${term} not found`);

    return product;
  }

  async findOnePlain(term: string, onlyActive = false) {
    const { images = [], ...rest } = await this.findOne(term, onlyActive);
    return {
      ...rest,
      images: images.map((image) => image.url),
    };
  }

  async findOneForShop(term: string, user: User) {
    const canViewHidden =
      user?.isSuperUser === true ||
      user?.roles?.includes('super-user') ||
      user?.roles?.includes('super');
    const product = await this.findOnePlain(term, !canViewHidden);

    if (canViewHidden) {
      return product;
    }

    const authUser = await this.userRepository.findOne({
      where: { id: user.id },
      relations: { sector: true },
    });
    const sector = authUser?.sector;

    if (sector && !sector.allowAllProducts) {
      const allowed = new Set(
        (sector.allowedProductSlugs || []).map((slug) => slug.toLowerCase()),
      );
      if (!allowed.has(product.slug?.toLowerCase())) {
        throw new NotFoundException(`Product with ${term} not found`);
      }
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, user: User) {
    const { images, ...toUpdate } = updateProductDto;

    const product = await this.productRepository.preload({ id, ...toUpdate });

    if (!product)
      throw new NotFoundException(`Product with id: ${id} not found`);

    // Create query runner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (images) {
        await queryRunner.manager.delete(ProductImage, { product: { id } });

        product.images = images.map((image) =>
          this.productImageRepository.create({ url: image }),
        );
      }

      // await this.productRepository.save( product );
      product.user = user;

      await queryRunner.manager.save(product);

      await queryRunner.commitTransaction();
      await queryRunner.release();

      return this.findOnePlain(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.handleDBExceptions(error);
    }
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    await this.productRepository.remove(product);
  }

  private handleDBExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);

    this.logger.error(error);
    // console.log(error)
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }

  async deleteAllProducts() {
    const query = this.productRepository.createQueryBuilder('product');

    try {
      return await query.delete().where({}).execute();
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }
}
