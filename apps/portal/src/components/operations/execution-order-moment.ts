// apps/portal/src/components/operations/execution-order-moment.ts
//
// B0 (Ola 2b, UX spec v1.1 §4): el momento de trabajo decide qué se monta.
// Matriz de 4 momentos x 3 lentes; la lente (ejecutor, ejecutor sin asignación,
// supervisión) NO se decide aquí: la única fuente de las acciones es
// `allowedActions`, así que el momento solo fija la superficie máxima y la
// lente la recorta (contrato de componente §2.3: el estado no crea permiso).
//
//   pre-inicio  CREATED | ASSIGNED | EN_ROUTE  -> índice en lectura; nada de captura (CA-10)
//   en progreso IN_PROGRESS                     -> índice activo; cada acción nace del requisito
//   bloqueada   BLOCKED                         -> estado sin motivo (adenda A1) y todo en lectura
//   terminal    COMPLETED | ... | CANCELLED     -> resultado y expediente en lectura
import { ExecutionOrderStatus } from '@iwana/shared';
import type { ExecutionOrderTemplateRequirement } from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { getRequirementAction, type RequirementActionDescriptor } from './execution-order-actions';
import { isPreStartStatus } from './execution-order-commitment-copy';

export type ExecutionOrderMoment = 'pre-start' | 'in-progress' | 'blocked' | 'terminal';

const TERMINAL_STATUSES: ReadonlySet<ExecutionOrderStatus> = new Set([
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
  ExecutionOrderStatus.CANCELLED,
]);

export function isTerminalStatus(status: ExecutionOrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function getExecutionOrderMoment(status: ExecutionOrderStatus): ExecutionOrderMoment {
  if (isPreStartStatus(status)) return 'pre-start';
  if (status === ExecutionOrderStatus.BLOCKED) return 'blocked';
  if (isTerminalStatus(status)) return 'terminal';
  return 'in-progress';
}

/**
 * Superficie interactiva en general (inicio, cierre y actos de requisito): ni
 * bloqueada, ni terminal, ni sin conexión, ni fuera de sincronía, y con
 * `allowedActions` publicado. Es una condición necesaria, no suficiente: cada
 * acción sigue exigiendo su propia entrada en `allowedActions`.
 */
export function canInteract(
  order: Pick<ExecutionOrderDetailResponse, 'status' | 'syncState' | 'allowedActions'>,
  offline: boolean,
): boolean {
  return (
    order.status !== ExecutionOrderStatus.BLOCKED &&
    !isTerminalStatus(order.status) &&
    !offline &&
    order.allowedActions !== null &&
    order.syncState === 'IN_SYNC'
  );
}

/**
 * Único punto donde se decide si la orden admite superficie de captura: solo
 * en progreso y en sincronía, y nunca sin `allowedActions` publicado. Ni el
 * estado ni la sincronización conceden permiso; solo lo retiran.
 */
export function admitsCapture(
  order: Pick<ExecutionOrderDetailResponse, 'status' | 'syncState' | 'allowedActions'>,
): boolean {
  return (
    getExecutionOrderMoment(order.status) === 'in-progress' &&
    order.syncState === 'IN_SYNC' &&
    order.allowedActions !== null
  );
}

/**
 * La acción de un requisito nace del propio requisito (UX §3.2) y solo existe
 * si el momento admite captura y `allowedActions` la autoriza. Ningún dato de
 * usuario, rol o responsable interviene.
 */
export function resolveRequirementAction(
  order: Pick<ExecutionOrderDetailResponse, 'status' | 'syncState' | 'allowedActions'>,
  requirement: ExecutionOrderTemplateRequirement,
): RequirementActionDescriptor | undefined {
  if (!admitsCapture(order)) return undefined;
  return getRequirementAction(requirement, order.allowedActions);
}
