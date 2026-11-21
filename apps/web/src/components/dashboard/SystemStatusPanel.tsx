// apps/web/src/components/dashboard/SystemStatusPanel.tsx
import type { ReactNode } from 'react';
import {
  Card,
  cn,
  EmptyState,
  ErrorState,
  SkeletonBlock,
  toneFillVariants,
  toneMutedTextVariants,
  toneSurfaceVariants,
  toneTextVariants,
  type Tone,
} from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.dashboard;

export type StatusLevel = 'ok' | 'warning' | 'error' | 'unknown';

export interface StatusIndicator {
  /** Servicio (afectado por `error`) o negocio (siempre visible). Contrato DS v1.2 §4.1. */
  kind?: 'service' | 'business';
  label: string;
  status: StatusLevel;
  detail?: string;
}

/** Contrato DS 2026-11-21 §4: todo texto llega del catálogo de la app. */
interface SystemStatusPanelProps {
  indicators: StatusIndicator[];
  title: string;
  eyebrow: string;
  summary?: string;
  lastCheckedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage: string;
  statusLabels: Record<StatusLevel, string>;
  className?: string;
  /** `compact`: indicadores en filas de una columna (contrato DS v1.3 §7bis.4); E1–E6 intactas. */
  density?: 'default' | 'compact';
  /** Ancla para enlazar el panel (p. ej. desde la cola de atención). */
  id?: string;
  /** Contenido extra bajo los indicadores en `compact` (p. ej. tracker de 30 días). */
  children?: ReactNode;
}

const LEVEL_TONE: Record<StatusLevel, Tone> = {
  ok: 'success',
  warning: 'warning',
  error: 'error',
  unknown: 'neutral',
};

/** Rótulos de nivel del catálogo de la consola. */
export const SYSTEM_STATUS_LABELS: Record<StatusLevel, string> = {
  ok: COPY.healthLevelOk,
  warning: COPY.healthLevelWarning,
  error: COPY.healthLevelError,
  unknown: COPY.healthLevelUnknown,
};

function formatLastChecked(value?: string | null): string {
  if (!value) {
    return COPY.healthLastCheckedPending;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return COPY.healthLastCheckedPending;
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function SystemStatusPanel({
  indicators,
  title,
  eyebrow,
  summary,
  lastCheckedAt,
  isLoading = false,
  error,
  onRetry,
  emptyMessage,
  statusLabels,
  className,
  density = 'default',
  id,
  children,
}: SystemStatusPanelProps) {
  const compact = density === 'compact';
  const Indicator = compact ? IndicatorRow : IndicatorTile;
  const groupClassName = compact
    ? 'mt-3 flex flex-col gap-2'
    : 'mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2';
  // Precedencia v1.2 (§4.1 E5): carga > por grupo (servicio: error ? ErrorState : indicadores;
  // negocio: indicadores) > vacío, solo si no hay indicadores ni error.
  const service = indicators.filter((ind) => (ind.kind ?? 'service') === 'service');
  const business = indicators.filter((ind) => ind.kind === 'business');
  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className={groupClassName} aria-busy="true">
        {Array.from({ length: 4 }).map((_, idx) => (
          <SkeletonBlock
            key={`status-skeleton-${idx}`}
            className={compact ? 'h-5 w-full rounded' : 'h-20 w-full'}
          />
        ))}
      </div>
    );
  } else if (!error && indicators.length === 0) {
    body = <EmptyState className={compact ? 'mt-3' : 'mt-4'} message={emptyMessage} />;
  } else {
    body = (
      <div className={groupClassName}>
        {error ? (
          <ErrorState
            className="col-span-full"
            message={error}
            onRetry={onRetry}
            retryLabel={COPY.retry}
          />
        ) : (
          service.map((ind) => (
            <Indicator key={ind.label} indicator={ind} statusLabels={statusLabels} />
          ))
        )}
        {business.map((ind) => (
          <Indicator key={ind.label} indicator={ind} statusLabels={statusLabels} />
        ))}
      </div>
    );
  }

  if (compact) {
    return (
      <Card id={id} className={cn('p-4', className)}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
          {COPY.healthLastCheckedInline(formatLastChecked(lastCheckedAt))}
        </p>
        {body}
        {children}
      </Card>
    );
  }

  return (
    <Card id={id} className={cn('p-5', className)}>
      <div className="border-b border-gray-100 pb-4 dark:border-dark-border">
        <p className="portal-eyebrow">{eyebrow}</p>
        <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
            {summary && !error && (
              <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{summary}</p>
            )}
          </div>
          <div className="rounded-2xl bg-iwana-surface-soft px-3 py-2 text-xs text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300">
            {COPY.healthLastChecked}
            <p className="mt-1 font-semibold text-iwana-primary dark:text-white">
              {formatLastChecked(lastCheckedAt)}
            </p>
          </div>
        </div>
      </div>
      {body}
    </Card>
  );
}

function IndicatorTile({
  indicator,
  statusLabels,
}: {
  indicator: StatusIndicator;
  statusLabels: Record<StatusLevel, string>;
}) {
  const tone = LEVEL_TONE[indicator.status];
  return (
    <div data-tone={tone} className={cn('rounded-2xl border p-3', toneSurfaceVariants({ tone }))}>
      <div className="flex items-center gap-2">
        <span
          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', toneFillVariants({ tone }))}
          aria-hidden="true"
        />
        <span className={cn('text-xs font-medium', toneTextVariants({ tone }))}>
          {statusLabels[indicator.status]}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{indicator.label}</p>
      {indicator.detail && (
        <p className={cn('mt-1 text-xs leading-5', toneMutedTextVariants({ tone }))}>
          {indicator.detail}
        </p>
      )}
    </div>
  );
}

function IndicatorRow({
  indicator,
  statusLabels,
}: {
  indicator: StatusIndicator;
  statusLabels: Record<StatusLevel, string>;
}) {
  const tone = LEVEL_TONE[indicator.status];
  return (
    <div data-tone={tone} className="flex items-center gap-2 text-sm">
      <span
        className={cn('h-2.5 w-2.5 shrink-0 rounded-full', toneFillVariants({ tone }))}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 text-gray-700 dark:text-gray-200">{indicator.label}</span>
      <span className={cn('text-xs font-medium', toneTextVariants({ tone }))}>
        {statusLabels[indicator.status]}
      </span>
    </div>
  );
}
