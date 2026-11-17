// apps/portal/src/components/dashboard/dashboard-series-test-fixtures.ts
import type {
  AssuranceDashboardSeries,
  BillingDashboardSummary,
  SubscribersDashboardSummary,
} from '@/lib/api-client';

/**
 * Respuestas N1–N3 válidas para pruebas del inicio: cumplen los esquemas congelados de
 * `@iwana/shared` (series contiguas que terminan en `asOf`, tramos que suman la cartera).
 */

const MONTHS = [
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
] as const;

export function billingSummaryFixture(
  overrides: Partial<BillingDashboardSummary> = {},
): BillingDashboardSummary {
  return {
    asOf: '2026-11-17',
    invoicedAmount: '182600000.00',
    collectedAmount: '148200000.00',
    overdue: {
      amount: '36900000.00',
      documentCount: 260,
      subscriberCount: 214,
      buckets: [
        { bucket: '1_30', amount: '14800000.00', documentCount: 120 },
        { bucket: '31_60', amount: '9600000.00', documentCount: 70 },
        { bucket: '61_90', amount: '6100000.00', documentCount: 40 },
        { bucket: '90_plus', amount: '6400000.00', documentCount: 30 },
      ],
    },
    series: MONTHS.map((month, index) =>
      index === MONTHS.length - 1
        ? { month, invoicedAmount: '182600000.00', collectedAmount: '148200000.00' }
        : { month, invoicedAmount: '160000000.00', collectedAmount: '150000000.00' },
    ),
    ...overrides,
  };
}

export function subscribersSummaryFixture(
  overrides: Partial<SubscribersDashboardSummary> = {},
): SubscribersDashboardSummary {
  const activations = overrides.activations ?? 61;
  const cancellations = overrides.cancellations ?? 23;
  return {
    asOf: '2026-11-17',
    activations,
    cancellations,
    series: MONTHS.map((month, index) =>
      index === MONTHS.length - 1
        ? { month, activations, cancellations }
        : { month, activations: 40 + index, cancellations: 20 },
    ),
    ...overrides,
  };
}

export function casesSeriesFixture(): AssuranceDashboardSeries {
  const series = Array.from({ length: 14 }, (_, index) => ({
    date: `2026-11-${String(4 + index).padStart(2, '0')}`,
    created: 8 + (index % 4),
    resolved: 7 + (index % 3),
  }));
  series[13] = { date: '2026-11-17', created: 11, resolved: 9 };
  return { asOf: '2026-11-17', days: 14, series };
}
