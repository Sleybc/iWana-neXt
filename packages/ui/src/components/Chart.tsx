'use client';

import * as React from 'react';
import { interactiveFocusClassName } from '../focus';
import { cn } from '../lib/utils';
import { Button } from './Button';

/**
 * Marco de gráficas del portal — contrato DS `docs/specs/2026-11-17-portal-graficas-ds-contrato.md`
 * (ADR-112). Este módulo NO importa Recharts: leyenda, conmutador, tabla alternativa, estados y
 * skeleton viven en el JS inicial y se renderizan en servidor. El SVG lo dibuja `ChartPlot`
 * (entrada `@iwana/ui/chart`), que la app inyecta en `Plot` con carga diferida.
 */

export type ChartToken = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4';
export type ChartKind = 'grouped-bar' | 'line';

/** El lima (`chart-2`) exige declarar la serie como avance (CA-PA-03). */
type ChartColor =
  | { token: Exclude<ChartToken, 'chart-2'>; progress?: false }
  | { token: 'chart-2'; progress: true };

type SeriesBase<K extends string> = { key: K; label: string } & ChartColor;
export type BarSeries<K extends string> = SeriesBase<K> & { mark: 'solid' | 'outline' };
export type LineSeries<K extends string> = SeriesBase<K> & { mark: 'solid' | 'dashed' };
export type ChartSeries<K extends string> = BarSeries<K> | LineSeries<K>;

/** `x`: clave civil ya calculada en la zona del tenant ('2026-11', '2026-11-16'). El wrapper no parsea fechas. */
export type ChartPoint<K extends string> = { x: string } & { [P in K]: number | null };

export type ChartStatus = 'ready' | 'loading' | 'empty' | 'error';

interface ChartCommon<K extends string> {
  data: readonly ChartPoint<K>[];
  /** Eje: «nov», «16». */
  formatX: (x: string) => string;
  /** Tooltip y tabla: «noviembre de 2026 (en curso)». */
  formatXLong: (x: string) => string;
  /** Tooltip, leyenda y tabla, valor completo. */
  formatValue: (v: number) => string;
  /** Eje Y compacto («182 M»); por defecto `formatValue`. */
  formatAxisValue?: (v: number) => string;
  /** `count`: ticks enteros. */
  valueKind: 'count' | 'amount';
  /** px; defecto 240, mínimo 160. */
  height?: number;
  /** `aria-label` de `role="img"`; obligatorio y redactado con los datos. */
  summary: string;
  /** Primer `<th>`: «Mes», «Día». */
  xHeader: string;
  /** `<caption>` de la tabla. */
  tableCaption: string;
  status?: ChartStatus;
  /** Conserva la última lectura y avisa por `aria-live`. */
  updating?: boolean;
  emptyLabel?: string;
  emptyAction?: React.ReactNode;
  /** Solo con `status='error'`. */
  onRetry?: () => void;
  defaultView?: 'chart' | 'table';
  /** Lo inyecta `PortalChart`; las pantallas no lo pasan. */
  Plot: React.ComponentType<ChartPlotProps<K>>;
}

export type ChartProps<K extends string> = ChartCommon<K> &
  (
    | { kind: 'grouped-bar'; series: readonly BarSeries<K>[] }
    | { kind: 'line'; series: readonly LineSeries<K>[] }
  );

export type ChartPlotProps<K extends string> = Pick<
  ChartProps<K>,
  | 'kind'
  | 'data'
  | 'series'
  | 'formatX'
  | 'formatXLong'
  | 'formatValue'
  | 'formatAxisValue'
  | 'valueKind'
  | 'height'
>;

export const CHART_DEFAULT_HEIGHT = 240;
export const CHART_MIN_HEIGHT = 160;
const DEFAULT_EMPTY_LABEL = 'Sin datos en el periodo';
const NO_VALUE_LABEL = 'Sin dato';

/**
 * Color de la serie como custom property (`--chart-N`, claro/oscuro en `globals.css`).
 * Literales a propósito: Tailwind 4 solo emite las variables de `@theme` que encuentra
 * escritas en las fuentes escaneadas; una plantilla `var(--${token})` las dejaría fuera del CSS.
 */
const CHART_TOKEN_VAR: Record<ChartToken, string> = {
  'chart-1': 'var(--chart-1)',
  'chart-2': 'var(--chart-2)',
  'chart-3': 'var(--chart-3)',
  'chart-4': 'var(--chart-4)',
};

export function chartTokenColor(token: ChartToken): string {
  return CHART_TOKEN_VAR[token];
}

/** Relleno hueco de la barra `outline`: 20 % del token (el borde de 2 px lleva el 3:1). */
export function chartOutlineFill(token: ChartToken): string {
  return `color-mix(in srgb, ${CHART_TOKEN_VAR[token]} 20%, transparent)`;
}

export function resolveChartHeight(height: number | undefined): number {
  return Math.max(CHART_MIN_HEIGHT, height ?? CHART_DEFAULT_HEIGHT);
}

/**
 * Clases del lienzo compartidas con `ChartPlot`. Viven aquí (archivo escaneado por el
 * `@source` de `globals.css`) para que Tailwind genere las utilidades que usa la entrada
 * diferida. `color` = rejilla (la rejilla pinta con `currentColor`).
 */
export const chartCanvasClassName = 'text-iwana-neutral-200 dark:text-dark-border';
export const chartAxisTickClassName = 'fill-gray-600 font-mono text-[11px] dark:fill-gray-400';
export const chartTooltipClassName =
  'min-w-40 rounded-xl border bg-white px-3 py-2 text-xs text-iwana-primary shadow-iwana dark:bg-dark-surface-3 dark:text-gray-100';
export const chartTooltipTitleClassName = 'mb-1 font-semibold';
export const chartTooltipRowClassName = 'flex items-center gap-2';
export const chartValueClassName = 'ml-auto font-mono tabular-nums';

function formatMaybe(value: number | null | undefined, formatValue: (v: number) => string) {
  return value === null || value === undefined ? NO_VALUE_LABEL : formatValue(value);
}

/** Muestra de la serie: reproduce el `mark` (línea continua/discontinua 14 px; cuadro pleno/hueco 10 px). */
export function ChartSwatch({
  kind,
  token,
  mark,
}: {
  kind: ChartKind;
  token: ChartToken;
  mark: BarSeries<string>['mark'] | LineSeries<string>['mark'];
}) {
  const color = chartTokenColor(token);
  if (kind === 'line') {
    return (
      <svg aria-hidden="true" width={14} height={10} viewBox="0 0 14 10" className="shrink-0">
        <line
          x1={0}
          y1={5}
          x2={14}
          y2={5}
          stroke={color}
          strokeWidth={2}
          strokeDasharray={mark === 'dashed' ? '5 4' : undefined}
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width={10} height={10} viewBox="0 0 10 10" className="shrink-0">
      <rect
        x={1}
        y={1}
        width={8}
        height={8}
        rx={1.5}
        fill={mark === 'outline' ? chartOutlineFill(token) : color}
        stroke={color}
        strokeWidth={mark === 'outline' ? 2 : 0}
      />
    </svg>
  );
}

export interface ChartSkeletonProps {
  kind?: ChartKind | undefined;
  className?: string | undefined;
}

/**
 * Placeholder de carga: rejilla + 6 barras o una línea. Llena el alto del contenedor (el
 * marco fija `height`), así el paso skeleton → gráfica no mueve el layout.
 */
export function ChartSkeleton({ kind = 'grouped-bar', className }: ChartSkeletonProps) {
  const bars = [45, 70, 55, 85, 60, 75];
  return (
    <div aria-busy="true" className={cn('relative h-full min-h-10 w-full', className)}>
      <span className="sr-only">Cargando gráfica</span>
      <div
        aria-hidden="true"
        className="absolute inset-0 flex flex-col justify-between py-1 motion-safe:animate-pulse"
      >
        {[0, 1, 2, 3].map((line) => (
          <div key={line} className="h-px w-full bg-gray-100 dark:bg-dark-surface-3" />
        ))}
      </div>
      {kind === 'line' ? (
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full text-gray-200 motion-safe:animate-pulse dark:text-dark-surface-4"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            points="0,70 20,55 40,62 60,40 80,48 100,30"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-end justify-around px-4 motion-safe:animate-pulse"
        >
          {bars.map((value, index) => (
            <div
              key={index}
              className="w-4 rounded-t-[3px] bg-gray-100 dark:bg-dark-surface-3"
              style={{ height: `${value}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** El chunk diferido de `ChartPlot` o su render fallaron: el marco pasa a la tabla. */
class ChartPlotBoundary extends React.Component<
  { onFailure: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onFailure();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function assertSeriesContract(series: readonly ChartSeries<string>[]) {
  if (process.env.NODE_ENV === 'production') return;
  if (series.length < 1 || series.length > 4) {
    throw new Error(`Chart: se admiten de 1 a 4 series (recibidas ${series.length}).`);
  }
  if (new Set(series.map((item) => item.key)).size !== series.length) {
    throw new Error('Chart: cada serie necesita una `key` única.');
  }
  if (new Set(series.map((item) => item.token)).size !== series.length) {
    throw new Error('Chart: cada serie necesita un `token` único.');
  }
}

/** Vacío = sin puntos o todos los valores `null`. Una serie toda en 0 es dato. */
export function isChartDataEmpty<K extends string>(
  data: readonly ChartPoint<K>[],
  series: readonly ChartSeries<K>[],
): boolean {
  return data.every((point) => series.every((item) => point[item.key] === null));
}

const stateMessageClassName =
  'flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-gray-600 dark:text-gray-400';

export function Chart<K extends string>(props: ChartProps<K>) {
  const {
    data,
    series,
    kind,
    formatXLong,
    formatValue,
    summary,
    xHeader,
    tableCaption,
    status = 'ready',
    updating = false,
    emptyLabel = DEFAULT_EMPTY_LABEL,
    emptyAction,
    onRetry,
    defaultView = 'chart',
    Plot,
  } = props;

  assertSeriesContract(series);

  const bodyId = React.useId();
  const [view, setView] = React.useState<'chart' | 'table'>(defaultView);
  const [plotFailed, setPlotFailed] = React.useState(false);
  const height = resolveChartHeight(props.height);

  const effectiveStatus: ChartStatus =
    status === 'ready' && isChartDataEmpty(data, series) ? 'empty' : status;

  if (effectiveStatus !== 'ready') {
    return (
      <figure className="m-0" aria-busy={effectiveStatus === 'loading' || undefined}>
        <div style={{ height }}>
          {effectiveStatus === 'loading' ? <ChartSkeleton kind={kind} /> : null}
          {effectiveStatus === 'empty' ? (
            <div className={stateMessageClassName}>
              <p>{emptyLabel}</p>
              {emptyAction}
            </div>
          ) : null}
          {effectiveStatus === 'error' ? (
            <div role="alert" className={stateMessageClassName}>
              <p>No se pudo cargar la gráfica</p>
              {onRetry ? (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  Reintentar
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </figure>
    );
  }

  const showTable = plotFailed || view === 'table';
  const lastPoint = data[data.length - 1];
  const plotProps = {
    kind,
    data,
    series,
    formatX: props.formatX,
    formatXLong,
    formatValue,
    formatAxisValue: props.formatAxisValue,
    valueKind: props.valueKind,
    height,
  } as ChartPlotProps<K>;

  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 text-xs text-gray-600 dark:text-gray-400">
          {series.map((item) => (
            <li key={item.key} className="flex items-center gap-1.5">
              <ChartSwatch kind={kind} token={item.token} mark={item.mark} />
              <span>{item.label}</span>
              <span className="font-mono font-semibold tabular-nums text-iwana-primary dark:text-gray-100">
                {formatMaybe(lastPoint?.[item.key], formatValue)}
              </span>
            </li>
          ))}
        </ul>
        {plotFailed ? null : (
          <button
            type="button"
            aria-controls={bodyId}
            onClick={() => setView((current) => (current === 'chart' ? 'table' : 'chart'))}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-iwana-primary hover:bg-iwana-surface-soft dark:text-iwana-primary-300 dark:hover:bg-dark-surface-3',
              interactiveFocusClassName,
            )}
          >
            {view === 'chart' ? 'Ver como tabla' : 'Ver como gráfica'}
          </button>
        )}
      </div>

      {showTable ? (
        <div
          id={bodyId}
          // Solo desplazamiento propio: el contenedor no es redondeado, no necesita ajuste de riel.
          className="overflow-x-auto"
          style={{ minHeight: height }}
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{tableCaption}</caption>
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600 dark:border-dark-border dark:text-gray-400">
                <th scope="col" className="px-2 py-2 text-left font-semibold">
                  {xHeader}
                </th>
                {series.map((item) => (
                  <th key={item.key} scope="col" className="px-2 py-2 text-right font-semibold">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr
                  key={point.x}
                  className="border-b border-gray-100 last:border-b-0 dark:border-dark-border"
                >
                  <th scope="row" className="px-2 py-1.5 text-left font-normal">
                    {formatXLong(point.x)}
                  </th>
                  {series.map((item) => (
                    <td key={item.key} className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {formatMaybe(point[item.key], formatValue)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div id={bodyId} role="img" aria-label={summary} style={{ height }}>
          <ChartPlotBoundary onFailure={() => setPlotFailed(true)}>
            <Plot {...plotProps} />
          </ChartPlotBoundary>
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {updating ? 'Actualizando' : ''}
      </span>
    </figure>
  );
}
