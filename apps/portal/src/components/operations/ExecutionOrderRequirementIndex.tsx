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
import { RequirementChecklist, type RequirementChecklistItem } from './RequirementChecklist';
import type { RequirementActionDescriptor } from './execution-order-actions';
import { getInProgressHelpForOrder } from './execution-order-commitment-copy';
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
  provisioningRequirement?: {
    enabled: boolean | null;
    certified: boolean | null;
    required: boolean;
    /** Cuerpo de la línea: el panel de aprovisionamiento con sus datos y acciones. */
    body?: ReactNode;
  };
  /** Requisito activo del índice (vive en el shell); `null` = ninguno. */
  activeRequirementKey?: string | null;
  onActivateRequirement?: (requirementKey: string) => void;
}

/** Clave de la línea de aprovisionamiento; no colisiona con claves del snapshot. */
export const PROVISIONING_REQUIREMENT_KEY = '__provisioning__';
export const PROVISIONING_BODY_HEADING_ID = 'execution-order-provisioning-heading';

/**
 * Línea del índice que representa el aprovisionamiento: la del snapshot de la
 * plantilla si la trae (la evalúa el gate de la API), o la línea propia de la
 * consola si no. Nunca las dos (QA1, duplicado).
 */
export function provisioningLineKey(
  requirements: readonly { key: string; kind: string }[] | null | undefined,
): string {
  return (
    requirements?.find((requirement) => requirement.kind === 'PROVISIONING')?.key ??
    PROVISIONING_REQUIREMENT_KEY
  );
}

type ProvisioningRequirement = NonNullable<
  ExecutionOrderRequirementIndexProps['provisioningRequirement']
>;

function provisioningItem(provisioning: ProvisioningRequirement): RequirementChecklistItem {
  const known = provisioning.enabled !== null;
  const pending = provisioning.required && !provisioning.certified;
  const stateLabel =
    provisioning.certified === null
      ? 'Estado no disponible'
      : provisioning.certified
        ? 'Certificado'
        : provisioning.required
          ? 'Pendiente'
          : 'Sin registrar';
  return {
    key: PROVISIONING_REQUIREMENT_KEY,
    label: 'Aprovisionamiento certificado',
    kind: 'PROVISIONING',
    required: provisioning.required,
    state: !known ? 'unknown' : provisioning.certified ? 'satisfied' : 'pending',
    requiredLabel: !known
      ? 'Estado no disponible'
      : provisioning.required
        ? 'Obligatorio'
        : 'No requerido',
    stateLabel,
    ariaLabel: `Aprovisionamiento certificado: ${
      !known
        ? 'estado no disponible'
        : provisioning.required
          ? provisioning.certified
            ? 'cumplido'
            : 'pendiente'
          : 'no requerido'
    }`,
    ...(pending
      ? { detail: 'Completa y certifica el servicio técnico antes de cerrar esta instalación.' }
      : !provisioning.required && known
        ? { detail: 'Las órdenes no ejecutadas no requieren certificación.' }
        : {}),
    bodyHeadingId: PROVISIONING_BODY_HEADING_ID,
    body: provisioning.body ?? null,
  };
}

/** Homónimos: dos requisitos con la misma etiqueta se distinguen por su orden (R0 §3). */
function withHomonymDetail<T extends { label: string }>(items: T[]): (T & { detail?: string })[] {
  return items.map((item) => {
    const same = items.filter((entry) => entry.label === item.label);
    if (same.length < 2) return item;
    return { ...item, detail: `(${same.indexOf(item) + 1} de ${same.length})` };
  });
}

/**
 * D3: el primer obligatorio pendiente en el orden del índice; si no hay, el
 * primero. Un estado no disponible no cuenta como pendiente.
 */
export function defaultActiveRequirementKey(
  items: readonly Pick<RequirementChecklistItem, 'key' | 'required' | 'state'>[],
): string | null {
  return (
    items.find((item) => item.required && item.state === 'pending')?.key ??
    items.find((item) => item.state !== 'unknown')?.key ??
    items[0]?.key ??
    null
  );
}

function isSignatureRequirement(requirement: ExecutionOrderTemplateRequirement): boolean {
  return requirement.kind === 'EVIDENCE' && requirement.evidenceType === 'SIGNATURE';
}

export function ExecutionOrderRequirementIndex({
  order,
  context,
  selectedAction,
  onSelectAction,
  provisioningRequirement,
  activeRequirementKey,
  onActivateRequirement,
}: ExecutionOrderRequirementIndexProps) {
  const { template = null, isSubmitting, offline, error, successMessage = null } = context;
  const templateRequirements = template?.requirements ?? [];
  // La firma cierra la secuencia de captura; el resto conserva el orden del snapshot.
  const requirements = [
    ...templateRequirements.filter((requirement) => !isSignatureRequirement(requirement)),
    ...templateRequirements.filter(isSignatureRequirement),
  ];
  const moment = getExecutionOrderMoment(order.status);
  const items = withHomonymDetail(
    getRequirementChecklistItems(
      requirements,
      order.completion.requirements,
      templateRequirementLabel,
    ),
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

  const templateItems: RequirementChecklistItem[] = items.map((item) => {
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
  });
  // Si el snapshot ya trae el requisito de aprovisionamiento, esa línea (con el
  // estado que publica el gate) recibe el cuerpo del panel; no se añade otra.
  const snapshotProvisioningKey = requirements.find(
    (requirement) => requirement.kind === 'PROVISIONING',
  )?.key;
  const checklistItems = !provisioningRequirement
    ? templateItems
    : snapshotProvisioningKey
      ? templateItems.map((item) =>
          item.key === snapshotProvisioningKey
            ? {
                ...item,
                bodyHeadingId: PROVISIONING_BODY_HEADING_ID,
                body: provisioningRequirement.body ?? null,
              }
            : item,
        )
      : [...templateItems, provisioningItem(provisioningRequirement)];

  return (
    <RequirementChecklist
      items={checklistItems}
      progress={order.completion.progress}
      description={getInProgressHelpForOrder(order)}
      unattributedConsumptionHistory={unattributedHistory}
      historyFooter={historyFooter}
      mode={moment === 'in-progress' ? 'action' : 'readonly'}
      showPreStartHints={moment === 'pre-start'}
      offline={offline}
      selectedRequirementKey={selectedAction?.requirementKey}
      onSelectRequirement={(key) => {
        const requirement = requirements.find((entry) => entry.key === key);
        const action = requirement ? resolveRequirementAction(order, requirement) : undefined;
        if (action) onSelectAction(action);
      }}
      {...(onActivateRequirement
        ? {
            onActivateRequirement,
            activeRequirementKey:
              activeRequirementKey === undefined
                ? moment === 'in-progress'
                  ? defaultActiveRequirementKey(checklistItems)
                  : null
                : activeRequirementKey,
          }
        : {})}
    />
  );
}
