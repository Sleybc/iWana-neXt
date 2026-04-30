'use client';

// Fila de auditoría en modo Técnico — tabla densa con todos los campos técnicos
import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { actionLabel, AUTH_ACTIONS } from './helpers/actionLabel';
import { entityLabel } from './helpers/entityLabel';
import { abbreviateUserAgent } from './helpers/computeDiff';
import {
  describeAuditActor,
  describeAuditSubject,
  describeIp,
  describeTrace,
  shortId,
  type DisplayText,
} from './helpers/auditDisplay';
import { AuditExpandedDetails } from './AuditExpandedDetails';

export interface AuditTechnicalEntry {
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

interface AuditRowTechnicalProps {
  entry: AuditTechnicalEntry;
  expanded: boolean;
  onToggle: () => void;
}

/** Badge de acción con colores semánticos */
function actionBadgeClass(action: string): string {
  if (action === 'CREATE')
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (action === 'UPDATE')
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  if (action === 'DELETE') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (AUTH_ACTIONS.has(action))
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function CopyableMeta({ value, label = 'Copiar ID' }: { value: string | null; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        void handleCopy(e);
      }}
      className="inline-flex items-center gap-1 rounded-md text-[11px] font-mono text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      aria-label={label}
      title={value}
    >
      {shortId(value, 10)}
      {copied ? (
        <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
}

function PrimarySecondaryCell({ text }: { text: DisplayText }) {
  return (
    <div className="min-w-0">
      <p
        className="truncate text-sm font-medium text-gray-800 dark:text-gray-100"
        title={text.title}
      >
        {text.title}
      </p>
      {text.subtitle && (
        <p className="truncate text-[11px] text-gray-400 dark:text-gray-500" title={text.subtitle}>
          {text.subtitle}
        </p>
      )}
    </div>
  );
}

export function AuditRowTechnical({ entry, expanded, onToggle }: AuditRowTechnicalProps) {
  const subject = describeAuditSubject(entry);
  const actor = describeAuditActor(entry);
  const origin = describeIp(entry.ipAddress);
  const trace = describeTrace(entry);

  return (
    <>
      <tr
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        className="border-t border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
      >
        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
          <time dateTime={entry.createdAt} title={new Date(entry.createdAt).toISOString()}>
            <span className="block font-medium text-gray-700 dark:text-gray-300">
              {new Date(entry.createdAt).toLocaleDateString('es-CO')}
            </span>
            <span className="block text-gray-400 dark:text-gray-500">
              {new Date(entry.createdAt).toLocaleTimeString('es-CO')}
            </span>
          </time>
        </td>

        <td className="px-3 py-3 min-w-[150px]">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionBadgeClass(entry.action)}`}
          >
            {actionLabel(entry.action)}
          </span>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            {entityLabel(entry.entityType)}
          </p>
        </td>

        <td className="px-3 py-3 min-w-[220px] max-w-[280px]">
          <PrimarySecondaryCell text={subject} />
          <CopyableMeta value={entry.entityId} label="Copiar ID del registro afectado" />
        </td>

        <td className="px-3 py-3 min-w-[150px]">
          <PrimarySecondaryCell text={actor} />
          <CopyableMeta value={entry.userId} label="Copiar ID del actor" />
        </td>

        <td className="px-3 py-3 min-w-[120px]">
          <PrimarySecondaryCell text={origin} />
        </td>

        <td
          className="px-3 py-3 min-w-[150px] max-w-[190px] text-xs text-gray-500 dark:text-gray-400 truncate"
          title={entry.userAgent ?? undefined}
        >
          {abbreviateUserAgent(entry.userAgent)}
        </td>

        <td className="px-3 py-3 min-w-[160px]">
          <PrimarySecondaryCell text={trace} />
          {entry.requestId ? (
            <CopyableMeta value={entry.requestId} label="Copiar ID de solicitud" />
          ) : (
            <CopyableMeta value={entry.id} label="Copiar ID del log" />
          )}
        </td>

        <td className="px-3 py-3 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={expanded ? 'Colapsar' : 'Expandir'}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </td>
      </tr>

      {/* Panel expandido idéntico al modo básico */}
      {expanded && (
        <tr key={`${entry.id}-expanded`}>
          <td
            colSpan={8}
            className="bg-gray-50 dark:bg-white/[0.03] border-t border-gray-100 dark:border-dark-border"
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
            />
          </td>
        </tr>
      )}
    </>
  );
}
