'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import type { ExecutionOrderTemplateRequirement } from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import {
  ExecutionOrderActivityAction,
  ExecutionOrderActivityHistory,
} from './ExecutionOrderActivityAction';
import {
  ExecutionOrderEvidenceAction,
  ExecutionOrderEvidenceHistory,
} from './ExecutionOrderEvidenceAction';
import {
  ExecutionOrderMaterialAction,
  ExecutionOrderMaterialHistoryFooter,
  ExecutionOrderMaterialHistory,
  ExecutionOrderMaterialUnattributedHistory,
} from './ExecutionOrderMaterialAction';
import { RequirementActionSheet } from './RequirementActionSheet';
import { RequirementChecklist } from './RequirementChecklist';
import type { RequirementActionDescriptor } from './execution-order-actions';
import { getExecutionOrderMoment, resolveRequirementAction } from './execution-order-moment';
import { getRequirementChecklistItems } from './execution-order-requirement-status';
import { templateRequirementLabel } from './execution-order-requirements';
import type {
  ExecutionOrderSlotContext,
  ExecutionOrderSubmitHandler,
} from './execution-order-slots';

// B0 — índice de requisitos del expediente. Compone `RequirementChecklist` y
// `RequirementActionSheet` y monta los slots por tipo de requisito. Es el ÚNICO
// lugar que conoce qué slot atiende a cada tipo; R2 (evidencia), R3 (consumo) y
// B0 (actividad) cambian su contenido en sus archivos sin tocar este índice.
//
// Reglas de montaje por momento (UX §4, CA-10):
// - pre-inicio: solo lectura; ningún formulario, selector de archivo ni custodia;
// - en progreso: la acción de cada requisito existe solo si `allowedActions` la
//   autoriza (`resolveRequirementAction`); el historial queda bajo el requisito;
// - bloqueada y terminal: todo en lectura, con historial.

export interface ExecutionOrderRequirementIndexProps {
  order: ExecutionOrderDetailResponse;
  context: ExecutionOrderSlotContext;
  /** La selección vive en el shell: sobrevive al refresco que desmonta el cuerpo del drawer. */
  selectedAction: RequirementActionDescriptor | null;
  onSelectAction: (action: RequirementActionDescriptor | null) => void;
}

export function ExecutionOrderRequirementIndex({
  order,
  context,
  selectedAction,
  onSelectAction,
}: ExecutionOrderRequirementIndexProps) {
  const { template = null, isSubmitting, offline, error, successMessage = null } = context;
  const requirements = template?.requirements ?? [];
  const moment = getExecutionOrderMoment(order.status);
  const items = getRequirementChecklistItems(
    requirements,
    order.completion.requirements,
    templateRequirementLabel,
  );
  const unattributedHistory =
    moment !== 'pre-start' && context.itemUsage.some((usage) => usage.requirementKey == null) ? (
      <ExecutionOrderMaterialUnattributedHistory order={order} context={context} />
    ) : null;
  const historyFooter =
    moment !== 'pre-start' ? (
      <ExecutionOrderMaterialHistoryFooter order={order} context={context} />
    ) : null;

  // La hoja delega el submit nativo en el manejador que registra el slot activo.
  const submitHandler = useRef<ExecutionOrderSubmitHandler | null>(null);
  const bindSubmit = useCallback((handler: ExecutionOrderSubmitHandler | null) => {
    submitHandler.current = handler;
  }, []);
  const closeAction = () => onSelectAction(null);

  function renderHistory(requirement: ExecutionOrderTemplateRequirement): ReactNode {
    const props = { order, context };
    switch (requirement.kind) {
      case 'ACTIVITY':
        return <ExecutionOrderActivityHistory {...props} requirement={requirement} />;
      case 'EVIDENCE':
        return <ExecutionOrderEvidenceHistory {...props} requirement={requirement} />;
      case 'MATERIAL':
        return <ExecutionOrderMaterialHistory {...props} requirement={requirement} />;
      default:
        return null;
    }
  }

  function renderCapture(
    action: RequirementActionDescriptor,
    requirement: ExecutionOrderTemplateRequirement,
  ): ReactNode {
    const props = { order, context, bindSubmit, onClose: closeAction };
    if (action.kind === 'activity' && requirement.kind === 'ACTIVITY') {
      return <ExecutionOrderActivityAction {...props} requirement={requirement} action={action} />;
    }
    if (action.kind === 'evidence' && requirement.kind === 'EVIDENCE') {
      return <ExecutionOrderEvidenceAction {...props} requirement={requirement} action={action} />;
    }
    if (action.kind === 'consumption' && requirement.kind === 'MATERIAL') {
      return <ExecutionOrderMaterialAction {...props} requirement={requirement} action={action} />;
    }
    return null;
  }

  const sheetStatus = offline
    ? 'offline'
    : isSubmitting
      ? 'loading'
      : error
        ? 'error'
        : successMessage
          ? 'success'
          : 'idle';

  return (
    <RequirementChecklist
      items={items.map((item) => {
        const requirement = requirements.find((entry) => entry.key === item.key);
        const action =
          requirement && item.state !== 'unknown'
            ? resolveRequirementAction(order, requirement)
            : undefined;
        // La hoja solo se abre sobre el requisito seleccionado y mientras su acción siga autorizada.
        const sheetAction =
          action !== undefined && action.requirementKey === selectedAction?.requirementKey
            ? selectedAction
            : null;
        return {
          ...item,
          action,
          history: moment !== 'pre-start' && requirement ? renderHistory(requirement) : null,
          actionBody:
            sheetAction && requirement ? (
              <RequirementActionSheet
                key={sheetAction.requirementKey}
                open
                action={sheetAction}
                status={sheetStatus}
                errorMessage={error ?? undefined}
                onCancel={closeAction}
                onSubmit={() => void submitHandler.current?.()}
                body={renderCapture(sheetAction, requirement)}
              />
            ) : null,
        };
      })}
      progress={order.completion.progress}
      unattributedConsumptionHistory={unattributedHistory}
      historyFooter={historyFooter}
      mode={moment === 'in-progress' ? 'action' : 'readonly'}
      offline={offline}
      selectedRequirementKey={selectedAction?.requirementKey}
      onSelectRequirement={(key) => {
        const requirement = requirements.find((entry) => entry.key === key);
        const action = requirement ? resolveRequirementAction(order, requirement) : undefined;
        if (action) onSelectAction(action);
      }}
    />
  );
}
