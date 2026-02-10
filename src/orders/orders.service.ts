import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Order, OrderItem, OrderStatus } from './entities';
import { Product } from '../products/entities';
import { User } from '../auth/entities/user.entity';

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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of orderItems) {
        item.product.stock = item.product.stock - item.kg;
        await queryRunner.manager.save(item.product);
      }

      const order = this.orderRepository.create({
        user,
        items: orderItems,
        totalKg,
        totalPrice,
        status: OrderStatus.Pending,
      });

      const savedOrder = await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();
      await queryRunner.release();

      const fullOrder = await this.orderRepository.findOne({
        where: { id: savedOrder.id, user: { id: user.id } },
      });

      return this.mapOrderResponse(fullOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.handleDBExceptions(error);
    }
  }

  async findAllByUser(user: User) {
    const orders = await this.orderRepository.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
    });

    return orders.map((order) => this.mapOrderResponse(order));
  }

  async findCurrentByUser(user: User) {
    const order = await this.orderRepository.findOne({
      where: { user: { id: user.id }, status: OrderStatus.Pending },
      order: { createdAt: 'DESC' },
    });

    if (!order) {
      throw new NotFoundException('No hay pedido actual');
    }

    return this.mapOrderResponse(order);
  }

  async findAllAdmin() {
    const orders = await this.orderRepository.find({
      order: { createdAt: 'DESC' },
    });

    return orders.map((order) => this.mapOrderResponse(order, true));
  }

  async updateStatus(id: string, updateOrderStatusDto: UpdateOrderStatusDto) {
    const order = await this.orderRepository.findOne({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }

    await this.orderRepository.update(
      { id },
      { status: updateOrderStatusDto.status },
    );

    const updatedOrder = await this.orderRepository.findOne({
      where: { id },
    });

    return this.mapOrderResponse(updatedOrder, true);
  }

  private mapOrderResponse(order: Order | null, includeUser = false) {
    if (!order) return null;

    const { items = [], user, ...rest } = order;
    const mappedUser = includeUser && user
      ? {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
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
}
