'use client';

import {
  TENANT_STATUS_SUMMARY_PERIOD_MONTHS,
  type TenantStatusSummaryMonth,
  type TenantStatusSummaryPeriodMonths,
} from '@iwana/shared';
import {
  Button,
  Card,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  type BarSeries,
  type ChartPoint,
  type LineSeries,
} from '@iwana/ui';
import { WebChart } from '@/components/shared/web-chart';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.dashboard;

type FlowKey = 'created' | 'removed';
type ActiveKey = 'activeAtClose';

/** Contrato DS §7ter.7: altas en lima (avance, CA-PA-03); bajas huecas (ADR-112 D6). */
const FLOW_SERIES: readonly BarSeries<FlowKey>[] = [
  { key: 'created', label: COPY.trendCreated, token: 'chart-2', progress: true, mark: 'solid' },
  { key: 'removed', label: COPY.trendRemoved, token: 'chart-4', mark: 'outline' },
];
const ACTIVE_SERIES: readonly LineSeries<ActiveKey>[] = [
  { key: 'activeAtClose', label: COPY.trendActiveSeries, token: 'chart-1', mark: 'solid' },
];
const CHART_HEIGHT = 200;
const subheadingClassName = 'text-sm font-semibold text-gray-900 dark:text-white';

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
  /** Periodo vigente (dirección v1.2 §8.3); lo decide la URL. */
  months: TenantStatusSummaryPeriodMonths;
  onMonthsChange: (months: TenantStatusSummaryPeriodMonths) => void;
}

/**
 * B2 izquierda · Tendencia (P1, dirección §8.3; contrato DS §7ter.7): activas al cierre en línea
 * y altas y bajas en barras, dos `WebChart` en la misma tarjeta con un solo selector de periodo.
 */
export function TenantTrendPanel({
  monthly,
  currentMonth,
  isLoading,
  updating,
  error,
  onRetry,
  months,
  onMonthsChange,
}: TenantTrendPanelProps) {
  const flow: ChartPoint<FlowKey>[] = (monthly ?? []).map((month) => ({
    x: month.month,
    created: month.created,
    removed: month.removed,
  }));
  // Un mes sin historia reconstruible es `null` (nunca 0): corta la línea (dirección §8.3).
  const active: ChartPoint<ActiveKey>[] = (monthly ?? []).map((month) => ({
    x: month.month,
    activeAtClose: month.activeAtClose ?? null,
  }));
  const totals = flow.reduce(
    (sum, point) => ({
      created: sum.created + (point.created ?? 0),
      removed: sum.removed + (point.removed ?? 0),
    }),
    { created: 0, removed: 0 },
  );
  const knownActive = active.filter((point) => point.activeAtClose !== null).length;
  // Sin historia: todos los meses en null o sin la clave (payload v1.1). Con v1.2 el mes en
  // curso nunca es null, así que esto solo pasa por desfase de versión.
  const activeEmpty = knownActive === 0;
  const flowEmpty = totals.created + totals.removed === 0;
  // Vacío único solo si es verdad literal: activas en 0 todos los meses y sin altas ni bajas.
  const allEmpty =
    flowEmpty && active.length > 0 && active.every((point) => point.activeAtClose === 0);
  const chartCommon = {
    valueKind: 'count' as const,
    height: CHART_HEIGHT,
    formatX: formatTrendMonth,
    formatXLong: (key: string) => {
      const label = longMonth.format(monthDate(key));
      return key === currentMonth ? COPY.trendCurrentMonth(label) : label;
    },
    formatValue: (value: number) => integer.format(value),
    xHeader: COPY.trendMonthHeader,
    updating: updating ?? false,
  };

  let body;
  if (isLoading) {
    body = <ChartSkeleton />;
  } else if (error) {
    body = <ErrorState message={COPY.trendError} onRetry={onRetry} retryLabel={COPY.retry} />;
  } else {
    // Dos columnas desde xl (CA-PP2-06: la tarjeta cabe en 900 px a 1440 × 900); apiladas debajo.
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {allEmpty ? (
          <EmptyState className="xl:col-span-2" message={COPY.trendAllEmpty(months)} />
        ) : (
          <>
            <div className="min-w-0">
              <h3 className={subheadingClassName}>{COPY.trendActiveTitle}</h3>
              <div className="mt-2">
                {activeEmpty ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {COPY.trendActiveNoHistory}
                  </p>
                ) : (
                  <>
                    <WebChart
                      {...chartCommon}
                      kind="line"
                      data={active}
                      series={ACTIVE_SERIES}
                      summary={COPY.trendActiveSummary(months)}
                      tableCaption={COPY.trendActiveCaption}
                    />
                    {knownActive < active.length ? (
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        {COPY.trendActivePartial}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <h3 className={subheadingClassName}>{COPY.trendFlowTitle}</h3>
              <div className="mt-2">
                <WebChart
                  {...chartCommon}
                  kind="grouped-bar"
                  data={flow}
                  series={FLOW_SERIES}
                  status={flowEmpty ? 'empty' : 'ready'}
                  summary={COPY.trendSummary(months, totals.created, totals.removed)}
                  tableCaption={COPY.trendCaption}
                  emptyLabel={COPY.trendEmpty(months)}
                />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <Card role="region" className="flex h-full flex-col p-4" aria-labelledby="tendencia-empresas">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="tendencia-empresas"
            className="text-base font-semibold text-iwana-primary dark:text-white"
          >
            {COPY.trendTitle}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {COPY.trendSubtitle(months)}
          </p>
        </div>
        {/* Veredicto 6 de ds-owner (§7ter.6): composición del portal, sin primitive nueva. */}
        <div
          role="group"
          aria-label={COPY.trendPeriodGroup}
          className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 dark:bg-dark-surface-3"
        >
          {TENANT_STATUS_SUMMARY_PERIOD_MONTHS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              className="min-h-11"
              variant={months === option ? 'primary' : 'ghost'}
              aria-pressed={months === option}
              onClick={() => onMonthsChange(option)}
            >
              {COPY.trendPeriodOption(option)}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-3">{body}</div>
    </Card>
  );
}
