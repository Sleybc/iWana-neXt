import { z } from 'zod';
import { BILLING_PERIOD_PAYMENT_STATES, type BillingPeriodPaymentState } from './billing-constants';
import {
  BillingDocumentResponseSchema,
  type BillingDocumentResponse,
} from './billing-documents.contract';
import {
  BillingPaymentResponseSchema,
  type BillingPaymentResponse,
} from './billing-payments.contract';
import { billingMoneyStringSchema } from './billing-money.schema';

export const ContractBillingSummarySchema = z
  .object({
    contractId: z.string().uuid(),
    totalInvoiced: billingMoneyStringSchema,
    totalPaid: billingMoneyStringSchema,
    totalPending: billingMoneyStringSchema,
    periodState: z.enum(BILLING_PERIOD_PAYMENT_STATES).optional(),
  })
  .strict();

export type ContractBillingSummary = z.infer<typeof ContractBillingSummarySchema>;

/** Estado de cuenta consolidado del suscriptor (HLD §4, §6.5, RS-21, RS-22). */
export const BillingAccountStatementSchema = z
  .object({
    subscriberId: z.string().uuid(),
    buyerProtected: z.boolean(),
    impersonationHold: z.boolean(),
    totalInvoiced: billingMoneyStringSchema,
    totalPaid: billingMoneyStringSchema,
    totalPending: billingMoneyStringSchema,
    creditBalance: billingMoneyStringSchema,
    documents: z.array(BillingDocumentResponseSchema),
    payments: z.array(BillingPaymentResponseSchema),
    contractSummaries: z.array(ContractBillingSummarySchema).default([]),
  })
  .strict();

export type BillingAccountStatement = z.infer<typeof BillingAccountStatementSchema>;
