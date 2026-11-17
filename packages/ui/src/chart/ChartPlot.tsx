'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DotItemDotProps, TooltipContentProps } from 'recharts';
import { cn } from '../lib/utils';
import {
  ChartSwatch,
  chartAxisTickClassName,
  chartCanvasClassName,
  chartOutlineFill,
  chartTokenColor,
  chartTooltipClassName,
  chartTooltipRowClassName,
  chartTooltipTitleClassName,
  chartValueClassName,
  resolveChartHeight,
  type BarSeries,
  type ChartPlotProps,
  type LineSeries,
} from '../components/Chart';
import { overlayEdgeClassName } from '../components/ModalLayer';

/**
 * Único módulo del paquete que importa Recharts (ADR-112 D1/D2; regla ESLint en
 * `eslint.config.js`). Se expone por la entrada `@iwana/ui/chart` y la app lo carga con
 * `next/dynamic` sin SSR; nunca se reexporta desde el barril `@iwana/ui`.
 * Contrato: `docs/specs/2026-11-17-portal-graficas-ds-contrato.md` §2.3–2.4.
 */

const TICK = { className: chartAxisTickClassName };
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

function ChartTooltipContent<K extends string>({
  active,
  label,
  plot,
}: {
  active: boolean | undefined;
  label: string | number | undefined;
  plot: ChartPlotProps<K>;
}) {
  if (!active || label === undefined) return null;
  const point = plot.data.find((item) => item.x === String(label));
  if (!point) return null;
  return (
    <div className={cn(chartTooltipClassName, overlayEdgeClassName)}>
      <p className={chartTooltipTitleClassName}>{plot.formatXLong(point.x)}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {plot.series.map((item) => {
          const value = point[item.key];
          return (
            <li key={item.key} className={chartTooltipRowClassName}>
              <ChartSwatch kind={plot.kind} token={item.token} mark={item.mark} />
              <span>{item.label}</span>
              <span className={chartValueClassName}>
                {value === null ? 'Sin dato' : plot.formatValue(value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ChartPlot<K extends string>(props: ChartPlotProps<K>) {
  const { kind, data, series, formatX, formatValue, formatAxisValue, valueKind } = props;
  const height = resolveChartHeight(props.height);
  const rows = data as unknown as Record<string, unknown>[];
  const lastIndex = data.length - 1;

  const grid = <CartesianGrid vertical={false} stroke="currentColor" />;
  const xAxis = (
    <XAxis
      dataKey="x"
      tickFormatter={(value: string) => formatX(value)}
      tick={TICK}
      tickLine={false}
      axisLine={false}
      interval="preserveStartEnd"
    />
  );
  const yAxis = (
    <YAxis
      domain={[0, 'auto']}
      allowDecimals={valueKind !== 'count'}
      tickFormatter={(value: number) => (formatAxisValue ?? formatValue)(value)}
      tick={TICK}
      tickLine={false}
      axisLine={false}
      width="auto"
    />
  );
  const tooltip = (cursor: object) => (
    <Tooltip
      cursor={cursor}
      isAnimationActive={false}
      content={(content: TooltipContentProps) => (
        <ChartTooltipContent active={content.active} label={content.label} plot={props} />
      )}
    />
  );

  return (
    <div className={cn('h-full w-full', chartCanvasClassName)}>
      <ResponsiveContainer width="100%" height={height}>
        {kind === 'grouped-bar' ? (
          <BarChart data={rows} margin={MARGIN} barGap={3} accessibilityLayer={false}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip({ fill: 'currentColor', fillOpacity: 0.5 })}
            {(series as readonly BarSeries<K>[]).map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                maxBarSize={16}
                radius={[3, 3, 0, 0]}
                fill={
                  item.mark === 'outline'
                    ? chartOutlineFill(item.token)
                    : chartTokenColor(item.token)
                }
                stroke={item.mark === 'outline' ? chartTokenColor(item.token) : undefined}
                strokeWidth={item.mark === 'outline' ? 2 : 0}
                activeBar={false}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart data={rows} margin={MARGIN} accessibilityLayer={false}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip({ stroke: 'currentColor' })}
            {(series as readonly LineSeries<K>[]).map((item) => {
              const color = chartTokenColor(item.token);
              return (
                <Line
                  key={item.key}
                  type="linear"
                  dataKey={item.key}
                  name={item.label}
                  stroke={color}
                  strokeWidth={2}
                  {...(item.mark === 'dashed' ? { strokeDasharray: '5 4' } : {})}
                  connectNulls={false}
                  dot={(dot: DotItemDotProps) =>
                    dot.index === lastIndex && dot.cx != null && dot.cy != null ? (
                      <circle key={dot.key} cx={dot.cx} cy={dot.cy} r={4} fill={color} />
                    ) : (
                      <g key={dot.key} />
                    )
                  }
                  activeDot={{ r: 4, fill: color, stroke: 'none' }}
                />
              );
            })}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
