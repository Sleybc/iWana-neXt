// apps/portal/src/components/dashboard/dashboard-trend.ts
import type { PortalChartProps } from '@/components/shared/portal-chart';
import type {
  AssuranceDashboardSeries,
  BillingDashboardSummary,
  SubscribersDashboardSummary,
} from '@/lib/api-client';
import { formatBillingMoney } from '@/components/billing/billing-copy';
import { DASHBOARD_TREND_REGISTRY, type DashboardTrendId } from './dashboard-role-composition';
import { formatDashboardMoneyCompact, formatDashboardNumber } from './dashboard-visuals';

/**
 * Pestañas del bloque Tendencia (HLD-MOD02 v3.0 §6; contrato DS de gráficas §4 y §6).
 * Las claves de mes y día llegan como fecha civil del tenant (`AAAA-MM`, `AAAA-MM-DD`) y se leen
 * partiendo la cadena: nunca `new Date('2026-11')`, que el navegador interpreta en UTC o en su
 * propia zona según el formato.
 */

const UTC = 'UTC';
const monthShortFormat = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: UTC });
const monthNameFormat = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: UTC });
const monthLongFormat = new Intl.DateTimeFormat('es-CO', {
  month: 'long',
  year: 'numeric',
  timeZone: UTC,
});
const dayLongFormat = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: UTC,
});

/** Instante UTC del día civil `AAAA-MM[-DD]`, solo para formatear con `timeZone: 'UTC'`. */
function civilKeyToUtc(key: string): number {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Eje: «nov.». */
export function formatTrendMonth(month: string): string {
  return monthShortFormat.format(civilKeyToUtc(month));
}

/** Tooltip y tabla: «noviembre de 2026», y «(en curso)» en el mes de la lectura. */
export function formatTrendMonthLong(month: string, currentMonth: string): string {
  const label = monthLongFormat.format(civilKeyToUtc(month));
  return month === currentMonth ? `${label} (en curso)` : label;
}

/** Eje: «16». */
export function formatTrendDay(date: string): string {
  return String(Number(date.split('-')[2]));
}

/** Tooltip y tabla: «lunes, 16 de noviembre», y «(hoy)» en el día de la lectura. */
export function formatTrendDayLong(date: string, today: string): string {
  const label = dayLongFormat.format(civilKeyToUtc(date));
  return date === today ? `${label} (hoy)` : label;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatDashboardNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

type SubscribersKey = 'activations' | 'cancellations';
type CollectionsKey = 'invoiced' | 'collected';
type CasesKey = 'created' | 'resolved';

interface DashboardTrendTabBase<Id extends DashboardTrendId> {
  id: Id;
  label: string;
  /** Frase bajo el título del bloque. */
  subtitle: string;
}

export type DashboardTrendTab =
  | (DashboardTrendTabBase<'subscribers'> & { chart: PortalChartProps<SubscribersKey> })
  | (DashboardTrendTabBase<'collections'> & { chart: PortalChartProps<CollectionsKey> })
  | (DashboardTrendTabBase<'cases'> & { chart: PortalChartProps<CasesKey> });

function subscribersTab(data: SubscribersDashboardSummary, updating: boolean): DashboardTrendTab {
  const current = data.asOf.slice(0, 7);
  return {
    id: 'subscribers',
    label: DASHBOARD_TREND_REGISTRY.subscribers.label,
    subtitle: 'Altas y retiros por mes · últimos 12 meses',
    chart: {
      kind: 'grouped-bar',
      data: data.series.map((month) => ({
        x: month.month,
        activations: month.activations,
        cancellations: month.cancellations,
      })),
      series: [
        { key: 'activations', label: 'Altas', token: 'chart-2', progress: true, mark: 'solid' },
        { key: 'cancellations', label: 'Retiros', token: 'chart-4', mark: 'outline' },
      ],
      valueKind: 'count',
      formatX: formatTrendMonth,
      formatXLong: (month) => formatTrendMonthLong(month, current),
      formatValue: formatDashboardNumber,
      summary: `Altas y retiros de suscriptores por mes. En ${monthNameFormat.format(
        civilKeyToUtc(current),
      )}: ${plural(data.activations, 'alta', 'altas')} y ${plural(
        data.cancellations,
        'retiro',
        'retiros',
      )}.`,
      xHeader: 'Mes',
      tableCaption: 'Altas y retiros de suscriptores por mes, últimos 12 meses',
      updating,
    },
  };
}

function collectionsTab(data: BillingDashboardSummary, updating: boolean): DashboardTrendTab {
  const current = data.asOf.slice(0, 7);
  return {
    id: 'collections',
    label: DASHBOARD_TREND_REGISTRY.collections.label,
    subtitle: 'Facturado frente a recaudado · últimos 12 meses',
    chart: {
      kind: 'grouped-bar',
      // Texto decimal → número solo para graficar (exacto en COP por debajo de 2^53).
      data: data.series.map((month) => ({
        x: month.month,
        invoiced: Number(month.invoicedAmount),
        collected: Number(month.collectedAmount),
      })),
      series: [
        { key: 'invoiced', label: 'Facturado', token: 'chart-4', mark: 'outline' },
        { key: 'collected', label: 'Recaudado', token: 'chart-1', mark: 'solid' },
      ],
      valueKind: 'amount',
      formatX: formatTrendMonth,
      formatXLong: (month) => formatTrendMonthLong(month, current),
      formatValue: formatBillingMoney,
      formatAxisValue: formatDashboardMoneyCompact,
      summary: `Facturado y recaudado por mes. En ${monthNameFormat.format(
        civilKeyToUtc(current),
      )}, mes en curso: ${formatDashboardMoneyCompact(
        Number(data.invoicedAmount),
      )} facturado y ${formatDashboardMoneyCompact(Number(data.collectedAmount))} recaudado.`,
      xHeader: 'Mes',
      tableCaption: 'Facturado y recaudado por mes, últimos 12 meses',
      updating,
    },
  };
}

function casesTab(data: AssuranceDashboardSeries, updating: boolean): DashboardTrendTab {
  const today = data.series[data.series.length - 1];
  return {
    id: 'cases',
    label: DASHBOARD_TREND_REGISTRY.cases.label,
    subtitle: `Casos creados frente a resueltos · últimos ${formatDashboardNumber(data.days)} días`,
    chart: {
      kind: 'line',
      data: data.series.map((day) => ({
        x: day.date,
        created: day.created,
        resolved: day.resolved,
      })),
      series: [
        { key: 'created', label: 'Creados', token: 'chart-1', mark: 'solid' },
        { key: 'resolved', label: 'Resueltos', token: 'chart-2', progress: true, mark: 'dashed' },
      ],
      valueKind: 'count',
      formatX: formatTrendDay,
      formatXLong: (date) => formatTrendDayLong(date, data.asOf),
      formatValue: formatDashboardNumber,
      summary: today
        ? `Casos creados y resueltos por día. Hoy: ${plural(
            today.created,
            'creado',
            'creados',
          )} y ${plural(today.resolved, 'resuelto', 'resueltos')}.`
        : 'Casos creados y resueltos por día.',
      xHeader: 'Día',
      tableCaption: `Casos creados y resueltos por día, últimos ${formatDashboardNumber(data.days)} días`,
      updating,
    },
  };
}

export interface DashboardTrendSource<T> {
  /** `null` si la fuente falló, no está autorizada o aún no respondió: la pestaña no se ofrece. */
  data: T | null;
  updating: boolean;
}

export const DASHBOARD_PERIODS = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7-dias', label: '7 días' },
  { id: 'mes', label: 'Este mes' },
  { id: '12-meses', label: '12 meses' },
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]['id'];

export function readDashboardPeriod(search: string): DashboardPeriod {
  const value = new URLSearchParams(search).get('periodo');
  return DASHBOARD_PERIODS.find(({ id }) => id === value)?.id ?? 'mes';
}

function restrictTab(tab: DashboardTrendTab, period: DashboardPeriod): DashboardTrendTab | null {
  if (tab.id === 'cases') {
    if (period === '12-meses') return null;
    const last = tab.chart.data.at(-1)?.x;
    const data =
      period === 'mes'
        ? tab.chart.data.filter(({ x }) => x.slice(0, 7) === last?.slice(0, 7))
        : tab.chart.data.slice(period === 'hoy' ? -1 : -7);
    if (!data.length) return null;
    const windowLabel = period === 'mes' ? 'este mes' : period === 'hoy' ? 'hoy' : 'últimos 7 días';
    const chart = {
      ...tab.chart,
      data,
      tableCaption: `Casos creados y resueltos por día, ${windowLabel}`,
    };
    return {
      ...tab,
      subtitle: `Casos creados frente a resueltos · ${windowLabel}`,
      chart:
        data.length === 1
          ? {
              ...chart,
              kind: 'grouped-bar',
              series: [
                { key: 'created', label: 'Creados', token: 'chart-1', mark: 'solid' },
                {
                  key: 'resolved',
                  label: 'Resueltos',
                  token: 'chart-2',
                  progress: true,
                  mark: 'outline',
                },
              ],
            }
          : chart,
    };
  }
  if (period === 'hoy' || period === '7-dias') return null;
  if (period === '12-meses') return tab;
  if (tab.id === 'subscribers') {
    return {
      ...tab,
      subtitle: 'Altas y retiros · este mes',
      chart: {
        ...tab.chart,
        data: tab.chart.data.slice(-1),
        tableCaption: 'Altas y retiros de suscriptores, este mes',
      },
    };
  }
  return {
    ...tab,
    subtitle: 'Facturado frente a recaudado · este mes',
    chart: {
      ...tab.chart,
      data: tab.chart.data.slice(-1),
      tableCaption: 'Facturado y recaudado, este mes',
    },
  };
}

/**
 * Pestañas con dato, en el orden de la composición del rol. Una fuente sin dato no ofrece su
 * pestaña; nunca se rellena con ceros ni con una serie de muestra (HLD §2, CA-PA-05).
 */
export function buildDashboardTrendTabs(input: {
  trendIds: readonly DashboardTrendId[];
  subscribers: DashboardTrendSource<SubscribersDashboardSummary>;
  collections: DashboardTrendSource<BillingDashboardSummary>;
  cases: DashboardTrendSource<AssuranceDashboardSeries>;
  period?: DashboardPeriod;
}): DashboardTrendTab[] {
  const tabs: DashboardTrendTab[] = [];
  for (const id of input.trendIds) {
    if (id === 'subscribers' && input.subscribers.data) {
      tabs.push(subscribersTab(input.subscribers.data, input.subscribers.updating));
    } else if (id === 'collections' && input.collections.data) {
      tabs.push(collectionsTab(input.collections.data, input.collections.updating));
    } else if (id === 'cases' && input.cases.data) {
      tabs.push(casesTab(input.cases.data, input.cases.updating));
    }
  }
  const { period } = input;
  return period ? tabs.flatMap((tab) => restrictTab(tab, period) ?? []) : tabs;
}
