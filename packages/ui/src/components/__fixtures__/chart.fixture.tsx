/** Datos y props base compartidos por las pruebas del marco `Chart`. */
import type { BarSeries, ChartPlotProps, ChartProps } from '../Chart';

export type Key = 'altas' | 'retiros';

export const barSeries: readonly BarSeries<Key>[] = [
  { key: 'altas', label: 'Altas', token: 'chart-2', progress: true, mark: 'solid' },
  { key: 'retiros', label: 'Retiros', token: 'chart-4', mark: 'outline' },
];

export const data = [
  { x: '2026-10', altas: 40, retiros: 12 },
  { x: '2026-11', altas: 61, retiros: null },
];

export function FakePlot(props: ChartPlotProps<Key>) {
  return <svg data-testid="plot" data-kind={props.kind} data-height={props.height} />;
}

export function baseProps(overrides: Partial<ChartProps<Key>> = {}): ChartProps<Key> {
  return {
    kind: 'grouped-bar',
    series: barSeries,
    data,
    formatX: (x) => x.slice(5),
    formatXLong: (x) => (x === '2026-11' ? 'noviembre de 2026 (en curso)' : 'octubre de 2026'),
    formatValue: (v) => `${v} u`,
    valueKind: 'count',
    summary: 'Altas y retiros de suscriptores por mes. En noviembre: 61 altas.',
    xHeader: 'Mes',
    tableCaption: 'Altas y retiros por mes',
    Plot: FakePlot,
    ...overrides,
  } as ChartProps<Key>;
}
