import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';

import { Product } from '../../../../products/entities';
import { Order, OrderItem, OrderStatus } from '../../../entities';
import {
  CreateOrderRecordInput,
  OrderWriteRepository,
} from '../../../domain/repositories/order-write.repository';

@Injectable()
export class TypeOrmOrderWriteRepository implements OrderWriteRepository {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,

    private readonly dataSource: DataSource,
  ) {}

  async countByUserSince(userId: string, startDate: Date) {
    return this.orderRepository.count({
      where: {
        user: { id: userId },
        createdAt: MoreThanOrEqual(startDate),
      },
    });
  }

  async createOrder(input: CreateOrderRecordInput) {
    const {
      orderingUser,
      items,
      totalKg,
      totalPrice,
      sectorIdSnapshot,
      sectorTitleSnapshot,
      sectorColorSnapshot,
      preparationWeekdaySnapshot,
      preparationDate,
    } = input;

    const orderItems = items.map((item) =>
      this.orderItemRepository.create({
        product: item.product,
        kg: item.kg,
        isBox: item.isBox,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      }),
    );

    const order = this.orderRepository.create({
      user: orderingUser,
      items: orderItems,
      totalKg,
      totalPrice,
      status: OrderStatus.Pending,
      sectorIdSnapshot,
      sectorTitleSnapshot,
      sectorColorSnapshot,
      preparationWeekdaySnapshot,
      preparationDate,
    });

    return this.orderRepository.save(order);
  }

  async findOneByIdAndUser(orderId: string, userId: string) {
    return this.orderRepository.findOne({
      where: { id: orderId, user: { id: userId } },
    });
  }

  async updateOrderStatus(id: string, nextStatus: OrderStatus) {
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

      if (order.status === nextStatus) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return order;
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

      return updatedOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      throw error;
    }
  }
}
