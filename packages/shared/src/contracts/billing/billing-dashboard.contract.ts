import { z } from 'zod';
import {
  DASHBOARD_SERIES_MONTHS,
  dashboardCivilDateSchema,
  dashboardCountSchema,
  dashboardMonthSchema,
  isContiguousSeriesEndingAt,
  previousDashboardMonth,
} from '../dashboard-series.schema';
import { billingMoneyStringSchema } from './billing-money.schema';

/**
 * N1 · `GET /billing/dashboard/summary` (HLD-MOD02 v3.0 §3 y §8). Solo sumas y conteos del
 * tenant, sin identificadores de persona. Importes como texto decimal, como el resto de
 * facturación. Contrato congelado en la Ola 0 de la Fase 2 «Pulso y atención».
 *
 * - Facturado: Σ `total` de documentos `EMITIDO` o `IMPORTADO` por `issue_date` del mes.
 * - Recaudado: caja del mes, Σ `amount` de pagos `REGISTRADO` por `paid_at` (G1-4, supuesto
 *   pendiente del CTO).
 * - Cartera vencida: saldo vigente > 0 de documentos `EMITIDO` o `IMPORTADO` con
 *   `asOf > due_date`; misma expresión de saldo que la lista de documentos.
 */

/** Tramos de antigüedad por días desde `due_date`: 1–30, 31–60, 61–90, más de 90. */
export const BILLING_OVERDUE_BUCKETS = ['1_30', '31_60', '61_90', '90_plus'] as const;

export type BillingOverdueBucket = (typeof BILLING_OVERDUE_BUCKETS)[number];

function cents(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

export const BillingOverdueBucketSchema = z
  .object({
    bucket: z.enum(BILLING_OVERDUE_BUCKETS),
    amount: billingMoneyStringSchema,
    documentCount: dashboardCountSchema,
  })
  .strict();

export type BillingOverdueBucketSummary = z.infer<typeof BillingOverdueBucketSchema>;

export const BillingDashboardOverdueSchema = z
  .object({
    amount: billingMoneyStringSchema,
    documentCount: dashboardCountSchema,
    subscriberCount: dashboardCountSchema,
    buckets: z.array(BillingOverdueBucketSchema).length(BILLING_OVERDUE_BUCKETS.length),
  })
  .strict()
  .superRefine((overdue, ctx) => {
    // Los cuatro tramos siempre presentes y en orden, también con importe cero.
    if (overdue.buckets.some((item, index) => item.bucket !== BILLING_OVERDUE_BUCKETS[index])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['buckets'],
        message: 'Tramos fuera de orden.',
      });
      return;
    }
    const amount = overdue.buckets.reduce((sum, item) => sum + cents(item.amount), 0n);
    if (amount !== cents(overdue.amount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'No cuadra con los tramos.',
      });
    }
    const documents = overdue.buckets.reduce((sum, item) => sum + item.documentCount, 0);
    if (documents !== overdue.documentCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documentCount'],
        message: 'No cuadra con los tramos.',
      });
    }
    if (overdue.subscriberCount > overdue.documentCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subscriberCount'],
        message: 'Hay más suscriptores que documentos.',
      });
    }
  });

/** N1 no acepta parámetros: el horizonte de 12 meses lo fija el servidor (B0-SEC). */
export const BillingDashboardSummaryQuerySchema = z.object({}).strict();

export const BillingDashboardMonthSchema = z
  .object({
    month: dashboardMonthSchema,
    invoicedAmount: billingMoneyStringSchema,
    collectedAmount: billingMoneyStringSchema,
  })
  .strict();

export type BillingDashboardMonth = z.infer<typeof BillingDashboardMonthSchema>;

export const BillingDashboardSummarySchema = z
  .object({
    asOf: dashboardCivilDateSchema,
    invoicedAmount: billingMoneyStringSchema,
    collectedAmount: billingMoneyStringSchema,
    overdue: BillingDashboardOverdueSchema,
    /** Doce meses ascendentes que terminan en el mes de `asOf`; meses sin movimiento en cero. */
    series: z.array(BillingDashboardMonthSchema).length(DASHBOARD_SERIES_MONTHS),
  })
  .strict()
  .superRefine((summary, ctx) => {
    const months = summary.series.map((item) => item.month);
    if (!isContiguousSeriesEndingAt(months, summary.asOf.slice(0, 7), previousDashboardMonth)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series'],
        message: 'La serie debe ser de meses contiguos y terminar en el mes de asOf.',
      });
      return;
    }
    const current = summary.series[summary.series.length - 1]!;
    if (
      cents(current.invoicedAmount) !== cents(summary.invoicedAmount) ||
      cents(current.collectedAmount) !== cents(summary.collectedAmount)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series'],
        message: 'El último mes de la serie debe coincidir con el mes en curso.',
      });
    }
  });

export type BillingDashboardSummary = z.infer<typeof BillingDashboardSummarySchema>;
