// apps/portal/src/components/dashboard/DashboardAttentionQueue.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
import { Badge, cn } from '@iwana/ui';
import {
  PortalAlert,
  PortalPanel,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import type { DashboardAttentionQueue as AttentionQueue } from './dashboard-attention-queue';

/** Filas visibles antes de «Ver los restantes» (dirección §5). */
export const ATTENTION_VISIBLE_ROWS = 6;

const severityToneClassName = {
  'at-risk': 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  attention: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
} as const;

const severityLabel = { 'at-risk': 'En riesgo', attention: 'Atención' } as const;

/**
 * B2 · «Requiere tu atención»: cola única de todas las áreas, lo más urgente primero.
 * El lima solo aparece en el estado «Todo al día».
 */
export function DashboardAttentionQueue({
  queue,
  onRetry,
}: {
  queue: AttentionQueue;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = 'Requiere tu atención';

  if (queue.state === 'loading') {
    return (
      <PortalPanel compact title={title} busy>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <PortalSkeletonBlock key={index} className="h-12 rounded-xl" />
          ))}
        </div>
      </PortalPanel>
    );
  }

  const hidden = Math.max(0, queue.rows.length - ATTENTION_VISIBLE_ROWS);
  const rows = expanded ? queue.rows : queue.rows.slice(0, ATTENTION_VISIBLE_ROWS);
  const hasFailures = queue.failedSources.length > 0;

  return (
    <PortalPanel
      compact
      title={title}
      description="Lo más urgente primero, de todas las áreas"
      actions={
        queue.rows.length > 0 ? (
          <Badge variant="neutral" className="font-mono tabular-nums">
            {queue.rows.length}
          </Badge>
        ) : undefined
      }
    >
      {hasFailures ? (
        <PortalAlert
          variant="warning"
          title="No pudimos revisar todas las áreas."
          live="polite"
          action={
            <button type="button" onClick={onRetry} className={portalInlineTextLinkClassName}>
              Reintentar
            </button>
          }
        />
      ) : null}

      {queue.rows.length === 0 ? (
        hasFailures ? null : (
          <div className="flex items-center gap-3 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-iwana-secondary-100 text-iwana-secondary-900 dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden={true} />
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Todo al día</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                No hay pendientes que requieran tu decisión ahora.
              </p>
            </div>
          </div>
        )
      ) : (
        <ul
          className={cn('divide-y divide-gray-100 dark:divide-dark-border', hasFailures && 'mt-3')}
        >
          {rows.map((row) => {
            const Icon = row.severity === 'at-risk' ? AlertTriangle : Clock;
            return (
              <li key={row.id}>
                <Link
                  href={row.href}
                  aria-label={`${severityLabel[row.severity]}: ${row.title}. ${row.area}`}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-xl px-1.5 py-2 hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3',
                    interactiveFocusClassName,
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      severityToneClassName[row.severity],
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
                </Link>
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
          className={cn(portalInlineTextLinkClassName, interactiveFocusClassName, 'mt-2')}
        >
          {expanded
            ? 'Ver menos'
            : hidden === 1
              ? 'Ver el restante'
              : `Ver los ${hidden} restantes`}
        </button>
      ) : null}
    </PortalPanel>
  );
}
