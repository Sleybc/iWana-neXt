import { z } from 'zod';
import {
  dashboardCivilDateSchema,
  dashboardCountSchema,
  isContiguousSeriesEndingAt,
  previousDashboardDate,
} from '../dashboard-series.schema';

/**
 * N3 · `GET /assurance/dashboard/series?days=14` (HLD-MOD02 v3.0 §3 y §8). Endpoint aparte
 * para no tocar el contrato publicado de `assurance/dashboard/summary`. Solo conteos por día
 * civil del tenant; excluye los casos importados (`import_batch_id IS NULL`).
 *
 * - `created`: casos con `created_at` ese día.
 * - `resolved`: casos con `resolved_at` ese día (la última resolución del caso).
 */

export const ASSURANCE_DASHBOARD_SERIES_DAYS = { min: 7, max: 31, default: 14 } as const;

/** Query: `days` entero entre 7 y 31; 14 si se omite. Llega como texto en la URL. */
export const AssuranceDashboardSeriesQuerySchema = z
  .object({
    days: z.coerce
      .number()
      .int()
      .min(ASSURANCE_DASHBOARD_SERIES_DAYS.min)
      .max(ASSURANCE_DASHBOARD_SERIES_DAYS.max)
      .default(ASSURANCE_DASHBOARD_SERIES_DAYS.default),
  })
  .strict();

export type AssuranceDashboardSeriesQuery = z.infer<typeof AssuranceDashboardSeriesQuerySchema>;

export const AssuranceDashboardDaySchema = z
  .object({
    date: dashboardCivilDateSchema,
    created: dashboardCountSchema,
    resolved: dashboardCountSchema,
  })
  .strict();

export type AssuranceDashboardDay = z.infer<typeof AssuranceDashboardDaySchema>;

export const AssuranceDashboardSeriesSchema = z
  .object({
    asOf: dashboardCivilDateSchema,
    days: z
      .number()
      .int()
      .min(ASSURANCE_DASHBOARD_SERIES_DAYS.min)
      .max(ASSURANCE_DASHBOARD_SERIES_DAYS.max),
    /** `days` días ascendentes que terminan en `asOf`, incluido; días sin casos en cero. */
    series: z.array(AssuranceDashboardDaySchema),
  })
  .strict()
  .superRefine((response, ctx) => {
    const dates = response.series.map((item) => item.date);
    if (
      dates.length !== response.days ||
      !isContiguousSeriesEndingAt(dates, response.asOf, previousDashboardDate)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series'],
        message: 'La serie debe tener `days` días contiguos y terminar en asOf.',
      });
    }
  });

export type AssuranceDashboardSeries = z.infer<typeof AssuranceDashboardSeriesSchema>;
