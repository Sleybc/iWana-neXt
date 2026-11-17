import { z } from 'zod';
import {
  DASHBOARD_SERIES_MONTHS,
  dashboardCivilDateSchema,
  dashboardCountSchema,
  dashboardMonthSchema,
  isContiguousSeriesEndingAt,
  previousDashboardMonth,
} from '../dashboard-series.schema';

/**
 * N2 · `GET /crm/subscribers/dashboard/summary` (HLD-MOD02 v3.0 §3 y §8). Solo conteos del
 * tenant, sin identificadores de persona. Meses civiles en la zona horaria del tenant.
 *
 * - Altas: suscriptores con `activated_at` en el mes, sin borrado lógico y no importados
 *   (`import_batch_id IS NULL`, G1-2).
 * - Bajas: filas `SUBSCRIBER` de `crm_lifecycle_changes` con `to_status = 'CANCELLED'` y
 *   `from_status` en `ACTIVE` o `SUSPENDED` (G1-3).
 */

/** N2 no acepta parámetros: el horizonte de 12 meses lo fija el servidor (B0-SEC). */
export const SubscribersDashboardSummaryQuerySchema = z.object({}).strict();

export const SubscribersDashboardMonthSchema = z
  .object({
    month: dashboardMonthSchema,
    activations: dashboardCountSchema,
    cancellations: dashboardCountSchema,
  })
  .strict();

export type SubscribersDashboardMonth = z.infer<typeof SubscribersDashboardMonthSchema>;

export const SubscribersDashboardSummarySchema = z
  .object({
    asOf: dashboardCivilDateSchema,
    activations: dashboardCountSchema,
    cancellations: dashboardCountSchema,
    /** Doce meses ascendentes que terminan en el mes de `asOf`; meses sin movimiento en cero. */
    series: z.array(SubscribersDashboardMonthSchema).length(DASHBOARD_SERIES_MONTHS),
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
      current.activations !== summary.activations ||
      current.cancellations !== summary.cancellations
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series'],
        message: 'El último mes de la serie debe coincidir con el mes en curso.',
      });
    }
  });

export type SubscribersDashboardSummary = z.infer<typeof SubscribersDashboardSummarySchema>;
