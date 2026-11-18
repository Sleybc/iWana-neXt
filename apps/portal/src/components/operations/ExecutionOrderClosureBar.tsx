'use client';

import { Fragment } from 'react';
import type { ExecutionOrderTemplateVersion } from '@iwana/shared';
import { Button } from '@iwana/ui';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { PROVISIONING_REQUIREMENT_KEY } from './ExecutionOrderRequirementIndex';
import { templateRequirementLabel } from './execution-order-requirements';

export interface ExecutionOrderClosureBarProps {
  order: ExecutionOrderDetailResponse;
  template: ExecutionOrderTemplateVersion | null;
  /** Aprovisionamiento cuando es obligatorio para cerrar; `null` si no aplica. */
  provisioning: { known: boolean; certified: boolean } | null;
  onActivateRequirement: (requirementKey: string) => void;
  onGoToClose: () => void;
}

const MAX_NAMED = 2;

/**
 * Barra de cierre (spec 2026-11-18 bloque E; veredicto DS «barra de cierre»).
 * Va en el `footer` de `OperationalSidePeek`: fija por layout, sin sticky. Cuenta
 * solo obligatorios, incluido el aprovisionamiento cuando es obligatorio. No
 * ejecuta el cierre ni sustituye su gate: lleva a la sección Cierre.
 */
export function ExecutionOrderClosureBar({
  order,
  template,
  provisioning,
  onActivateRequirement,
  onGoToClose,
}: ExecutionOrderClosureBarProps) {
  const evaluations = order.completion.requirements;
  const required = (template?.requirements ?? order.template?.requirements ?? []).filter(
    (requirement) => requirement.required,
  );
  const states = required.map((requirement) => ({
    key: requirement.key,
    label: templateRequirementLabel(requirement),
    satisfied: evaluations?.find((entry) => entry.requirementId === requirement.key)?.satisfied,
  }));
  // Si la plantilla ya trae el requisito de aprovisionamiento, cuenta una sola vez (el del gate).
  const snapshotHasProvisioning = (
    template?.requirements ??
    order.template?.requirements ??
    []
  ).some((requirement) => requirement.kind === 'PROVISIONING');
  if (provisioning && !snapshotHasProvisioning) {
    states.push({
      key: PROVISIONING_REQUIREMENT_KEY,
      label: 'Aprovisionamiento certificado',
      satisfied: provisioning.known ? provisioning.certified : undefined,
    });
  }
  const unknown = evaluations == null || states.some((state) => state.satisfied === undefined);
  const missing = states.filter((state) => state.satisfied === false);
  const done = states.length - missing.length;
  const named = missing.slice(0, MAX_NAMED);
  const rest = missing.length - named.length;

  return (
    <div className="flex items-center justify-between gap-3 pb-[env(safe-area-inset-bottom)]">
      <div className="min-w-0" role="status" aria-live="polite">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
          {unknown
            ? 'No pudimos consultar el estado de los requisitos'
            : missing.length === 0
              ? 'Todos los obligatorios están cumplidos'
              : `${done} de ${states.length} obligatorios cumplidos`}
        </p>
        {!unknown && missing.length > 0 ? (
          <p className="hidden text-xs text-gray-600 sm:block dark:text-gray-300">
            Falta:{' '}
            {named.map((state, index) => (
              <Fragment key={state.key}>
                {index > 0 ? ', ' : null}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => onActivateRequirement(state.key)}
                >
                  {state.label}
                </Button>
              </Fragment>
            ))}
            {rest > 0 ? ` y ${rest} más` : null}
          </p>
        ) : null}
      </div>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onGoToClose}>
        Ir al cierre
      </Button>
    </div>
  );
}
