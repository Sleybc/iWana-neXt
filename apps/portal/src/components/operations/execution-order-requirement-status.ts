// apps/portal/src/components/operations/execution-order-requirement-status.ts
//
// C4 (OLA1, PROMPT-MOD11-CONSOLA-OT-OLA1-FE-PLATFORM-v1.0 §3 pasos 6-8):
// el checklist consume `completion.requirements[]` del contrato congelado
// (`packages/shared/src/contracts/operations/execution-orders-completion.ts`
// v1, publicado por `getCompletion` desde `evaluation.allEvaluations`,
// anclado como campo opcional en `ExecutionOrderCompletionView.requirements`
// de `execution-orders.ts` v1.1). Cada ítem pinta etiqueta, estado (cumplido
// o pendiente) y, cuando está pendiente, su razón en lenguaje de producto.
//
// - El badge "Requerido" se conserva pero deja de ser la única información.
// - Si `requirements[]` no viene (plantilla sin snapshot o backend anterior
//   a C2), se degrada a la lista básica de FORMA VISIBLE, nunca a un bloque
//   vacío silencioso (paso 8).
// - `FIELD` y `MEASUREMENT` llegan pendientes permanentes hasta que exista
//   contrato de captura (spec §4.6, deuda §10.1): se muestran como estado,
//   sin acción en v1, no como error.
import type { ExecutionOrderTemplateRequirement } from '@iwana/shared';
import type { ExecutionOrderRequirementStatus } from '@iwana/shared';

export type RequirementChecklistState = 'satisfied' | 'pending' | 'unknown';

export interface RequirementChecklistItem {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  state: RequirementChecklistState;
  /** Razón en lenguaje de producto; solo cuando el estado es pendiente. */
  reason?: string | undefined;
}

const FALLBACK_PENDING_REASON = 'Completa el requisito pendiente antes de cerrar la orden.';

function statusLabel(status: ExecutionOrderRequirementStatus, fallback: string): string {
  const label = typeof status.label === 'string' ? status.label.trim() : '';
  return label || fallback;
}

function statusReason(
  status: ExecutionOrderRequirementStatus,
  kind: string,
  label: string,
): string {
  const reason = typeof status.reason === 'string' ? status.reason.trim() : '';
  if (reason) return reason;
  switch (kind) {
    case 'EVIDENCE':
      return `Adjunta ${label.toLowerCase()} antes de cerrar la orden.`;
    case 'MATERIAL':
      return 'Registra el material o equipo requerido antes de cerrar la orden.';
    case 'COMPLIANCE':
      return 'Registra la aceptación del cliente antes de cerrar la orden.';
    case 'ACTIVITY':
      return 'Registra la actividad requerida antes de cerrar la orden.';
    case 'MEASUREMENT':
      return 'Registra la medición requerida antes de cerrar la orden.';
    case 'FIELD':
      return 'Completa la información requerida antes de cerrar la orden.';
    default:
      return FALLBACK_PENDING_REASON;
  }
}

/**
 * Cruza la plantilla con el estado real por requisito. `requirementId` del
 * contrato es la clave del requisito en el snapshot (`req.key`), según el
 * evaluador (`closure-gate-evaluator.service.ts:93`).
 *
 * @param requirements `completion.requirements[]`; `undefined` cuando el
 * backend no lo publica (degradación visible, paso 8).
 */
export function getRequirementChecklistItems(
  templateRequirements: readonly ExecutionOrderTemplateRequirement[],
  requirements: readonly ExecutionOrderRequirementStatus[] | null | undefined,
  fallbackLabel: (requirement: ExecutionOrderTemplateRequirement) => string,
): RequirementChecklistItem[] {
  return templateRequirements.map((requirement) => {
    const fallback = fallbackLabel(requirement);
    if (requirements == null) {
      return {
        key: requirement.key,
        label: fallback,
        kind: requirement.kind,
        required: requirement.required,
        state: 'unknown' as const,
      };
    }
    const status = requirements.find((item) => item.requirementId === requirement.key);
    if (!status) {
      return {
        key: requirement.key,
        label: fallback,
        kind: requirement.kind,
        required: requirement.required,
        state: 'pending' as const,
        reason: FALLBACK_PENDING_REASON,
      };
    }
    const label = statusLabel(status, fallback);
    if (status.satisfied) {
      return {
        key: requirement.key,
        label,
        kind: status.kind || requirement.kind,
        required: requirement.required,
        state: 'satisfied' as const,
      };
    }
    return {
      key: requirement.key,
      label,
      kind: status.kind || requirement.kind,
      required: requirement.required,
      state: 'pending' as const,
      reason: statusReason(status, requirement.kind, label),
    };
  });
}

/** Texto accesible por ítem: legible por lector de pantalla, no solo color (paso 4 del prompt, CA-05). */
export function getRequirementStateText(item: RequirementChecklistItem): string | null {
  if (item.state === 'satisfied') return 'Cumplido';
  if (item.state === 'pending') return item.reason ? `Pendiente: ${item.reason}` : 'Pendiente';
  return null;
}
