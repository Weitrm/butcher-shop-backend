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
  Between,
  DataSource,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { Order, OrderItem, OrderStatus } from './entities';
import { Product } from '../products/entities';
import { User } from '../auth/entities/user.entity';
import { UserWeeklyOrderException } from '../auth/entities/user-weekly-order-exception.entity';
import { PaginationDto } from '../common/dtos/pagination.dto';

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

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserWeeklyOrderException)
    private readonly weeklyOrderExceptionRepository: Repository<UserWeeklyOrderException>,

    private readonly dataSource: DataSource,
  ) {}

  async create(createOrderDto: CreateOrderDto, user: User) {
    const { items } = createOrderDto;
    const orderingUser =
      (await this.userRepository.findOne({
        where: { id: user.id },
        relations: { sector: true },
      })) || user;
    const isSuperUser = this.isSuperOrderingUser(orderingUser);
    const sector = orderingUser?.sector || null;
    const sectorId = sector?.id || null;
    const maxItemsLimit =
      typeof sector?.maxItems === 'number' && sector.maxItems > 0
        ? Math.floor(sector.maxItems)
        : null;
    const maxTotalKgLimit =
      typeof sector?.maxTotalKg === 'number' && sector.maxTotalKg > 0
        ? Math.floor(sector.maxTotalKg)
        : null;

    if (!orderingUser.isActive) {
      throw new ForbiddenException(
        'Tu cuenta esta deshabilitada para hacer pedidos. Comunicate con un supervisor',
      );
    }

    if (!items?.length) {
      throw new BadRequestException('El pedido debe contener productos');
    }

    if (
      !isSuperUser &&
      typeof maxItemsLimit === 'number' &&
      items.length > maxItemsLimit
    ) {
      throw new BadRequestException(
        `Solo se permiten ${maxItemsLimit} productos por pedido`,
      );
    }

    if (!isSuperUser) {
      const startOfWeek = this.getStartOfWeek();
      const [ordersThisWeek, extraOrdersThisWeek] = await Promise.all([
        this.orderRepository.count({
          where: {
            user: { id: orderingUser.id },
            createdAt: MoreThanOrEqual(startOfWeek),
          },
        }),
        this.getCurrentWeekExtraOrders(orderingUser.id, startOfWeek),
      ]);
      const weeklyLimit = this.getWeeklyOrderLimit(orderingUser);

      if (
        typeof weeklyLimit === 'number' &&
        ordersThisWeek >= weeklyLimit + extraOrdersThisWeek
      ) {
        throw new BadRequestException(
          'Ya alcanzaste el limite de pedidos de esta semana.',
        );
      }
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

      if (!product.isActive && !isSuperUser) {
        throw new BadRequestException(
          `El producto ${product.title} no esta disponible`,
        );
      }

      if (
        !isSuperUser &&
        !product.allowAllSectors &&
        (!sectorId ||
          !(product.allowedSectorIds || []).includes(sectorId))
      ) {
        throw new BadRequestException(
          `El producto ${product.title} no esta habilitado para tu sector`,
        );
      }

      if (!isSuperUser && item.kg > product.maxKgPerOrder) {
        throw new BadRequestException(
          `No puedes pedir mas de ${product.maxKgPerOrder} kg de ${product.title}`,
        );
      }

      if (item.isBox && !product.allowBoxes) {
        throw new BadRequestException(
          `El producto ${product.title} no permite pedidos por caja`,
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
        isBox: Boolean(item.isBox && product.allowBoxes),
        unitPrice,
        subtotal,
      });
    });

    if (
      !isSuperUser &&
      typeof maxTotalKgLimit === 'number' &&
      totalKg > maxTotalKgLimit
    ) {
      throw new BadRequestException(
        `El total no puede superar los ${maxTotalKgLimit} kg`,
      );
    }

    const preparationWeekday =
      typeof sector?.preparationWeekday === 'number'
        ? sector.preparationWeekday
        : null;
    const preparationDate = this.resolvePreparationDate(
      new Date(),
      preparationWeekday,
    );

    try {
      const order = this.orderRepository.create({
        user: orderingUser,
        items: orderItems,
        totalKg,
        totalPrice,
        status: OrderStatus.Pending,
        sectorIdSnapshot: sector?.id || null,
        sectorTitleSnapshot: sector?.title || null,
        sectorColorSnapshot: sector?.color || null,
        preparationWeekdaySnapshot: preparationWeekday,
        preparationDate,
      });

      const savedOrder = await this.orderRepository.save(order);

      const fullOrder = await this.orderRepository.findOne({
        where: { id: savedOrder.id, user: { id: orderingUser.id } },
      });

      return this.mapOrderResponse(fullOrder);
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async findAllByUser(user: User, queryDto: OrdersQueryDto) {
    const { limit = 10, offset = 0, fromDate, toDate } = queryDto;
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);
    const { from, to } = this.buildDateRange(fromDate, toDate);
    const where: FindOptionsWhere<Order> = { user: { id: user.id } };

    if (from && to) {
      where.createdAt = Between(from, to);
    } else if (from) {
      where.createdAt = MoreThanOrEqual(from);
    } else if (to) {
      where.createdAt = LessThanOrEqual(to);
    }

    const [orders, totalOrders] = await this.orderRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });

    return {
      count: totalOrders,
      pages: Math.ceil(totalOrders / safeLimit),
      orders: orders.map((order) => this.mapOrderResponse(order)),
    };
  }

  async findAllAdmin(queryDto: OrdersQueryDto) {
    const {
      limit = 10,
      offset = 0,
      sort = 'default',
      ...filters
    } = queryDto;
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.sector', 'sector')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .distinct(true);

    this.applyAdminOrderFilters(queryBuilder, filters);
    this.applyAdminOrderSorting(queryBuilder, sort);
    queryBuilder.take(safeLimit).skip(safeOffset);

    const [orders, totalOrders] = await queryBuilder.getManyAndCount();

    return {
      count: totalOrders,
      pages: Math.ceil(totalOrders / safeLimit),
      orders: orders.map((order) => this.mapOrderResponse(order, true)),
    };
  }

  async getAdminSummary(queryDto: OrdersQueryDto) {
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.user', 'user')
      .leftJoin('user.sector', 'sector')
      .leftJoin('order.items', 'item')
      .leftJoin('item.product', 'product')
      .select(['order.id', 'order.status'])
      .distinct(true);

    this.applyAdminOrderFilters(queryBuilder, queryDto);

    const orders = await queryBuilder.getMany();
    const summary = {
      total: 0,
      pending: 0,
      completed: 0,
      cancelled: 0,
    };

    for (const order of orders) {
      if (order.status === OrderStatus.Cancelled) {
        summary.cancelled += 1;
        continue;
      }

      summary.total += 1;
      if (order.status === OrderStatus.Pending) summary.pending += 1;
      if (order.status === OrderStatus.Completed) summary.completed += 1;
    }

    return summary;
  }

  async getAdminHistorySummary(queryDto: OrdersQueryDto) {
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.user', 'user')
      .leftJoin('user.sector', 'sector')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoin('item.product', 'product')
      .distinct(true);

    this.applyAdminOrderFilters(queryBuilder, queryDto);

    const orders = await queryBuilder.getMany();
    const summary = {
      total: 0,
      totalKg: 0,
      totalBoxes: 0,
      totalPrice: 0,
      completed: 0,
      hasBoxOrders: false,
    };

    for (const order of orders) {
      if (order.status === OrderStatus.Cancelled) {
        continue;
      }

      summary.total += 1;
      summary.totalPrice += Number(order.totalPrice || 0);
      if (order.status === OrderStatus.Completed) summary.completed += 1;

      for (const item of order.items || []) {
        if (item.isBox) {
          summary.totalBoxes += Number(item.kg || 0);
          summary.hasBoxOrders = true;
        } else {
          summary.totalKg += Number(item.kg || 0);
        }
      }
    }

    return summary;
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
        const productIds = Array.from(
          new Set(
            (order.items || [])
              .map((item) => item.product?.id)
              .filter((productId): productId is string => Boolean(productId)),
          ),
        );
        const lockedProducts = productIds.length
          ? await queryRunner.manager
              .createQueryBuilder(Product, 'product')
              .setLock('pessimistic_write')
              .where('product.id IN (:...productIds)', { productIds })
              .getMany()
          : [];
        const lockedProductsById = new Map(
          lockedProducts.map((product) => [product.id, product]),
        );

        for (const item of order.items || []) {
          if (!item.product) {
            throw new BadRequestException('Producto no encontrado en el pedido');
          }

          const product = lockedProductsById.get(item.product.id);
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
          if (!item.product) continue;
          const product = lockedProductsById.get(item.product.id);
          if (!product) continue;
          product.stock -= item.kg;
        }

        await queryRunner.manager.save(Product, [...lockedProductsById.values()]);
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

    const activityProductsRaw = await this.orderItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .innerJoin('item.product', 'product')
      .select(`DATE_TRUNC('${activityUnit}', order.createdAt)`, 'bucket')
      .addSelect('product.id', 'productId')
      .addSelect('product.title', 'title')
      .addSelect('product.slug', 'slug')
      .addSelect('SUM(item.kg)', 'totalKg')
      .addSelect('COUNT(DISTINCT order.id)', 'totalOrders')
      .where('order.createdAt >= :activityStart', { activityStart })
      .andWhere('order.status != :cancelled', {
        cancelled: OrderStatus.Cancelled,
      })
      .groupBy('bucket')
      .addGroupBy('product.id')
      .addGroupBy('product.title')
      .addGroupBy('product.slug')
      .orderBy('bucket', 'ASC')
      .addOrderBy('"totalKg"', 'DESC')
      .getRawMany();

    const activityMap = new Map<
      string,
      { totalKg: number; totalOrders: number }
    >();
    const activityProductsMap = new Map<
      string,
      Array<{
        productId: string;
        title: string;
        slug: string;
        totalKg: number;
        totalOrders: number;
      }>
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

    activityProductsRaw.forEach((row) => {
      const bucketValue =
        row.bucket instanceof Date ? row.bucket : new Date(row.bucket);
      const bucketKey =
        activityUnit === 'day'
          ? this.formatDateKey(bucketValue)
          : this.formatMonthKey(bucketValue);
      const products = activityProductsMap.get(bucketKey) || [];

      products.push({
        productId: row.productId,
        title: row.title,
        slug: row.slug,
        totalKg: Number(row.totalKg || 0),
        totalOrders: Number(row.totalOrders || 0),
      });

      activityProductsMap.set(bucketKey, products);
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
      const products = activityProductsMap.get(bucketKey) || [];

      return {
        date: bucketKey,
        ...bucketStats,
        products,
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
              isSuperUser: order.user.isSuperUser,
            }
          : null,
        items: (order.items || []).map((item) => ({
          id: item.id,
          kg: item.kg,
          isBox: item.isBox,
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
          isSuperUser: user.isSuperUser,
          sectorId: user.sectorId || null,
          sector: user.sector
            ? {
                id: user.sector.id,
                title: user.sector.title,
                color: user.sector.color,
                preparationWeekday: user.sector.preparationWeekday,
              }
            : null,
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

  private isSuperOrderingUser(user: User) {
    return (
      user?.isSuperUser === true ||
      user?.roles?.includes('super-user') ||
      user?.roles?.includes('super')
    );
  }

  private getWeeklyOrderLimit(user: User) {
    if (!user) return 1;

    if (!user.sector) {
      return 1;
    }

    const parsed = Number(user.sector.maxOrdersPerWeek);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return null;
    }

    return Math.floor(parsed);
  }

  private async getCurrentWeekExtraOrders(userId: string, startOfWeek: Date) {
    const weekStartDate = this.formatDateKey(startOfWeek);
    const result = await this.weeklyOrderExceptionRepository
      .createQueryBuilder('weeklyException')
      .select('COALESCE(SUM(weeklyException.extraOrders), 0)', 'total')
      .where('weeklyException.userId = :userId', { userId })
      .andWhere('weeklyException.weekStartDate = :weekStartDate', {
        weekStartDate,
      })
      .getRawOne<{ total: string }>();

    return Number(result?.total || 0);
  }

  private getStartOfWeek(reference = new Date()) {
    const startOfWeek = new Date(reference);
    startOfWeek.setHours(0, 0, 0, 0);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    return startOfWeek;
  }

  private resolvePreparationDate(
    reference: Date,
    preparationWeekday: number | null,
  ): string | null {
    if (typeof preparationWeekday !== 'number') return null;
    if (preparationWeekday === -1) {
      return this.formatDateKey(reference);
    }
    if (preparationWeekday < 0 || preparationWeekday > 6) return null;
    const base = this.getStartOfWeek(reference);
    const preparation = new Date(base);
    preparation.setDate(base.getDate() + preparationWeekday);
    return this.formatDateKey(preparation);
  }

  private buildDateRange(fromDate?: string, toDate?: string) {
    const from = fromDate ? this.parseDateOnly(fromDate, false) : undefined;
    const to = toDate ? this.parseDateOnly(toDate, true) : undefined;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(
        'La fecha inicial no puede ser mayor que la fecha final',
      );
    }

    return { from, to };
  }

  private parseDateOnly(value: string, endOfDay: boolean) {
    const isoDateMatch = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!isoDateMatch) {
      const parsedDate = new Date(value);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new BadRequestException(
          'Formato de fecha invalido. Usa YYYY-MM-DD',
        );
      }

      if (endOfDay) {
        parsedDate.setUTCHours(23, 59, 59, 999);
      } else {
        parsedDate.setUTCHours(0, 0, 0, 0);
      }

      return parsedDate;
    }

    const [yearRaw, monthRaw, dayRaw] = value.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);

    if (!year || !month || !day) {
      throw new BadRequestException(
        'Formato de fecha invalido. Usa YYYY-MM-DD',
      );
    }

    const date = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      ),
    );

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(
        'Formato de fecha invalido. Usa YYYY-MM-DD',
      );
    }

    return date;
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

  private parseOptionalBoolean(value?: string) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  private applyAdminOrderFilters(
    queryBuilder: SelectQueryBuilder<Order>,
    queryDto: Partial<OrdersQueryDto>,
  ) {
    const {
      scope = 'all',
      user,
      product,
      fromDate,
      toDate,
      sectorId,
      preparationDate,
      status,
      hasBoxes,
    } = queryDto;
    const { from, to } = this.buildDateRange(fromDate, toDate);
    const parsedHasBoxes = this.parseOptionalBoolean(hasBoxes);

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

    if (from) {
      queryBuilder.andWhere('order.createdAt >= :fromDate', { fromDate: from });
    }

    if (to) {
      queryBuilder.andWhere('order.createdAt <= :toDate', { toDate: to });
    }

    if (sectorId) {
      queryBuilder.andWhere(
        'COALESCE(order.sectorIdSnapshot, user.sectorId) = :sectorId',
        { sectorId },
      );
    }

    if (preparationDate) {
      queryBuilder.andWhere(
        `(
          order.preparationDate = :preparationDate
          OR (
            order.preparationDate IS NULL
            AND sector.preparationWeekday IS NOT NULL
            AND (
              (
                sector.preparationWeekday = -1
                AND DATE_TRUNC('day', order.createdAt)::date = :preparationDate::date
              )
              OR (
                sector.preparationWeekday BETWEEN 0 AND 6
                AND (
                  DATE_TRUNC('day', order.createdAt)
                  - (EXTRACT(DOW FROM order.createdAt)::int * INTERVAL '1 day')
                  + (sector.preparationWeekday * INTERVAL '1 day')
                )::date = :preparationDate::date
              )
            )
          )
        )`,
        { preparationDate },
      );
    }

    if (status) {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    const hasBoxOrderIdsSubquery = queryBuilder
      .subQuery()
      .select('boxitems."orderId"')
      .from('order_items', 'boxitems')
      .where('boxitems."isBox" = true')
      .getQuery();

    if (parsedHasBoxes === true) {
      queryBuilder.andWhere(`"order"."id" IN (${hasBoxOrderIdsSubquery})`);
    }

    if (parsedHasBoxes === false) {
      queryBuilder.andWhere(`"order"."id" NOT IN (${hasBoxOrderIdsSubquery})`);
    }
  }

  private applyAdminOrderSorting(
    queryBuilder: SelectQueryBuilder<Order>,
    sort: OrdersQueryDto['sort'],
  ) {
    if (sort !== 'statusEmployeeAsc') {
      queryBuilder.orderBy('order.createdAt', 'DESC');
      return;
    }

    const statusPriorityExpression = `
      CASE
        WHEN "order"."status" = :pendingStatus THEN 0
        WHEN "order"."status" = :completedStatus THEN 1
        ELSE 2
      END
    `;
    const employeeNumberValueExpression = `
      COALESCE(
        NULLIF(
          REGEXP_REPLACE(COALESCE("user"."employeeNumber", ''), '[^0-9]', '', 'g'),
          ''
        )::bigint,
        9223372036854775807
      )
    `;

    queryBuilder
      .setParameters({
        pendingStatus: OrderStatus.Pending,
        completedStatus: OrderStatus.Completed,
      })
      .addSelect(statusPriorityExpression, 'sort_status_priority')
      .addSelect(employeeNumberValueExpression, 'sort_employee_number')
      .orderBy('sort_status_priority', 'ASC')
      .addOrderBy('sort_employee_number', 'ASC')
      .addOrderBy('order.createdAt', 'ASC');
  }
}
