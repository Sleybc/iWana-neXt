import type { BillingAccountStatement, BillingPeriodPaymentState } from '@iwana/shared';

/** Lecturas de Billing que pueden consumir otros módulos mediante contrato tipado. */
export abstract class BillingAccountReadPort {
  abstract periodStates(
    contractIds: string[],
    localDate: string,
  ): Promise<
    Record<
      string,
      { state: BillingPeriodPaymentState; paidAmount: string | null; totalAmount: string | null }
    >
  >;

  abstract statementForSubscriber(subscriberId: string): Promise<BillingAccountStatement>;
}
