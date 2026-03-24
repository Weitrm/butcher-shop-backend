import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { CreateOrderDto } from '../../dto/create-order.dto';
import { User } from '../../../auth/entities/user.entity';
import { OrderDateService } from '../../domain/services/order-date.service';
import { OrderRulesService } from '../../domain/services/order-rules.service';
import { OrderResponseMapper } from '../mappers/order-response.mapper';
import {
  ORDER_WRITE_REPOSITORY,
  PRODUCT_READ_REPOSITORY,
  USER_READ_REPOSITORY,
  WEEKLY_ORDER_EXCEPTION_READ_REPOSITORY,
} from '../../domain/repositories/repository-tokens';
import { OrderWriteRepository } from '../../domain/repositories/order-write.repository';
import { ProductReadRepository } from '../../domain/repositories/product-read.repository';
import { UserReadRepository } from '../../domain/repositories/user-read.repository';
import { WeeklyOrderExceptionReadRepository } from '../../domain/repositories/weekly-order-exception-read.repository';

@Injectable()
export class CreateOrderUseCase {
  private readonly logger = new Logger('CreateOrderUseCase');

  constructor(
    @Inject(USER_READ_REPOSITORY)
    private readonly userReadRepository: UserReadRepository,

    @Inject(PRODUCT_READ_REPOSITORY)
    private readonly productReadRepository: ProductReadRepository,

    @Inject(ORDER_WRITE_REPOSITORY)
    private readonly orderWriteRepository: OrderWriteRepository,

    @Inject(WEEKLY_ORDER_EXCEPTION_READ_REPOSITORY)
    private readonly weeklyOrderExceptionReadRepository: WeeklyOrderExceptionReadRepository,

    private readonly orderDateService: OrderDateService,
    private readonly orderRulesService: OrderRulesService,
    private readonly orderResponseMapper: OrderResponseMapper,
  ) {}

  async execute(createOrderDto: CreateOrderDto, user: User) {
    const { items } = createOrderDto;
    const orderingUser =
      (await this.userReadRepository.findByIdWithSector(user.id)) || user;
    const isSuperUser = this.orderRulesService.isSuperOrderingUser(orderingUser);
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
      const startOfWeek = this.orderDateService.getStartOfWeek();
      const weekStartDate = this.orderDateService.formatDateKey(startOfWeek);
      const [ordersThisWeek, extraOrdersThisWeek] = await Promise.all([
        this.orderWriteRepository.countByUserSince(orderingUser.id, startOfWeek),
        this.weeklyOrderExceptionReadRepository.getCurrentWeekExtraOrders(
          orderingUser.id,
          weekStartDate,
        ),
      ]);
      const weeklyLimit = this.orderRulesService.getWeeklyOrderLimit(orderingUser);

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

    const products = await this.productReadRepository.findByIds([...uniqueIds]);

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
          !(product.productSectorVisibilities || []).some(
            (visibility) => visibility.sectorId === sectorId,
          ))
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

      return {
        product,
        kg: item.kg,
        isBox: Boolean(item.isBox && product.allowBoxes),
        unitPrice,
        subtotal,
      };
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
    const preparationDate = this.orderDateService.resolvePreparationDate(
      new Date(),
      preparationWeekday,
    );

    try {
      const savedOrder = await this.orderWriteRepository.createOrder({
        orderingUser,
        items: orderItems,
        totalKg,
        totalPrice,
        sectorIdSnapshot: sector?.id || null,
        sectorTitleSnapshot: sector?.title || null,
        sectorColorSnapshot: sector?.color || null,
        preparationWeekdaySnapshot: preparationWeekday,
        preparationDate,
      });

      const fullOrder = await this.orderWriteRepository.findOneByIdAndUser(
        savedOrder.id,
        orderingUser.id,
      );

      return this.orderResponseMapper.mapOrderResponse(fullOrder);
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  private handleDBExceptions(error: any): never {
    this.logger.error(error);
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }
}
