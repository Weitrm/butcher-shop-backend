export interface WeeklyOrderExceptionReadRepository {
  getCurrentWeekExtraOrders(
    userId: string,
    weekStartDate: string,
  ): Promise<number>;
}
