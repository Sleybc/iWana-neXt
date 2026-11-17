'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { Chart, ChartSkeleton, type ChartPlotProps, type ChartProps } from '@iwana/ui';

/**
 * Gráfica del portal (ADR-112 D4; contrato DS `docs/specs/2026-11-17-portal-graficas-ds-contrato.md`
 * §2.1). Única llamada a `next/dynamic` de la app para gráficas: el marco (leyenda, tabla
 * alternativa, estados) va en el JS inicial y se renderiza en servidor; Recharts llega en un
 * chunk aparte, sin SSR, solo cuando una pantalla monta la gráfica. Las pantallas usan
 * `PortalChart` y nunca importan `@iwana/ui/chart` ni `recharts` (regla ESLint).
 */
const LazyChartPlot = dynamic(() => import('@iwana/ui/chart').then((module) => module.ChartPlot), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

type DistributiveOmit<T, Key extends PropertyKey> = T extends unknown ? Omit<T, Key> : never;

export type PortalChartProps<K extends string> = DistributiveOmit<ChartProps<K>, 'Plot'>;

export function PortalChart<K extends string>(props: PortalChartProps<K>) {
  const Plot = LazyChartPlot as unknown as ComponentType<ChartPlotProps<K>>;
  return <Chart {...(props as ChartProps<K>)} Plot={Plot} />;
}
