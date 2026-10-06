'use client';

import type { ReactNode } from 'react';
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
}
export interface RequirementChecklistProps {
  items: readonly RequirementChecklistItem[];
  /** Historial sin clave, presentado una sola vez fuera de las filas del snapshot. */
  unattributedConsumptionHistory?: ReactNode;
  /** Contador y paginación de historial con alcance global a la OT. */
  historyFooter?: ReactNode;
  progress?: number;
  mode: 'readonly' | 'action';
  loading?: boolean;
  refreshing?: boolean;
  offline?: boolean;
  error?: { message: string; onRetry: () => void };
  selectedRequirementKey?: string | undefined;
  onSelectRequirement?: (requirementKey: string) => void;
}
export function RequirementChecklist({
  items,
  unattributedConsumptionHistory,
  historyFooter,
  progress,
  mode,
  loading,
  refreshing,
  offline,
  error,
  selectedRequirementKey,
  onSelectRequirement,
}: RequirementChecklistProps) {
  return (
    <section aria-label="Requisitos" aria-busy={loading || refreshing} className="space-y-3">
      <SectionHeader icon={ListChecks} title="Requisitos" headingLevel={3} size="sm" />
      {loading ? (
        <SkeletonBlock className="h-48" />
      ) : (
        <>
          {progress !== undefined && (
            <ProgressMeter
              value={progress}
              label="Avance de requisitos"
              ariaLabel="Avance de requisitos de la orden"
            />
          )}
          {error && (
            <PortalAlert
              variant="error"
              live="assertive"
              title="No pudimos consultar los requisitos"
              description={error.message}
              action={<Button onClick={error.onRetry}>Reintentar</Button>}
            />
          )}
          {items.some((item) => item.state === 'unknown') && (
            <PortalAlert
              variant="info"
              title="Estado de requisitos no disponible"
              description="No pudimos consultar el estado de los requisitos. Intenta actualizar la orden."
            />
          )}
          <ul
            className="divide-y divide-gray-200 dark:divide-dark-border"
            aria-label="Requisitos de la orden"
          >
            {items.map((item) => {
              const state =
                item.state === 'satisfied'
                  ? 'Cumplido'
                  : item.state === 'unknown'
                    ? 'Estado no disponible'
                    : item.required
                      ? 'Pendiente'
                      : 'Sin registrar';
              return (
                <li
                  key={item.key}
                  aria-label={`${item.label}: ${state}${item.reason ? `: ${item.reason}` : ''}`}
                  className="space-y-2 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-iwana-primary dark:text-white">
                      {item.label}
                    </span>
                    <Badge variant="neutral">{item.required ? 'Obligatorio' : 'Opcional'}</Badge>
                    <Badge
                      variant={
                        item.state === 'satisfied'
                          ? 'lime'
                          : item.state === 'unknown'
                            ? 'info'
                            : 'neutral'
                      }
                    >
                      {state}
                    </Badge>
                  </div>
                  {item.reason && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.reason}</p>
                  )}
                  {!item.required && item.kind === 'ACTIVITY' && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Puedes dejar constancia de la instalación. Este registro es opcional y no
                      bloquea el cierre.
                    </p>
                  )}
                  {mode === 'action' && item.state !== 'unknown' && item.action && (
                    <Button
                      type="button"
                      id={`requirement-trigger-${item.key}`}
                      variant="secondary"
                      className="min-h-11"
                      disabled={offline}
                      aria-label={`${requirementActionLabel(item.action)} para ${item.label}`}
                      aria-expanded={selectedRequirementKey === item.key}
                      aria-controls={
                        selectedRequirementKey === item.key
                          ? `requirement-action-${item.key}`
                          : undefined
                      }
                      onClick={() => onSelectRequirement?.(item.key)}
                    >
                      {requirementActionLabel(item.action)}
                    </Button>
                  )}
                  {item.actionBody}
                  {item.history}
                </li>
              );
            })}
          </ul>
          {unattributedConsumptionHistory}
          {historyFooter}
        </>
      )}
    </section>
  );
}
