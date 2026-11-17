/**
 * `@iwana/ui/chart` — entrada aislada con Recharts (ADR-112 D2/D4). Las apps la cargan solo
 * con `import()` dinámico (`next/dynamic`, sin SSR); un import estático desde `apps/**` está
 * prohibido por ESLint salvo `import type`. Marco, tipos y skeleton: barril `@iwana/ui`.
 */
export { ChartPlot } from './ChartPlot';
