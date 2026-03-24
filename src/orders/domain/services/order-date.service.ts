import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class OrderDateService {
  getStartOfWeek(reference = new Date()) {
    const startOfWeek = new Date(reference);
    startOfWeek.setHours(0, 0, 0, 0);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    return startOfWeek;
  }

  resolvePreparationDate(reference: Date, preparationWeekday: number | null) {
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

  buildDateRange(fromDate?: string, toDate?: string) {
    const from = fromDate ? this.parseDateOnly(fromDate, false) : undefined;
    const to = toDate ? this.parseDateOnly(toDate, true) : undefined;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(
        'La fecha inicial no puede ser mayor que la fecha final',
      );
    }

    return { from, to };
  }

  formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatMonthKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
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
}
