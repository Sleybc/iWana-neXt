'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { Chart, ChartSkeleton, type ChartPlotProps, type ChartProps } from '@iwana/ui';

/**
 * Gráfica de la consola (ADR-112 D4). Única llamada a `next/dynamic` de la app para gráficas:
 * el marco de `Chart` (leyenda, tabla alternativa, estados) va en el JS inicial; Recharts llega
 * en un chunk aparte, sin SSR. Las pantallas usan `WebChart` y nunca importan `@iwana/ui/chart`
 * ni `recharts`.
 */
const LazyChartPlot = dynamic(() => import('@iwana/ui/chart').then((module) => module.ChartPlot), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

type DistributiveOmit<T, Key extends PropertyKey> = T extends unknown ? Omit<T, Key> : never;

export type WebChartProps<K extends string> = DistributiveOmit<ChartProps<K>, 'Plot'>;

export function WebChart<K extends string>(props: WebChartProps<K>) {
  const Plot = LazyChartPlot as unknown as ComponentType<ChartPlotProps<K>>;
  return <Chart {...(props as ChartProps<K>)} Plot={Plot} />;
}
