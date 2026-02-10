import { Body, Controller, Get, Patch, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Auth, GetUser } from '../auth/decorators';
import { User } from '../auth/entities/user.entity';
import { ValidRoles } from '../auth/interfaces';
import { PaginationDto } from '../common/dtos/pagination.dto';

@ApiTags('Orders')
@Controller('orders')
@Auth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Order created' })
  create(@Body() createOrderDto: CreateOrderDto, @GetUser() user: User) {
    return this.ordersService.create(createOrderDto, user);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Orders list' })
  findAll(@GetUser() user: User, @Query() paginationDto: PaginationDto) {
    return this.ordersService.findAllByUser(user, paginationDto);
  }

  @Get('current')
  @ApiResponse({ status: 200, description: 'Current order' })
  findCurrent(@GetUser() user: User) {
    return this.ordersService.findCurrentByUser(user);
  }

  @Get('admin')
  @Auth(ValidRoles.admin)
  @ApiResponse({ status: 200, description: 'Orders list (admin)' })
  findAllAdmin(@Query() paginationDto: PaginationDto) {
    return this.ordersService.findAllAdmin(paginationDto);
  }

  @Patch(':id/status')
  @Auth(ValidRoles.admin)
  @ApiResponse({ status: 200, description: 'Order status updated' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, updateOrderStatusDto);
  }
}
