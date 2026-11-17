import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  AssuranceDashboardSeriesSchema,
  previousDashboardDate,
  type AssuranceDashboardDay,
  type AssuranceDashboardSeries,
} from '@iwana/shared';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';

/** Entrada del cálculo: el tenant y su fecha civil ya resueltos. */
export interface AssuranceDashboardSeriesInput {
  tenantId: string;
  schemaName: string;
  /** Zona IANA del tenant; va como parámetro SQL, nunca interpolada. */
  timezone: string;
  /** Fecha civil AAAA-MM-DD del tenant al responder; último día de la serie. */
  asOf: string;
  /** Días de la serie, ya validados por `AssuranceDashboardSeriesQuerySchema` (7–31). */
  days: number;
}

interface DayCountRow {
  kind: 'C' | 'R';
  day: string;
  total: number | string;
}

/**
 * Casos creados y resueltos por día civil del tenant (HLD-MOD02 v3.0 §3 N3 y §8.4).
 * Excluye los casos importados (`import_batch_id IS NOT NULL`): sin fecha de origen caerían en
 * el día de la importación. `resolved_at` es la última resolución del caso.
 *
 * Los límites de día se calculan en PostgreSQL con `timestamp AT TIME ZONE <zona>`, de modo que
 * el filtro usa las columnas `timestamptz` sin transformarlas.
 */
const SERIES_SQL = `
  SELECT 'C' AS kind,
         to_char(t.created_at AT TIME ZONE $2::text, 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS total
    FROM support_tickets t
   WHERE t.tenant_id = $1::uuid
     AND t.import_batch_id IS NULL
     AND t.created_at >= (($3::date)::timestamp AT TIME ZONE $2::text)
     AND t.created_at <  (($4::date)::timestamp AT TIME ZONE $2::text)
   GROUP BY 2
  UNION ALL
  SELECT 'R' AS kind,
         to_char(t.resolved_at AT TIME ZONE $2::text, 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS total
    FROM support_tickets t
   WHERE t.tenant_id = $1::uuid
     AND t.import_batch_id IS NULL
     AND t.resolved_at >= (($3::date)::timestamp AT TIME ZONE $2::text)
     AND t.resolved_at <  (($4::date)::timestamp AT TIME ZONE $2::text)
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

/** Día civil siguiente a `date` (AAAA-MM-DD). */
function nextDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

/** Los `count` días civiles ascendentes que terminan en `lastDate`, incluido. */
export function datesEndingAt(lastDate: string, count: number): string[] {
  const dates = [lastDate];
  while (dates.length < count) dates.unshift(previousDashboardDate(dates[0]!));
  return dates;
}

@Injectable()
export class AssuranceDashboardSeriesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
  ) {}

  /** Serie del tenant del request; tenant y schema salen del JWT vía TenantContext. */
  async getSeries(days: number): Promise<AssuranceDashboardSeries> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { timezone } = await this.tenantSettings.getSnapshot({ tenantId });
    return this.summarize({
      tenantId,
      schemaName,
      timezone,
      asOf: civilDateIn(new Date(), timezone),
      days,
    });
  }

  /** Cálculo con la fecha civil fijada; separado para poder probar límites de día. */
  async summarize(input: AssuranceDashboardSeriesInput): Promise<AssuranceDashboardSeries> {
    const dates = datesEndingAt(input.asOf, input.days);
    const rangeStart = dates[0]!;
    const rangeEnd = nextDate(input.asOf);

    const rows = await runInTenantSchema(
      this.dataSource,
      input.schemaName,
      (qr) =>
        qr.query(SERIES_SQL, [input.tenantId, input.timezone, rangeStart, rangeEnd]) as Promise<
          DayCountRow[]
        >,
    );

    const byDate = new Map<string, AssuranceDashboardDay>(
      dates.map((date) => [date, { date, created: 0, resolved: 0 }]),
    );
    for (const row of rows) {
      const bucket = byDate.get(row.day);
      if (!bucket) continue;
      if (row.kind === 'C') bucket.created = Number(row.total);
      else bucket.resolved = Number(row.total);
    }

    return AssuranceDashboardSeriesSchema.parse({
      asOf: input.asOf,
      days: input.days,
      series: dates.map((date) => byDate.get(date)!),
    });
  }
}
