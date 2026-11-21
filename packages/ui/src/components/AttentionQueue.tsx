'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { interactiveFocusClassName } from '../focus';
import { SkeletonBlock } from '../skeleton';
import { Alert } from './Alert';
import { Badge, badgeVariants } from './Badge';
import { Card } from './Card';
import { toneSurfaceVariants, toneTextVariants, type Tone } from './Tone';

/** `at-risk` → Tone `error`; `attention` → Tone `warning` (contrato DS v1.3 §7bis.3). */
export type AttentionSeverity = 'at-risk' | 'attention';

export interface AttentionRow {
  id: string;
  severity: AttentionSeverity;
  title: string;
  area: string;
  href: string;
}

export interface AttentionQueueProps {
  state: 'loading' | 'ready';
  /** Ya ordenadas por el consumidor: `at-risk` primero. */
  rows: readonly AttentionRow[];
  /** Alguna fuente falló: nunca se afirma «todo al día». */
  partial?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  /** Por defecto 6. */
  maxVisible?: number | undefined;
  title: string;
  description?: string | undefined;
  labels: {
    severity: Record<AttentionSeverity, string>;
    partial: string;
    retry: string;
    allClear: string;
    allClearHint: string;
    showMore: (hidden: number) => string;
    showLess: string;
  };
  linkComponent?: React.ElementType | undefined;
  className?: string | undefined;
}

const severityTone: Record<AttentionSeverity, Tone> = { 'at-risk': 'error', attention: 'warning' };

const textActionClassName = cn(
  'inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary underline-offset-4 hover:underline dark:text-iwana-primary-300',
  interactiveFocusClassName,
);

/** Cola «requiere tu atención»: lo más urgente primero, tope visible y estado parcial. */
export function AttentionQueue({
  state,
  rows,
  partial = false,
  onRetry,
  maxVisible = 6,
  title,
  description,
  labels,
  linkComponent: LinkComponent = 'a',
  className,
}: AttentionQueueProps) {
  const [expanded, setExpanded] = React.useState(false);

  const header = (withCount: boolean) => (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4 dark:border-dark-border">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      {withCount && rows.length > 0 ? (
        <Badge variant="neutral" className="font-mono tabular-nums">
          {rows.length}
        </Badge>
      ) : null}
    </div>
  );

  if (state === 'loading') {
    return (
      <Card className={cn('p-5', className)} aria-busy={true}>
        {header(false)}
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-12 rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  const hidden = Math.max(0, rows.length - maxVisible);
  const visibleRows = expanded ? rows : rows.slice(0, maxVisible);

  return (
    <Card className={cn('p-5', className)}>
      {header(true)}
      <div className="mt-4">
        {partial ? (
          <Alert variant="warning" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <p className="font-medium">{labels.partial}</p>
              {onRetry ? (
                <button type="button" onClick={onRetry} className={textActionClassName}>
                  {labels.retry}
                </button>
              ) : null}
            </div>
          </Alert>
        ) : null}

        {rows.length === 0 ? (
          partial ? null : (
            <div className="flex items-center gap-3 py-2">
              <span
                className={cn(
                  badgeVariants({ variant: 'lime' }),
                  'flex h-9 w-9 shrink-0 justify-center rounded-xl p-0',
                )}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden={true} />
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {labels.allClear}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{labels.allClearHint}</p>
              </div>
            </div>
          )
        ) : (
          <ul className={cn('divide-y divide-gray-100 dark:divide-dark-border', partial && 'mt-3')}>
            {visibleRows.map((row) => {
              const Icon = row.severity === 'at-risk' ? AlertTriangle : Clock;
              const tone = severityTone[row.severity];
              return (
                <li key={row.id}>
                  <LinkComponent
                    href={row.href}
                    aria-label={`${labels.severity[row.severity]}: ${row.title}. ${row.area}`}
                    className={cn(
                      'flex min-h-12 items-center gap-3 rounded-xl px-1.5 py-1.5 hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3',
                      interactiveFocusClassName,
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                        toneSurfaceVariants({ tone }),
                        toneTextVariants({ tone }),
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden={true} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">
                        {row.title}
                      </span>
                      <span className="block text-xs text-gray-600 dark:text-gray-400">
                        {row.area}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden={true} />
                  </LinkComponent>
                </li>
              );
            })}
          </ul>
        )}

        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className={cn(textActionClassName, 'mt-1')}
          >
            {expanded ? labels.showLess : labels.showMore(hidden)}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
