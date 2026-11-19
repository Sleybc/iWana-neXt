'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Badge, Button, ProgressMeter, SectionHeader, SkeletonBlock } from '@iwana/ui';
import { ListChecks } from 'lucide-react';
import { PortalAlert } from '@/components/shared/portal-ui';
import type { RequirementChecklistItem as EvaluatedItem } from './execution-order-requirement-status';
import {
  requirementActionLabel,
  type RequirementActionDescriptor,
} from './execution-order-actions';

export interface RequirementChecklistItem extends EvaluatedItem {
  action?: RequirementActionDescriptor | undefined;
  history?: ReactNode;
  actionBody?: ReactNode;
  /** Cuerpo propio (Aprovisionamiento): sustituye acción e historial y trae su título. */
  body?: ReactNode;
  /** Id del título del cuerpo propio, para llevar el foco al activarlo. */
  bodyHeadingId?: string;
  /** Textos propios de la línea cuando no sigue el patrón de la plantilla. */
  requiredLabel?: string;
  stateLabel?: string;
  ariaLabel?: string;
  /** Segunda línea propia (homónimos o aprovisionamiento). */
  detail?: string;
}
export interface RequirementChecklistProps {
  items: readonly RequirementChecklistItem[];
  /** Historial sin clave, presentado una sola vez fuera de las filas del snapshot. */
  unattributedConsumptionHistory?: ReactNode;
  /** Contador y paginación de historial con alcance global a la OT. */
  historyFooter?: ReactNode;
  /** Muestra la ayuda de solo lectura correspondiente al pre-inicio. */
  showPreStartHints?: boolean;
  progress?: number;
  /** Ayuda del momento, en la fila del título (no repite el texto en otro bloque). */
  description?: ReactNode;
  mode: 'readonly' | 'action';
  loading?: boolean;
  refreshing?: boolean;
  offline?: boolean;
  error?: { message: string; onRetry: () => void };
  selectedRequirementKey?: string | undefined;
  onSelectRequirement?: (requirementKey: string) => void;
  /**
   * Índice activo (spec 2026-11-18 bloque D, dictamen R0 §2): con este manejador
   * cada línea es un botón de navegación y solo se monta el cuerpo del requisito
   * activo, en una región después del índice (reducir es no montar). Sin él,
   * cada línea lleva su acción e historial.
   */
  onActivateRequirement?: (requirementKey: string) => void;
  activeRequirementKey?: string | null;
}

const PRE_START_HINTS: Partial<Record<string, string>> = {
  ACTIVITY: 'Inicia la ejecución para registrar el trabajo realizado',
  MATERIAL: 'Inicia la ejecución para registrar equipos y materiales',
  EVIDENCE: 'Inicia la ejecución para registrar evidencia',
};

function stateLabelOf(item: RequirementChecklistItem): string {
  if (item.stateLabel) return item.stateLabel;
  return item.state === 'satisfied'
    ? 'Cumplido'
    : item.state === 'unknown'
      ? 'Estado no disponible'
      : item.required
        ? 'Pendiente'
        : 'Sin registrar';
}

export function requirementBodyHeadingId(
  item: Pick<RequirementChecklistItem, 'key' | 'bodyHeadingId'>,
) {
  return item.bodyHeadingId ?? `requirement-body-heading-${item.key}`;
}

export function RequirementChecklist({
  items,
  unattributedConsumptionHistory,
  historyFooter,
  progress,
  description,
  mode,
  showPreStartHints = false,
  loading,
  refreshing,
  offline,
  error,
  selectedRequirementKey,
  onSelectRequirement,
  onActivateRequirement,
  activeRequirementKey = null,
}: RequirementChecklistProps) {
  const hintedKinds = new Set<string>();
  const indexMode = onActivateRequirement !== undefined;
  const activeItem = indexMode
    ? (items.find((item) => item.key === activeRequirementKey) ?? null)
    : null;

  // Al activar una línea, el foco va al título del cuerpo: eso anuncia el cambio.
  const focusPending = useRef(false);
  const activeKey = activeItem?.key;
  useEffect(() => {
    if (!focusPending.current || !activeKey) return;
    focusPending.current = false;
    document
      .getElementById(requirementBodyHeadingId(items.find((item) => item.key === activeKey)!))
      ?.focus();
  }, [activeKey, items]);

  function renderTrigger(item: RequirementChecklistItem): ReactNode {
    if (mode !== 'action' || item.state === 'unknown' || !item.action) return null;
    return (
      <Button
        type="button"
        id={`requirement-trigger-${item.key}`}
        variant="secondary"
        className="min-h-11"
        disabled={offline}
        aria-label={`${requirementActionLabel(item.action)} para ${item.label}`}
        aria-controls={
          selectedRequirementKey === item.key ? `requirement-action-${item.key}` : undefined
        }
        onClick={() => onSelectRequirement?.(item.key)}
      >
        {requirementActionLabel(item.action)}
      </Button>
    );
  }

  function renderBody(item: RequirementChecklistItem): ReactNode {
    if (item.body !== undefined) return item.body;
    const headingId = requirementBodyHeadingId(item);
    return (
      <section aria-labelledby={headingId} className="space-y-3">
        <h3
          id={headingId}
          tabIndex={-1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {item.label}
        </h3>
        {renderTrigger(item)}
        {item.actionBody}
        {item.history}
      </section>
    );
  }

  const lines = items.map((item) => {
    const preStartHint =
      showPreStartHints && mode === 'readonly' && !hintedKinds.has(item.kind)
        ? PRE_START_HINTS[item.kind]
        : undefined;
    if (preStartHint) hintedKinds.add(item.kind);
    const state = stateLabelOf(item);
    const requiredLabel = item.requiredLabel ?? (item.required ? 'Obligatorio' : 'Opcional');
    const reasonId = `requirement-reason-${item.key}`;
    const active = activeItem?.key === item.key;
    const notes = [
      item.reason ? { id: reasonId, text: item.reason } : null,
      item.detail ? { id: `requirement-detail-${item.key}`, text: item.detail } : null,
      preStartHint ? { id: `requirement-hint-${item.key}`, text: preStartHint } : null,
      !item.required && item.kind === 'ACTIVITY'
        ? {
            id: `requirement-optional-${item.key}`,
            text: 'Puedes dejar constancia de la instalación. Este registro es opcional y no bloquea el cierre.',
          }
        : null,
    ].filter((note): note is { id: string; text: string } => note !== null);
    const head = (
      <>
        <span className="text-sm font-medium text-iwana-primary dark:text-white">{item.label}</span>
        <span className="sr-only">, </span>
        <Badge variant={item.requiredLabel && item.state === 'unknown' ? 'info' : 'neutral'}>
          {requiredLabel}
        </Badge>
        <span className="sr-only">, </span>
        <Badge
          variant={
            item.state === 'satisfied' ? 'lime' : item.state === 'unknown' ? 'info' : 'neutral'
          }
        >
          {state}
        </Badge>
      </>
    );
    return (
      <li
        key={item.key}
        aria-label={
          item.ariaLabel ?? `${item.label}: ${state}${item.reason ? `: ${item.reason}` : ''}`
        }
        className={indexMode ? 'py-0.5' : 'space-y-2 py-3'}
      >
        {indexMode ? (
          <button
            type="button"
            aria-current={active ? 'step' : undefined}
            aria-describedby={notes.length ? notes.map((note) => note.id).join(' ') : undefined}
            onClick={() => {
              // Solo un cambio de activo mueve el foco: la línea ya activa no deja
              // una marca pendiente que luego robe el foco a la hoja abierta.
              if (!active) focusPending.current = true;
              onActivateRequirement?.(item.key);
            }}
            className={`w-full rounded-lg border-l-4 px-3 py-1 text-left ${
              active
                ? 'border-iwana-primary bg-iwana-surface-soft dark:border-white dark:bg-dark-surface-3'
                : 'border-transparent hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3'
            }`}
          >
            <span className="flex flex-wrap items-center gap-2">{head}</span>
            {notes.map((note) => (
              <span
                key={note.id}
                id={note.id}
                className="mt-0.5 block text-xs text-gray-600 dark:text-gray-300"
              >
                {note.text}
              </span>
            ))}
          </button>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">{head}</div>
            {notes.map((note) => (
              <p key={note.id} className="text-sm text-gray-500 dark:text-gray-400">
                {note.text}
              </p>
            ))}
            {renderTrigger(item)}
            {item.actionBody}
            {item.history}
          </>
        )}
      </li>
    );
  });

  return (
    <section aria-label="Requisitos" aria-busy={loading || refreshing} className="space-y-2">
      {/* Defecto 1 (opción C): ayuda y avance comparten la fila del título; el avance
          conserva rótulo, porcentaje y barra con su nombre accesible. */}
      <div data-requirements-header>
        <SectionHeader
          icon={ListChecks}
          title="Requisitos"
          headingLevel={3}
          size="sm"
          className="flex-wrap gap-y-2"
          {...(description ? { description } : {})}
          actions={
            !loading && progress !== undefined ? (
              <div className="w-full space-y-1 sm:w-56">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-iwana-primary dark:text-white/90">
                    Avance de requisitos
                  </span>
                  <span className="text-lg leading-none font-bold text-iwana-secondary-700 dark:text-iwana-secondary-400">
                    {Math.max(0, Math.min(100, progress))}%
                  </span>
                </div>
                <ProgressMeter
                  compact
                  value={progress}
                  label="Avance de requisitos"
                  ariaLabel="Avance de requisitos de la orden"
                />
              </div>
            ) : undefined
          }
        />
      </div>
      {loading ? (
        <SkeletonBlock className="h-48" />
      ) : (
        <>
          {error && (
            <PortalAlert
              variant="error"
              live="assertive"
              title="No pudimos consultar los requisitos"
              description={error.message}
              action={<Button onClick={error.onRetry}>Reintentar</Button>}
            />
          )}
          {items.some((item) => item.state === 'unknown' && !item.stateLabel) && (
            <PortalAlert
              variant="info"
              title="Estado de requisitos no disponible"
              description="No pudimos consultar el estado de los requisitos. Intenta actualizar la orden."
            />
          )}
          {indexMode ? (
            <nav aria-label="Requisitos de la orden">
              <ol className="space-y-0.5">{lines}</ol>
            </nav>
          ) : (
            <ul
              className="divide-y divide-gray-200 dark:divide-dark-border"
              aria-label="Requisitos de la orden"
            >
              {lines}
            </ul>
          )}
          {activeItem ? (
            <div className="rounded-2xl border border-gray-200 p-3 dark:border-dark-border">
              {renderBody(activeItem)}
            </div>
          ) : null}
          {unattributedConsumptionHistory}
          {historyFooter}
        </>
      )}
    </section>
  );
}
