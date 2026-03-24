import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { UpdateOrderStatusDto } from '../../dto/update-order-status.dto';
import { OrderResponseMapper } from '../mappers/order-response.mapper';
import { ORDER_WRITE_REPOSITORY } from '../../domain/repositories/repository-tokens';
import { OrderWriteRepository } from '../../domain/repositories/order-write.repository';

@Injectable()
export class UpdateOrderStatusUseCase {
  private readonly logger = new Logger('UpdateOrderStatusUseCase');

  constructor(
    @Inject(ORDER_WRITE_REPOSITORY)
    private readonly orderWriteRepository: OrderWriteRepository,
    private readonly orderResponseMapper: OrderResponseMapper,
  ) {}

  async execute(id: string, updateOrderStatusDto: UpdateOrderStatusDto) {
    try {
      const updatedOrder = await this.orderWriteRepository.updateOrderStatus(
        id,
        updateOrderStatusDto.status,
      );
      return this.orderResponseMapper.mapOrderResponse(updatedOrder, true);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
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
