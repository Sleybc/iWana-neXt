// apps/portal/src/components/operations/execution-order-slots.ts
//
// B0 (Ola 2b) — CONTRATO DE SLOTS del expediente por requisito. Propietario: B0.
// R2, R3 y R4 NO editan este archivo ni el shell: sustituyen el contenido de sus
// propios archivos respetando estas firmas.
//
//   slot de evidencia   -> ExecutionOrderEvidenceAction.tsx   (R2)
//   slot de consumo     -> ExecutionOrderMaterialAction.tsx   (R3)
//   slot de actividad   -> ExecutionOrderActivityAction.tsx   (B0, completo)
//
// Regla de estabilidad: cada slot recibe el MISMO sobre de props. Lo que un slot
// necesite del drawer (datos, estados, callbacks) lo toma de `context`, que es el
// contrato de props público del drawer (`ExecutionOrderDrawerProps`), así que
// añadir un dato nuevo a un slot no obliga a editar el shell. Ninguna prop
// transporta usuario, rol ni responsable para decidir permisos: el permiso ya
// viene resuelto en el descriptor de acción (`allowedActions` + momento).
import type { ExecutionOrderTemplateRequirement } from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import type { RequirementActionDescriptor } from './execution-order-actions';
import type { ExecutionOrderDrawerProps } from './execution-order-console-types';

export type ExecutionOrderRequirementOf<K extends ExecutionOrderTemplateRequirement['kind']> =
  Extract<ExecutionOrderTemplateRequirement, { kind: K }>;
export type ExecutionOrderActionOf<K extends RequirementActionDescriptor['kind']> = Extract<
  RequirementActionDescriptor,
  { kind: K }
>;

/** Todo lo que el drawer ya publica; solo lectura. */
export type ExecutionOrderSlotContext = Readonly<ExecutionOrderDrawerProps>;

/**
 * Manejador que ejecuta el envío del formulario del slot. `RequirementActionSheet`
 * intercepta el submit nativo de todo `<form data-requirement-submit>` y lo
 * delega aquí, de modo que el estado del formulario vive en el slot y la hoja no
 * conoce sus campos. Pasar `null` retira el manejador (desmontaje).
 */
export type ExecutionOrderSubmitHandler = () => void | Promise<void>;
export type ExecutionOrderBindSubmit = (handler: ExecutionOrderSubmitHandler | null) => void;

interface SlotBaseProps<K extends ExecutionOrderTemplateRequirement['kind']> {
  /** Detalle vigente de la orden (siempre no nulo cuando el slot se monta). */
  order: ExecutionOrderDetailResponse;
  /** Requisito del snapshot que originó el slot, tal cual llega (etiqueta literal). */
  requirement: ExecutionOrderRequirementOf<K>;
  context: ExecutionOrderSlotContext;
}

/**
 * Slot de captura: se monta dentro de `RequirementActionSheet` solo cuando existe
 * un descriptor autorizado (momento en progreso + `allowedActions`).
 */
export interface ExecutionOrderCaptureSlotProps<
  K extends ExecutionOrderTemplateRequirement['kind'],
  A extends RequirementActionDescriptor['kind'],
> extends SlotBaseProps<K> {
  /** Descriptor que originó la acción; conserva `requirementKey` y el tipo de acto. */
  action: ExecutionOrderActionOf<A>;
  bindSubmit: ExecutionOrderBindSubmit;
  /** Cierra la hoja y devuelve el foco al disparador (misma vía que «Cancelar»). */
  onClose: () => void;
}

/**
 * Slot de historial: registros ya guardados, bajo su requisito y separados de la
 * captura. Se monta en cualquier momento posterior al inicio, también en lectura.
 */
export type ExecutionOrderHistorySlotProps<K extends ExecutionOrderTemplateRequirement['kind']> =
  SlotBaseProps<K>;
