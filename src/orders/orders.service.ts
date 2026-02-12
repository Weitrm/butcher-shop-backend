import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';

import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { Order, OrderItem, OrderStatus } from './entities';
import { Product } from '../products/entities';
import { User } from '../auth/entities/user.entity';
import { PaginationDto } from '../common/dtos/pagination.dto';

const MAX_TOTAL_KG = 10;
const MAX_ITEMS = 2;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('OrdersService');

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    private readonly dataSource: DataSource,
  ) {}

  async create(createOrderDto: CreateOrderDto, user: User) {
    const { items } = createOrderDto;

    if (!user.isActive) {
      throw new ForbiddenException(
        'Tu cuenta esta deshabilitada para hacer pedidos. Comunicate con un supervisor',
      );
    }

    if (!items?.length) {
      throw new BadRequestException('El pedido debe contener productos');
    }

    if (items.length > MAX_ITEMS) {
      throw new BadRequestException('Solo se permiten 2 productos por pedido');
    }

    const productIds = items.map((item) => item.productId);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      throw new BadRequestException('No se pueden repetir productos en el pedido');
    }

    const products = await this.productRepository.findBy({
      id: In([...uniqueIds]),
    });

    if (products.length !== uniqueIds.size) {
      throw new NotFoundException('Uno o mas productos no existen');
    }

    const productMap = new Map(products.map((product) => [product.id, product]));

    let totalKg = 0;
    let totalPrice = 0;

    const orderItems = items.map((item) => {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new NotFoundException(`Producto ${item.productId} no encontrado`);
      }

      if (!product.isActive) {
        throw new BadRequestException(
          `El producto ${product.title} no esta disponible`,
        );
      }

      if (product.stock < item.kg) {
        throw new BadRequestException(
          `Stock insuficiente para ${product.title}`,
        );
      }

      totalKg += item.kg;
      const unitPrice = product.price;
      const subtotal = unitPrice * item.kg;
      totalPrice += subtotal;

      return this.orderItemRepository.create({
        product,
        kg: item.kg,
        unitPrice,
        subtotal,
      });
    });

    if (totalKg > MAX_TOTAL_KG) {
      throw new BadRequestException('El total no puede superar los 10 kg');
    }

    try {
      const order = this.orderRepository.create({
        user,
        items: orderItems,
        totalKg,
        totalPrice,
        status: OrderStatus.Pending,
      });

      const savedOrder = await this.orderRepository.save(order);

      const fullOrder = await this.orderRepository.findOne({
        where: { id: savedOrder.id, user: { id: user.id } },
      });

      return this.mapOrderResponse(fullOrder);
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async findAllByUser(user: User, paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;
    const [orders, totalOrders] = await this.orderRepository.findAndCount({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      count: totalOrders,
      pages: Math.ceil(totalOrders / limit),
      orders: orders.map((order) => this.mapOrderResponse(order)),
    };
  }

  async findAllAdmin(queryDto: OrdersQueryDto) {
    const {
      limit = 10,
      offset = 0,
      scope = 'all',
      user,
      product,
    } = queryDto;
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .orderBy('order.createdAt', 'DESC')
      .distinct(true)
      .take(safeLimit)
      .skip(safeOffset);

    if (scope === 'week' || scope === 'history') {
      const startOfWeek = this.getStartOfWeek();
      if (scope === 'week') {
        queryBuilder.andWhere('order.createdAt >= :startOfWeek', {
          startOfWeek,
        });
      } else {
        queryBuilder.andWhere('order.createdAt < :startOfWeek', {
          startOfWeek,
        });
      }
    }

    if (user) {
      queryBuilder.andWhere(
        '(user.fullName ILIKE :user OR user.employeeNumber ILIKE :user OR user.nationalId ILIKE :user)',
        { user: `%${user}%` },
      );
    }

    if (product) {
      queryBuilder.andWhere(
        '(product.title ILIKE :product OR product.slug ILIKE :product)',
        { product: `%${product}%` },
      );
    }

    const [orders, totalOrders] = await queryBuilder.getManyAndCount();

    return {
      count: totalOrders,
      pages: Math.ceil(totalOrders / safeLimit),
      orders: orders.map((order) => this.mapOrderResponse(order, true)),
    };
  }

  async updateStatus(id: string, updateOrderStatusDto: UpdateOrderStatusDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(Order, {
        where: { id },
        relations: {
          items: {
            product: true,
          },
        },
      });

      if (!order) {
        throw new NotFoundException(`Pedido con id ${id} no encontrado`);
      }

      const nextStatus = updateOrderStatusDto.status;

      if (order.status === nextStatus) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return this.mapOrderResponse(order, true);
      }

      if (
        order.status === OrderStatus.Completed &&
        nextStatus !== OrderStatus.Completed
      ) {
        throw new BadRequestException(
          'No se puede cambiar un pedido completado',
        );
      }

      if (nextStatus === OrderStatus.Completed) {
        for (const item of order.items || []) {
          if (!item.product) {
            throw new BadRequestException('Producto no encontrado en el pedido');
          }
          const product = await queryRunner.manager.findOne(Product, {
            where: { id: item.product.id },
          });
          if (!product) {
            throw new BadRequestException('Producto no encontrado en el pedido');
          }
          if (product.stock < item.kg) {
            throw new BadRequestException(
              `Stock insuficiente para ${item.product.title}`,
            );
          }
        }

        for (const item of order.items || []) {
          const product = await queryRunner.manager.findOne(Product, {
            where: { id: item.product.id },
          });
          if (!product) {
            throw new BadRequestException('Producto no encontrado en el pedido');
          }
          product.stock = product.stock - item.kg;
          await queryRunner.manager.save(product);
        }
      }

      order.status = nextStatus;
      const updatedOrder = await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();
      await queryRunner.release();

      return this.mapOrderResponse(updatedOrder, true);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.handleDBExceptions(error);
    }
  }

  async getDashboardStats(paginationDto: PaginationDto) {
    const { limit = 5, offset = 0, q: query, range = 'week' } = paginationDto;
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);
    const safeRange =
      range === 'month' || range === 'year' || range === 'week'
        ? range
        : 'week';

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = this.getStartOfWeek();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastSevenDays = new Date(now);
    startOfLastSevenDays.setHours(0, 0, 0, 0);
    startOfLastSevenDays.setDate(startOfLastSevenDays.getDate() - 6);

    let activityStart = new Date(now);
    let activityUnit: 'day' | 'month' = 'day';
    let activityPoints = 7;

    if (safeRange === 'month') {
      activityPoints = 30;
      activityStart = new Date(now);
      activityStart.setHours(0, 0, 0, 0);
      activityStart.setDate(activityStart.getDate() - (activityPoints - 1));
    } else if (safeRange === 'year') {
      activityUnit = 'month';
      activityPoints = 12;
      activityStart = new Date(now.getFullYear(), now.getMonth(), 1);
      activityStart.setMonth(activityStart.getMonth() - (activityPoints - 1));
    } else {
      activityStart = new Date(startOfLastSevenDays);
    }

    const [dayCount, weekCount, monthCount] = await Promise.all([
      this.orderRepository.count({
        where: {
          createdAt: MoreThanOrEqual(startOfDay),
          status: Not(OrderStatus.Cancelled),
        },
      }),
      this.orderRepository.count({
        where: {
          createdAt: MoreThanOrEqual(startOfWeek),
          status: Not(OrderStatus.Cancelled),
        },
      }),
      this.orderRepository.count({
        where: {
          createdAt: MoreThanOrEqual(startOfMonth),
          status: Not(OrderStatus.Cancelled),
        },
      }),
    ]);

    const topProductsQuery = this.orderItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .innerJoin('item.product', 'product')
      .select('product.id', 'productId')
      .addSelect('product.title', 'title')
      .addSelect('product.slug', 'slug')
      .addSelect('SUM(item.kg)', 'totalKg')
      .addSelect('COUNT(DISTINCT order.id)', 'totalOrders')
      .where('order.createdAt >= :startOfLastSevenDays', {
        startOfLastSevenDays,
      })
      .andWhere('order.status != :cancelled', {
        cancelled: OrderStatus.Cancelled,
      });

    if (query) {
      topProductsQuery.andWhere(
        '(product.title ILIKE :q OR product.slug ILIKE :q)',
        { q: `%${query}%` },
      );
    }

    const topProductsCountQuery = this.orderItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .innerJoin('item.product', 'product')
      .select('COUNT(DISTINCT product.id)', 'count')
      .where('order.createdAt >= :startOfLastSevenDays', {
        startOfLastSevenDays,
      })
      .andWhere('order.status != :cancelled', {
        cancelled: OrderStatus.Cancelled,
      });

    if (query) {
      topProductsCountQuery.andWhere(
        '(product.title ILIKE :q OR product.slug ILIKE :q)',
        { q: `%${query}%` },
      );
    }

    const topProductsCountRaw = await topProductsCountQuery.getRawOne();
    const totalTopProducts = Number(topProductsCountRaw?.count || 0);

    const topProductsRaw = await topProductsQuery
      .groupBy('product.id')
      .orderBy('"totalKg"', 'DESC')
      .limit(safeLimit)
      .offset(safeOffset)
      .getRawMany();

    const topProducts = topProductsRaw.map((row) => ({
      productId: row.productId,
      title: row.title,
      slug: row.slug,
      totalKg: Number(row.totalKg),
      totalOrders: Number(row.totalOrders),
    }));

    const activityRaw = await this.orderRepository
      .createQueryBuilder('order')
      .select(`DATE_TRUNC('${activityUnit}', order.createdAt)`, 'bucket')
      .addSelect('SUM(order.totalKg)', 'totalKg')
      .addSelect('COUNT(order.id)', 'totalOrders')
      .where('order.createdAt >= :activityStart', { activityStart })
      .andWhere('order.status != :cancelled', {
        cancelled: OrderStatus.Cancelled,
      })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany();

    const activityMap = new Map<
      string,
      { totalKg: number; totalOrders: number }
    >();

    activityRaw.forEach((row) => {
      const bucketValue =
        row.bucket instanceof Date ? row.bucket : new Date(row.bucket);
      const bucketKey =
        activityUnit === 'day'
          ? this.formatDateKey(bucketValue)
          : this.formatMonthKey(bucketValue);
      activityMap.set(bucketKey, {
        totalKg: Number(row.totalKg || 0),
        totalOrders: Number(row.totalOrders || 0),
      });
    });

    const activity = Array.from({ length: activityPoints }, (_, index) => {
      const bucketDate = new Date(activityStart);
      if (activityUnit === 'day') {
        bucketDate.setDate(activityStart.getDate() + index);
      } else {
        bucketDate.setMonth(activityStart.getMonth() + index);
      }

      const bucketKey =
        activityUnit === 'day'
          ? this.formatDateKey(bucketDate)
          : this.formatMonthKey(bucketDate);
      const bucketStats = activityMap.get(bucketKey) || {
        totalKg: 0,
        totalOrders: 0,
      };

      return {
        date: bucketKey,
        ...bucketStats,
      };
    });

    const recentOrders = await this.orderRepository.find({
      order: { createdAt: 'DESC' },
      take: 3,
    });

    return {
      orderCounts: {
        day: dayCount,
        week: weekCount,
        month: monthCount,
      },
      activity,
      topProducts,
      topProductsCount: totalTopProducts,
      topProductsPages: Math.ceil(totalTopProducts / safeLimit),
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        status: order.status,
        totalKg: order.totalKg,
        totalPrice: order.totalPrice,
        createdAt: order.createdAt,
        user: order.user
          ? {
              id: order.user.id,
              fullName: order.user.fullName,
              employeeNumber: order.user.employeeNumber,
              nationalId: order.user.nationalId,
            }
          : null,
        items: (order.items || []).map((item) => ({
          id: item.id,
          kg: item.kg,
          product: item.product
            ? {
                id: item.product.id,
                title: item.product.title,
                slug: item.product.slug,
              }
            : null,
        })),
      })),
    };
  }

  private mapOrderResponse(order: Order | null, includeUser = false) {
    if (!order) return null;

    const { items = [], user, ...rest } = order;
    const mappedUser = includeUser && user
      ? {
          id: user.id,
          fullName: user.fullName,
          employeeNumber: user.employeeNumber,
          nationalId: user.nationalId,
        }
      : undefined;

    return {
      ...rest,
      ...(includeUser ? { user: mappedUser } : {}),
      items: items.map((item) => {
        const { product, ...itemRest } = item;
        const { images = [], user: _user, ...productRest } = product || {};

        return {
          ...itemRest,
          product: product
            ? {
                ...productRest,
                images: images.map((img) => img.url),
              }
            : null,
        };
      }),
    };
  }

  private handleDBExceptions(error: any) {
    this.logger.error(error);
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }

  private getStartOfWeek(reference = new Date()) {
    const startOfWeek = new Date(reference);
    startOfWeek.setHours(0, 0, 0, 0);
    const dayOfWeek = startOfWeek.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
    return startOfWeek;
  }

  private formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatMonthKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}
