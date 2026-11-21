'use client';

import type { TenantStatusSummaryMonth } from '@iwana/shared';
import { Card, ChartSkeleton, ErrorState, type BarSeries, type ChartPoint } from '@iwana/ui';
import { WebChart } from '@/components/shared/web-chart';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.dashboard;

type TrendKey = 'created' | 'removed';

/** Altas en lima (avance, CA-PA-03); bajas en el tono neutro de la paleta. */
const TREND_SERIES: readonly BarSeries<TrendKey>[] = [
  { key: 'created', label: COPY.trendCreated, token: 'chart-2', progress: true, mark: 'solid' },
  { key: 'removed', label: COPY.trendRemoved, token: 'chart-4', mark: 'solid' },
];

const shortMonth = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });
const longMonth = new Intl.DateTimeFormat('es-CO', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const integer = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** `YYYY-MM` es una clave civil ya calculada en America/Bogota: se lee en UTC para no correr el mes. */
function monthDate(key: string): Date {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1));
}

export function formatTrendMonth(key: string): string {
  return shortMonth.format(monthDate(key)).replace('.', '');
}

interface TenantTrendPanelProps {
  monthly: readonly TenantStatusSummaryMonth[] | null;
  /** Mes en curso (`period.month`), marcado en el tooltip y la tabla. */
  currentMonth: string | null;
  isLoading: boolean;
  updating?: boolean;
  error: boolean;
  onRetry: () => void;
}

/** B2 izquierda · Tendencia: altas y bajas por mes, 12 meses (P1, dirección §4). */
export function TenantTrendPanel({
  monthly,
  currentMonth,
  isLoading,
  updating,
  error,
  onRetry,
}: TenantTrendPanelProps) {
  const data: ChartPoint<TrendKey>[] = (monthly ?? []).map((month) => ({
    x: month.month,
    created: month.created,
    removed: month.removed,
  }));
  const totals = data.reduce(
    (sum, point) => ({
      created: sum.created + (point.created ?? 0),
      removed: sum.removed + (point.removed ?? 0),
    }),
    { created: 0, removed: 0 },
  );

  return (
    <Card role="region" className="flex h-full flex-col p-4" aria-labelledby="tendencia-empresas">
      <h2
        id="tendencia-empresas"
        className="text-base font-semibold text-iwana-primary dark:text-white"
      >
        {COPY.trendTitle}
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{COPY.trendSubtitle}</p>
      <div className="mt-3">
        {isLoading ? (
          <ChartSkeleton />
        ) : error ? (
          <ErrorState message={COPY.trendError} onRetry={onRetry} retryLabel={COPY.retry} />
        ) : (
          <WebChart
            kind="grouped-bar"
            data={data}
            series={TREND_SERIES}
            status={totals.created + totals.removed === 0 ? 'empty' : 'ready'}
            updating={updating ?? false}
            valueKind="count"
            height={220}
            formatX={formatTrendMonth}
            formatXLong={(key) => {
              const label = longMonth.format(monthDate(key));
              return key === currentMonth ? COPY.trendCurrentMonth(label) : label;
            }}
            formatValue={(value) => integer.format(value)}
            summary={COPY.trendSummary(totals.created, totals.removed)}
            xHeader={COPY.trendMonthHeader}
            tableCaption={COPY.trendCaption}
            emptyLabel={COPY.trendEmpty}
          />
        )}
      </div>
    </Card>
  );
}
