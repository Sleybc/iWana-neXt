'use client';

// Fila de historial en modo Lectura — frase con verbo; un control de expansión (CA-AUD-07).
import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn, interactiveFocusClassName } from '@iwana/ui';
import { actionLabel, AUTH_ACTIONS } from './helpers/actionLabel';
import { entityLabel } from './helpers/entityLabel';
import { describePlatformActivityLine } from '@/lib/platform-audit-vocabulary';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { pickKeyChange } from './helpers/pickKeyChange';
import { deriveSeverity, severityClasses, severityLabel } from './helpers/deriveSeverity';
import { computeDiff, renderValue, formatFieldName } from './helpers/computeDiff';
import { timeAgo } from './helpers/timeAgo';
import { AuditExpandedDetails } from './AuditExpandedDetails';

export interface AuditBasicEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  actor?: {
    id: string | null;
    type: 'tenant' | 'platform' | 'system' | 'unknown';
    displayName: string;
    role?: string;
    status?: string;
    isDeleted?: boolean;
  } | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditRowBasicProps {
  entry: AuditBasicEntry;
  expanded: boolean;
  onToggle: () => void;
  companyName?: string | undefined;
  showTechnicalMeta?: boolean;
}

function actionBadgeClass(action: string): string {
  if (action === 'CREATE')
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (action === 'UPDATE')
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  if (action === 'DELETE') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (AUTH_ACTIONS.has(action))
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  return 'bg-gray-100 text-gray-700 dark:bg-dark-surface-3 dark:text-gray-300';
}

export function AuditRowBasic({
  entry,
  expanded,
  onToggle,
  companyName,
  showTechnicalMeta = false,
}: AuditRowBasicProps) {
  const diff = computeDiff(entry.oldValue, entry.newValue);
  const severity = deriveSeverity(entry.action, entry.entityType, diff);
  const sc = severityClasses(severity);
  const keyChange = pickKeyChange(entry.oldValue, entry.newValue, entry.action);
  const narrative = describePlatformActivityLine(entry);
  const actorDisplayName =
    entry.actor?.displayName?.trim() ||
    (entry.userId ? PLATFORM_UI_COPY.audit.actorFallback : 'Sistema');
  const fieldLabel = keyChange ? formatFieldName(keyChange.field, { mode: 'reading' }) : '';

  return (
    <>
      <tr className="border-t border-gray-100 transition-colors hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-surface-3">
        <td className="px-4 py-3" colSpan={1}>
          <div className="flex items-start gap-3">
            <span
              className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${sc.dot}`}
              title={severityLabel(severity)}
              aria-hidden="true"
            />

            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm leading-snug font-semibold text-gray-900 dark:text-gray-100">
                {narrative}
              </p>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${actionBadgeClass(entry.action)}`}
                >
                  {actionLabel(entry.action)}
                </span>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-dark-surface-3 dark:text-gray-400">
                  {entityLabel(entry.entityType)}
                </span>

                <span className="text-gray-300 dark:text-gray-400">·</span>
                <span className="text-gray-500 dark:text-gray-400">{actorDisplayName}</span>

                <span className="text-gray-300 dark:text-gray-400">·</span>
                <time
                  dateTime={entry.createdAt}
                  title={new Date(entry.createdAt).toLocaleString('es-CO')}
                  className="font-mono tabular-nums text-gray-500 dark:text-gray-400"
                >
                  {timeAgo(entry.createdAt)}
                </time>

                {companyName ? (
                  <>
                    <span className="text-gray-300 dark:text-gray-400">·</span>
                    <span className="text-gray-400 dark:text-gray-400">{companyName}</span>
                  </>
                ) : null}

                {severity !== 'info' ? (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${sc.badge}`}>
                    {severityLabel(severity)}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={onToggle}
                  aria-expanded={expanded}
                  className={cn(
                    'ml-auto flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-gray-500 transition-colors hover:text-gray-700 dark:hover:text-gray-300',
                    interactiveFocusClassName,
                  )}
                >
                  <span className="text-xs">
                    {expanded
                      ? PLATFORM_UI_COPY.audit.collapseDetail
                      : PLATFORM_UI_COPY.audit.expandDetail}
                  </span>
                  {expanded ? (
                    <ChevronUp className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  )}
                </button>
              </div>

              {keyChange && fieldLabel ? (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {keyChange.newVal === null ? (
                    <>
                      <span className="font-medium">{fieldLabel}:</span>{' '}
                      <span className="text-red-500 dark:text-red-400">
                        {renderValue(keyChange.oldVal)}
                      </span>{' '}
                      eliminado
                    </>
                  ) : keyChange.oldVal === null ? (
                    <>
                      <span className="font-medium">{fieldLabel}:</span>{' '}
                      <span className="text-green-600 dark:text-green-400">
                        {renderValue(keyChange.newVal)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{fieldLabel}:</span>{' '}
                      <span className="text-gray-400 line-through">
                        {renderValue(keyChange.oldVal)}
                      </span>
                      {' → '}
                      <span className="text-gray-900 dark:text-gray-100">
                        {renderValue(keyChange.newVal)}
                      </span>
                      {keyChange.extraCount > 0 ? (
                        <span className="ml-1 text-gray-400">+{keyChange.extraCount} más</span>
                      ) : null}
                    </>
                  )}
                </p>
              ) : null}
            </div>
          </div>
        </td>
      </tr>

      {expanded ? (
        <tr key={`${entry.id}-expanded`}>
          <td
            colSpan={1}
            className="border-t border-gray-100 bg-gray-50 dark:border-dark-border dark:bg-dark-surface-3"
          >
            <AuditExpandedDetails
              id={entry.id}
              action={entry.action}
              entityId={entry.entityId}
              userId={entry.userId}
              ipAddress={entry.ipAddress}
              userAgent={entry.userAgent}
              requestId={entry.requestId}
              createdAt={entry.createdAt}
              oldValue={entry.oldValue}
              newValue={entry.newValue}
              showTechnicalMeta={showTechnicalMeta}
              fieldMode="reading"
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
