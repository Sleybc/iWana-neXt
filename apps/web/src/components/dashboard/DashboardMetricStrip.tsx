import Link from 'next/link';
import { cn, ErrorState, MetricCard, SkeletonBlock, type Tone } from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

/** Métrica de la franja de la consola: una `MetricCard` compacta (contrato DS 2026-11-21 §3). */
export interface DashboardMetricModel {
  id: string;
  label: string;
  count: number;
  tone: Tone;
  href?: string;
  ariaLabel?: string;
  onActivate?: () => void;
}

interface DashboardMetricStripProps {
  metrics: DashboardMetricModel[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  eyebrow?: string;
  ariaLabel?: string;
  skeletonCount?: number;
}

/** Franja de métricas de la consola (rejilla, eyebrow, carga y error); compuesta con `MetricCard`. */
export function DashboardMetricStrip({
  metrics,
  isLoading,
  error,
  onRetry,
  eyebrow,
  ariaLabel,
  skeletonCount = 4,
}: DashboardMetricStripProps) {
  const visibleEyebrow = eyebrow ?? PLATFORM_UI_COPY.dashboard.summaryEyebrow;
  const sectionLabel = ariaLabel ?? visibleEyebrow;
  const useThreeColumns = metrics.length === 3 || (isLoading && skeletonCount === 3);
  const gridClassName = cn(
    'mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2',
    useThreeColumns ? 'xl:grid-cols-3' : 'xl:grid-cols-4',
  );

  return (
    <section aria-label={sectionLabel} aria-busy={isLoading}>
      <p className="portal-eyebrow">{visibleEyebrow}</p>
      {isLoading ? (
        <div className={gridClassName}>
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <SkeletonBlock key={`metric-skeleton-${index}`} className="min-h-22 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          className="mt-4"
          message={error}
          onRetry={onRetry}
          retryLabel={PLATFORM_UI_COPY.dashboard.retry}
        />
      ) : (
        <div className={gridClassName}>
          {metrics.map((metric) => (
            <DashboardMetric key={metric.id} metric={metric} />
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardMetric({ metric }: { metric: DashboardMetricModel }) {
  // Una cifra 0 no es interactiva (contrato §3, estado «disabled»).
  const interactive = metric.count > 0;
  const common = {
    tone: metric.tone,
    label: metric.label,
    value: metric.count,
    size: 'compact' as const,
    interactive,
  };

  if (interactive && metric.onActivate) {
    return <MetricCard {...common} aria-label={metric.ariaLabel} onActivate={metric.onActivate} />;
  }

  if (interactive && metric.href) {
    return (
      <MetricCard {...common} asChild aria-label={metric.ariaLabel}>
        <Link href={metric.href} />
      </MetricCard>
    );
  }

  return <MetricCard {...common} />;
}
