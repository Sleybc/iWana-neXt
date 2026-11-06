import { z } from 'zod';
import type { BillingPeriodPaymentState } from '../contracts/billing/billing-constants';
import type { ListMeta } from '../dto/pagination.dto';

export const BILLING_CYCLE_ERROR_CODES = [
  'BILLING_CYCLE_REQUIRED',
  'BILLING_CYCLE_INVALID',
] as const;
export type BillingCycleErrorCode = (typeof BILLING_CYCLE_ERROR_CODES)[number];

export const BillingCycleSchema = z
  .object({
    cycleDay: z.number().int().min(1).max(28),
    cutoffDay: z.number().int().min(1).max(31),
    active: z.boolean(),
  })
  .strict();
export type BillingCycle = z.infer<typeof BillingCycleSchema>;

export const BillingCycleOptionSchema = BillingCycleSchema.extend({
  nextCutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
}).strict();
export type BillingCycleOption = z.infer<typeof BillingCycleOptionSchema>;

export const ActivateContractSchema = z
  .object({
    billingCycleDay: z.number().int().min(1).max(28).optional(),
  })
  .strict();
export type ActivateContractInput = z.infer<typeof ActivateContractSchema>;

function isCivilDate(value: string): boolean {
  const [yearPart, monthPart, dayPart] = value.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!yearPart || !monthPart || !dayPart || year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= daysInMonth;
}

export const CutoffAgendaQuerySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .refine(isCivilDate, 'La fecha debe ser una fecha civil válida.')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type CutoffAgendaQuery = z.infer<typeof CutoffAgendaQuerySchema>;

export interface CutoffAgendaItem {
  contractId: string;
  subscriberId: string;
  subscriberDisplayName: string;
  planName: string | null;
  billingCycleDay: number;
  cutoffDate: string;
  paymentState?: BillingPeriodPaymentState;
  paymentPaidAmount?: string | null;
  paymentTotalAmount?: string | null;
}

export interface CutoffAgendaResponse {
  date: string;
  items: CutoffAgendaItem[];
  meta: ListMeta;
  withoutCycleCount: number;
}
