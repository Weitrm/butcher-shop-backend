import { Injectable } from '@nestjs/common';

import { Order } from '../../entities';

@Injectable()
export class OrderResponseMapper {
  mapOrderResponse(order: Order | null, includeUser = false) {
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
}
