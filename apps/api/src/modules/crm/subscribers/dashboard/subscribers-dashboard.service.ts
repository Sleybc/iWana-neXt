import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  DASHBOARD_SERIES_MONTHS,
  SubscribersDashboardSummarySchema,
  previousDashboardMonth,
  type SubscribersDashboardMonth,
  type SubscribersDashboardSummary,
} from '@iwana/shared';
import { SettingsPriorityTenantReadPort } from '../../../tenant/ports/settings-priority-tenant-read.port';

/** Entrada del cálculo: el tenant y su fecha civil ya resueltos. */
export interface SubscribersDashboardInput {
  tenantId: string;
  schemaName: string;
  /** Zona IANA del tenant; va como parámetro SQL, nunca interpolada. */
  timezone: string;
  /** Fecha civil AAAA-MM-DD del tenant al responder. */
  asOf: string;
}

interface MonthCountRow {
  kind: 'A' | 'C';
  month: string;
  total: number | string;
}

/**
 * Altas y bajas por mes civil del tenant (HLD-MOD02 v3.0 §3 N2, §8.2 y §8.3).
 *
 * - Altas: `activated_at` en el mes, sin borrado lógico, sin `import_batch_id` (G1-2).
 * - Bajas: filas `SUBSCRIBER` con `to_status = 'CANCELLED'` desde `ACTIVE`/`SUSPENDED` (G1-3).
 *   Los lotes que escriben la fila `SUBSCRIBER` sin cambio de estado no cuentan por el filtro
 *   de `from_status`.
 *
 * Los límites de mes se calculan en PostgreSQL con `timestamp AT TIME ZONE <zona>`, de modo que
 * el filtro usa la columna `timestamptz` sin transformarla.
 */
const SUMMARY_SQL = `
  SELECT 'A' AS kind,
         to_char(s.activated_at AT TIME ZONE $2::text, 'YYYY-MM') AS month,
         COUNT(*)::int AS total
    FROM subscribers s
   WHERE s.tenant_id = $1::uuid
     AND s.deleted_at IS NULL
     AND s.import_batch_id IS NULL
     AND s.activated_at >= (($3::date)::timestamp AT TIME ZONE $2::text)
     AND s.activated_at <  (($4::date)::timestamp AT TIME ZONE $2::text)
   GROUP BY 2
  UNION ALL
  SELECT 'C' AS kind,
         to_char(c.changed_at AT TIME ZONE $2::text, 'YYYY-MM') AS month,
         COUNT(*)::int AS total
    FROM crm_lifecycle_changes c
   WHERE c.tenant_id = $1::uuid
     AND c.entity_type = 'SUBSCRIBER'
     AND c.to_status = 'CANCELLED'
     AND c.from_status IN ('ACTIVE', 'SUSPENDED')
     AND c.changed_at >= (($3::date)::timestamp AT TIME ZONE $2::text)
     AND c.changed_at <  (($4::date)::timestamp AT TIME ZONE $2::text)
   GROUP BY 2
`;

/** Fecha civil AAAA-MM-DD de `instant` en la zona `timezone`. */
export function civilDateIn(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Mes civil siguiente a `month` (AAAA-MM). */
function nextMonth(month: string): string {
  const [year, value] = month.split('-').map(Number) as [number, number];
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`;
}

/** Los `count` meses ascendentes que terminan en `lastMonth`. */
export function monthsEndingAt(lastMonth: string, count: number): string[] {
  const months = [lastMonth];
  while (months.length < count) months.unshift(previousDashboardMonth(months[0]!));
  return months;
}

@Injectable()
export class SubscribersDashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
  ) {}

  /** Resumen del tenant del request; tenant y schema salen del JWT vía TenantContext. */
  async getSummary(): Promise<SubscribersDashboardSummary> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { timezone } = await this.tenantSettings.getSnapshot({ tenantId });
    return this.summarize({
      tenantId,
      schemaName,
      timezone,
      asOf: civilDateIn(new Date(), timezone),
    });
  }

  /** Cálculo con la fecha civil fijada; separado para poder probar límites de mes. */
  async summarize(input: SubscribersDashboardInput): Promise<SubscribersDashboardSummary> {
    const months = monthsEndingAt(input.asOf.slice(0, 7), DASHBOARD_SERIES_MONTHS);
    const rangeStart = `${months[0]}-01`;
    const rangeEnd = `${nextMonth(months[months.length - 1]!)}-01`;

    const rows = await runInTenantSchema(
      this.dataSource,
      input.schemaName,
      (qr) =>
        qr.query(SUMMARY_SQL, [input.tenantId, input.timezone, rangeStart, rangeEnd]) as Promise<
          MonthCountRow[]
        >,
    );

    const byMonth = new Map<string, SubscribersDashboardMonth>(
      months.map((month) => [month, { month, activations: 0, cancellations: 0 }]),
    );
    for (const row of rows) {
      const bucket = byMonth.get(row.month);
      if (!bucket) continue;
      if (row.kind === 'A') bucket.activations = Number(row.total);
      else bucket.cancellations = Number(row.total);
    }

    const series = months.map((month) => byMonth.get(month)!);
    const current = series[series.length - 1]!;
    return SubscribersDashboardSummarySchema.parse({
      asOf: input.asOf,
      activations: current.activations,
      cancellations: current.cancellations,
      series,
    });
  }
}
