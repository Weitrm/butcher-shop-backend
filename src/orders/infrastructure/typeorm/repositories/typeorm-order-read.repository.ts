import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import {
  FindAllAdminOrdersInput,
  FindOrdersByUserInput,
  OrderReadRepository,
} from '../../../domain/repositories/order-read.repository';
import { OrdersQueryDto } from '../../../dto/orders-query.dto';
import { Order, OrderStatus } from '../../../entities';
import { OrderDateService } from '../../../domain/services/order-date.service';
import { OrderRulesService } from '../../../domain/services/order-rules.service';

@Injectable()
export class TypeOrmOrderReadRepository implements OrderReadRepository {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly orderDateService: OrderDateService,
    private readonly orderRulesService: OrderRulesService,
  ) {}

  async findAllByUser(input: FindOrdersByUserInput) {
    const { userId, limit, offset, from, to } = input;
    const where: FindOptionsWhere<Order> = { user: { id: userId } };

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
      take: limit,
      skip: offset,
    });

    return { orders, totalOrders };
  }

  async findAllAdmin(input: FindAllAdminOrdersInput) {
    const { limit, offset, sort = 'default', ...filters } = input;
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.sector', 'sector')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .distinct(true);

    this.applyAdminOrderFilters(queryBuilder, filters as Partial<OrdersQueryDto>);
    this.applyAdminOrderSorting(queryBuilder, sort);
    queryBuilder.take(limit).skip(offset);

    const [orders, totalOrders] = await queryBuilder.getManyAndCount();
    return { orders, totalOrders };
  }

  async findAdminOrdersForSummary(filters: Partial<OrdersQueryDto>) {
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.user', 'user')
      .leftJoin('user.sector', 'sector')
      .leftJoin('order.items', 'item')
      .leftJoin('item.product', 'product')
      .select(['order.id', 'order.status'])
      .distinct(true);

    this.applyAdminOrderFilters(queryBuilder, filters);
    return queryBuilder.getMany();
  }

  async findAdminOrdersForHistorySummary(filters: Partial<OrdersQueryDto>) {
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.user', 'user')
      .leftJoin('user.sector', 'sector')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoin('item.product', 'product')
      .distinct(true);

    this.applyAdminOrderFilters(queryBuilder, filters);
    return queryBuilder.getMany();
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
    const { from, to } = this.orderDateService.buildDateRange(fromDate, toDate);
    const parsedHasBoxes = this.orderRulesService.parseOptionalBoolean(hasBoxes);

    if (scope === 'week' || scope === 'history') {
      const startOfWeek = this.orderDateService.getStartOfWeek();
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
