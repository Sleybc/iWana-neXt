'use client';

// Fila de auditoría en modo Básico — narrativa clara en voz pasiva con sujeto afectado
import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { actionVerb, actionLabel, AUTH_ACTIONS } from './helpers/actionLabel';
import { entityLabel, entityArticle } from './helpers/entityLabel';
import { formatActorFull, isSystemActor } from './helpers/formatActor';
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
  /** Nombre de la empresa para mostrar en el pie de fila (opcional) */
  companyName?: string | undefined;
}

/** Determina el color del badge de acción */
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

/**
 * Extrae el identificador legible del registro afectado desde los datos del evento.
 * Prioriza: email > nombre > slug — para mostrar en la narrativa en lugar de un UUID.
 */
function extractSubjectId(
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
): string | null {
  const data = newValue ?? oldValue;
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const candidate = d.email ?? d.name ?? d.firstName ?? d.slug ?? d.companyName ?? d.legalName;
  if (candidate && typeof candidate === 'string') return candidate;
  return null;
}

/**
 * Construye la frase narrativa del evento en voz pasiva.
 * Formato: "Se actualizó el usuario john@example.com"
 * El actor (quién lo hizo) se muestra en los metadatos, no en la narrativa principal,
 * para no contaminar el texto con fragmentos de UUID.
 */
function buildNarrative(entry: AuditBasicEntry): string {
  const verb = actionVerb(entry.action);
  const entity = entityLabel(entry.entityType);
  const article = entityArticle(entry.entityType);
  const subject = extractSubjectId(entry.oldValue, entry.newValue);
  const subjectStr = subject ? ` ${subject}` : '';

  // Sesión propia — el sujeto es el actor, no hace falta objeto
  if (['LOGIN', 'LOGOUT', 'REFRESH'].includes(entry.action)) {
    const cap = verb.charAt(0).toUpperCase() + verb.slice(1);
    return cap;
  }

  // Fallos de acceso / bloqueos
  if (entry.action === 'LOGIN_FAILED') return 'Fallo de acceso';
  if (entry.action === 'ACCOUNT_LOCKED') return `Cuenta bloqueada${subjectStr}`;

  // Acciones con verbo orientado al objeto (incluyen artículo implícito)
  if (
    [
      'PASSWORD_CHANGED',
      'PASSWORD_RESET_REQUESTED',
      'PASSWORD_RESET_COMPLETED',
      'MFA_ENABLED',
      'MFA_DISABLED',
      'MFA_SETUP_INITIATED',
      'EMAIL_VERIFIED',
    ].includes(entry.action)
  ) {
    const cap = verb.charAt(0).toUpperCase() + verb.slice(1);
    return subject ? `${cap} ${subject}` : cap;
  }

  // Acciones de tenant con nombre de empresa
  if (['TENANT_PROVISIONED', 'TENANT_SUSPENDED', 'TENANT_ACTIVATED'].includes(entry.action)) {
    const cap = verb.charAt(0).toUpperCase() + verb.slice(1);
    return subject ? `${cap} ${subject}` : cap;
  }

  // CRUD general: "Se actualizó el usuario john@example.com"
  return `Se ${verb} ${article} ${entity}${subjectStr}`;
}

export function AuditRowBasic({ entry, expanded, onToggle, companyName }: AuditRowBasicProps) {
  const diff = computeDiff(entry.oldValue, entry.newValue);
  const severity = deriveSeverity(entry.action, entry.entityType, diff);
  const sc = severityClasses(severity);
  const keyChange = pickKeyChange(entry.oldValue, entry.newValue, entry.action);
  const narrative = buildNarrative(entry);
  const actorFull = formatActorFull(entry.userId);
  const systemActor = isSystemActor(entry.userId);
  const actorDisplayName = entry.actor?.displayName ?? actorFull.slice(0, 8);
  const actorTooltip = entry.actor
    ? `Actor: ${entry.actor.displayName}${entry.actor.role ? ` · ${entry.actor.role}` : ''}${entry.userId ? ` · ID ${entry.userId}` : ''}`
    : `Actor: ${actorFull}`;

  return (
    <>
      {/* Fila principal */}
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
        <td className="px-4 py-3" colSpan={1}>
          <div className="flex items-start gap-3">
            {/* Punto de criticidad */}
            <span
              className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${sc.dot}`}
              title={severityLabel(severity)}
              aria-label={`Criticidad: ${severityLabel(severity)}`}
            />

            <div className="flex-1 min-w-0 space-y-1">
              {/* Frase narrativa — voz pasiva, sin UUID en el texto */}
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                {narrative}
              </p>

              {/* Fila única: badges + actor + tiempo + criticidad + toggle */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${actionBadgeClass(entry.action)}`}
                >
                  {actionLabel(entry.action)}
                </span>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-dark-surface-3 dark:text-gray-400">
                  {entityLabel(entry.entityType)}
                </span>

                <span className="text-gray-300 dark:text-gray-600">·</span>

                {/* Actor — pill de ID corto con tooltip del UUID, sin icono */}
                {systemActor ? (
                  <span className="text-gray-500 dark:text-gray-400">Sistema</span>
                ) : (
                  <span
                    className="text-gray-500 dark:text-gray-400 cursor-help"
                    title={actorTooltip}
                  >
                    {actorDisplayName}
                  </span>
                )}

                <span className="text-gray-300 dark:text-gray-600">·</span>

                <time
                  dateTime={entry.createdAt}
                  title={new Date(entry.createdAt).toLocaleString('es-CO')}
                  className="text-gray-400 dark:text-gray-500"
                >
                  {timeAgo(entry.createdAt)}
                </time>

                {companyName && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-gray-400 dark:text-gray-500">{companyName}</span>
                  </>
                )}

                {AUTH_ACTIONS.has(entry.action) && entry.ipAddress && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-gray-400 dark:text-gray-500">IP: {entry.ipAddress}</span>
                  </>
                )}

                <span className={`rounded-full px-1.5 py-0.5 font-medium text-[10px] ${sc.badge}`}>
                  {severityLabel(severity)}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                  className="ml-auto flex items-center gap-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  aria-label={expanded ? 'Colapsar detalles' : 'Ver detalles'}
                >
                  <span className="text-[10px]">{expanded ? 'Ocultar' : 'Detalles'}</span>
                  {expanded ? (
                    <ChevronUp className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  )}
                </button>
              </div>

              {/* Cambio clave */}
              {keyChange && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {keyChange.newVal === null ? (
                    <>
                      <span className="font-medium">{formatFieldName(keyChange.field)}:</span>{' '}
                      <span className="text-red-500 dark:text-red-400">
                        {renderValue(keyChange.oldVal)}
                      </span>{' '}
                      eliminado
                    </>
                  ) : keyChange.oldVal === null ? (
                    <>
                      <span className="font-medium">{formatFieldName(keyChange.field)}:</span>{' '}
                      <span className="text-green-600 dark:text-green-400">
                        {renderValue(keyChange.newVal)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{formatFieldName(keyChange.field)}:</span>{' '}
                      <span className="line-through text-gray-400">
                        {renderValue(keyChange.oldVal)}
                      </span>
                      {' → '}
                      <span className="text-gray-900 dark:text-gray-100">
                        {renderValue(keyChange.newVal)}
                      </span>
                      {keyChange.extraCount > 0 && (
                        <span className="ml-1 text-gray-400">+{keyChange.extraCount} más</span>
                      )}
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Panel expandido */}
      {expanded && (
        <tr key={`${entry.id}-expanded`}>
          <td
            colSpan={1}
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
