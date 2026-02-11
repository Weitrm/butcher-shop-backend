import { Body, Controller, Get, Patch, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
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

  @Get('admin/dashboard')
  @Auth(ValidRoles.admin)
  @ApiResponse({ status: 200, description: 'Orders dashboard stats' })
  getDashboardStats(@Query() paginationDto: PaginationDto) {
    return this.ordersService.getDashboardStats(paginationDto);
  }

  @Get('admin')
  @Auth(ValidRoles.admin)
  @ApiResponse({ status: 200, description: 'Orders list (admin)' })
  findAllAdmin(@Query() queryDto: OrdersQueryDto) {
    return this.ordersService.findAllAdmin(queryDto);
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
