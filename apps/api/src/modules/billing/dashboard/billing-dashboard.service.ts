import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BILLING_OVERDUE_BUCKETS,
  BillingDashboardSummarySchema,
  type BillingDashboardSummary,
  type BillingOverdueBucket,
} from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { activeCourtesySum } from '../courtesies/billing-courtesy.sql';

// Copia literal de PAID_SQL de documents/billing-documents.service.ts (no exportada; ese archivo
// tiene cambios ajenos). HLD-MOD02 v3.0 §8.7: la integración de N1 reconcilia contra la lista de
// documentos y falla si las dos expresiones divergen. Deuda P3: helper compartido de billing.
const PAID_SQL = `COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a
                  JOIN billing_payments p2 ON p2.id = a.payment_id
                 WHERE a.document_id = d.id AND a.reversed_at IS NULL AND p2.status = 'REGISTRADO'), 0)`;

/** Días desde `due_date` (inclusive) por tramo; el último no tiene tope. */
const BUCKET_BOUNDS: Record<BillingOverdueBucket, readonly [number, number | null]> = {
  '1_30': [1, 30],
  '31_60': [31, 60],
  '61_90': [61, 90],
  '90_plus': [91, null],
};

function bucketColumns(): string {
  return BILLING_OVERDUE_BUCKETS.map((bucket) => {
    const [from, to] = BUCKET_BOUNDS[bucket];
    const condition = to === null ? `o.days >= ${from}` : `o.days BETWEEN ${from} AND ${to}`;
    return `COALESCE(SUM(o.pending) FILTER (WHERE ${condition}), 0)::numeric(14,2)::text AS "amount_${bucket}",
            COUNT(*) FILTER (WHERE ${condition})::int AS "count_${bucket}"`;
  }).join(',\n            ');
}

/**
 * Una sola sentencia (una sola instantánea): 12 filas de la serie mensual, con la cartera vencida
 * repetida en cada fila. `$1` tenant, `$2` instante, `$3` zona horaria del tenant. Las fechas de
 * facturación (`issue_date`, `due_date`, `paid_at`) ya son civiles: solo `asOf` se convierte.
 */
const SUMMARY_SQL = `
WITH clock AS (
  SELECT (($2::timestamptz) AT TIME ZONE $3::text)::date AS as_of
),
bounds AS (
  SELECT as_of,
         (date_trunc('month', as_of::timestamp) - interval '11 months')::date AS first_month,
         (date_trunc('month', as_of::timestamp) + interval '1 month')::date AS next_month
    FROM clock
),
months AS (
  SELECT m::date AS start
    FROM bounds,
         generate_series(bounds.first_month::timestamp, bounds.next_month::timestamp - interval '1 month',
                         interval '1 month') AS m
),
invoiced AS (
  SELECT date_trunc('month', d.issue_date::timestamp)::date AS start, SUM(d.total) AS amount
    FROM billing_documents d, bounds
   WHERE d.tenant_id = $1 AND d.status IN ('EMITIDO', 'IMPORTADO')
     AND d.issue_date >= bounds.first_month AND d.issue_date < bounds.next_month
   GROUP BY 1
),
collected AS (
  SELECT date_trunc('month', p.paid_at::timestamp)::date AS start, SUM(p.amount) AS amount
    FROM billing_payments p, bounds
   WHERE p.tenant_id = $1 AND p.status = 'REGISTRADO'
     AND p.paid_at >= bounds.first_month AND p.paid_at < bounds.next_month
   GROUP BY 1
),
-- MATERIALIZED: sin él, PostgreSQL inlinea el saldo y repite sus subconsultas en cada FILTER.
open_documents AS MATERIALIZED (
  SELECT d.subscriber_id, (clock.as_of - d.due_date) AS days,
         GREATEST(d.total - ${PAID_SQL} - ${activeCourtesySum('d')}, 0) AS pending
    FROM billing_documents d, clock
   WHERE d.tenant_id = $1 AND d.status IN ('EMITIDO', 'IMPORTADO') AND clock.as_of > d.due_date
),
overdue AS (
  SELECT COALESCE(SUM(o.pending), 0)::numeric(14,2)::text AS overdue_amount,
         COUNT(*)::int AS overdue_count,
         COUNT(DISTINCT o.subscriber_id)::int AS overdue_subscribers,
            ${bucketColumns()}
    FROM open_documents o
   WHERE o.pending > 0
)
SELECT to_char(months.start, 'YYYY-MM') AS month,
       COALESCE(invoiced.amount, 0)::numeric(14,2)::text AS invoiced_amount,
       COALESCE(collected.amount, 0)::numeric(14,2)::text AS collected_amount,
       bounds.as_of::text AS as_of,
       overdue.*
  FROM months
  CROSS JOIN bounds
  CROSS JOIN overdue
  LEFT JOIN invoiced ON invoiced.start = months.start
  LEFT JOIN collected ON collected.start = months.start
 ORDER BY months.start`;

type SummaryRow = {
  month: string;
  invoiced_amount: string;
  collected_amount: string;
  as_of: string;
  overdue_amount: string;
  overdue_count: number;
  overdue_subscribers: number;
} & Record<`amount_${BillingOverdueBucket}`, string> &
  Record<`count_${BillingOverdueBucket}`, number>;

/**
 * N1 · resumen de facturación del inicio (HLD-MOD02 v3.0 §3 N1 y §8). Solo sumas y conteos del
 * tenant del JWT; sin identificadores de persona. No registra montos en logs.
 */
@Injectable()
export class BillingDashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
  ) {}

  /** `now` solo lo fijan las pruebas; en la API es el instante de la petición. */
  async summary(now: Date = new Date()): Promise<BillingDashboardSummary> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { timezone } = await this.tenantSettings.getSnapshot({ tenantId });
    const rows = await runInTenantSchema(
      this.dataSource,
      schemaName,
      (qr) =>
        qr.query(SUMMARY_SQL, [tenantId, now.toISOString(), timezone]) as Promise<SummaryRow[]>,
    );
    const first = rows[0];
    if (!first) throw new Error('La serie de facturación no devolvió meses.');
    const current = rows[rows.length - 1]!;
    return BillingDashboardSummarySchema.parse({
      asOf: first.as_of,
      invoicedAmount: current.invoiced_amount,
      collectedAmount: current.collected_amount,
      overdue: {
        amount: first.overdue_amount,
        documentCount: first.overdue_count,
        subscriberCount: first.overdue_subscribers,
        buckets: BILLING_OVERDUE_BUCKETS.map((bucket) => ({
          bucket,
          amount: first[`amount_${bucket}`],
          documentCount: first[`count_${bucket}`],
        })),
      },
      series: rows.map((row) => ({
        month: row.month,
        invoicedAmount: row.invoiced_amount,
        collectedAmount: row.collected_amount,
      })),
    });
  }
}
