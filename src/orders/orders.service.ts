import {
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';

import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { Order, OrderItem, OrderStatus } from './entities';
import { User } from '../auth/entities/user.entity';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { OrderDateService } from './domain/services/order-date.service';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { UpdateOrderStatusUseCase } from './application/use-cases/update-order-status.use-case';
import { FindAllByUserUseCase } from './application/use-cases/find-all-by-user.use-case';
import { FindAllAdminOrdersUseCase } from './application/use-cases/find-all-admin-orders.use-case';
import { GetAdminOrdersSummaryUseCase } from './application/use-cases/get-admin-orders-summary.use-case';
import { GetAdminOrdersHistorySummaryUseCase } from './application/use-cases/get-admin-orders-history-summary.use-case';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,

    private readonly orderDateService: OrderDateService,
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly findAllByUserUseCase: FindAllByUserUseCase,
    private readonly findAllAdminOrdersUseCase: FindAllAdminOrdersUseCase,
    private readonly getAdminOrdersSummaryUseCase: GetAdminOrdersSummaryUseCase,
    private readonly getAdminOrdersHistorySummaryUseCase: GetAdminOrdersHistorySummaryUseCase,
    private readonly updateOrderStatusUseCase: UpdateOrderStatusUseCase,
  ) {}

  async create(createOrderDto: CreateOrderDto, user: User) {
    return this.createOrderUseCase.execute(createOrderDto, user);
  }

  async findAllByUser(user: User, queryDto: OrdersQueryDto) {
    return this.findAllByUserUseCase.execute(user, queryDto);
  }

  async findAllAdmin(queryDto: OrdersQueryDto) {
    return this.findAllAdminOrdersUseCase.execute(queryDto);
  }

  async getAdminSummary(queryDto: OrdersQueryDto) {
    return this.getAdminOrdersSummaryUseCase.execute(queryDto);
  }

  async getAdminHistorySummary(queryDto: OrdersQueryDto) {
    return this.getAdminOrdersHistorySummaryUseCase.execute(queryDto);
  }

  async updateStatus(id: string, updateOrderStatusDto: UpdateOrderStatusDto) {
    return this.updateOrderStatusUseCase.execute(id, updateOrderStatusDto);
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

    const startOfWeek = this.orderDateService.getStartOfWeek();

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
          ? this.orderDateService.formatDateKey(bucketValue)
          : this.orderDateService.formatMonthKey(bucketValue);
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
          ? this.orderDateService.formatDateKey(bucketValue)
          : this.orderDateService.formatMonthKey(bucketValue);
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
          ? this.orderDateService.formatDateKey(bucketDate)
          : this.orderDateService.formatMonthKey(bucketDate);
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

}
