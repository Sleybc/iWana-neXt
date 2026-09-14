// apps/portal/src/components/operations/execution-order-commitment-copy.ts
//
// C3 (OLA1, PROMPT-MOD11-CONSOLA-OT-OLA1-FE-PLATFORM-v1.0 §3 pasos 4-5):
// copy por rol y por estado de la consola de OT, implementado verbatim desde
// la tabla cerrada de AI-PROD-UX
// (`docs/informes/INFORME-MOD11-CONSOLA-OT-OLA1-PROD-UX-v1.0.md`, 12 celdas).
// Este módulo no reescribe el copy: lo centraliza para que el drawer lo
// consuma sin duplicar lógica (DRY) y sin decidir permisos en el cliente.
//
// Reglas que implementa:
// - El rol del espectador se deriva SOLO de `allowedActions` (calculadas por
//   el backend con el `sub` del JWT, spec §4.4). Nunca se lee la identidad del
//   usuario ni `assignee` para decidir permisos; `assignee` solo se usa como
//   dato descriptivo de la orden (tiene responsable o no) para elegir entre
//   las dos celdas de ejecutor que ya distingue la tabla.
// - La alerta de inicio vive SOLO en pre-inicio (CREATED, ASSIGNED, EN_ROUTE)
//   y solo para quien ni puede iniciar ni tiene acciones de supervisión: en
//   `IN_PROGRESS`, bloqueada y terminal no se renderiza para ningún rol
//   (CA-03). Un supervisor nunca ve copy dirigido a técnicos (CA-04).
// - Ninguna celda menciona la sincronización: `start()` no la valida y fuera
//   de sincronía la alerta ni se renderiza (diagnóstico A3 del informe).
import { ExecutionOrderStatus } from '@iwana/shared';
import type { ExecutionOrderAllowedAction } from '@iwana/shared';

/** Lente del espectador, derivada solo de `allowedActions`. */
export type CommitmentLens = 'executor' | 'supervision' | 'observer';

const SUPERVISION_ACTIONS: readonly ExecutionOrderAllowedAction[] = [
  'ASSIGN',
  'REASSIGN',
  'CREATE_FOLLOW_UP',
];

const REGISTRATION_ACTIONS: readonly ExecutionOrderAllowedAction[] = [
  'REGISTER_ACTIVITY',
  'REGISTER_ITEM_USAGE',
  'REGISTER_EVIDENCE',
];

export function isPreStartStatus(status: ExecutionOrderStatus): boolean {
  return (
    status === ExecutionOrderStatus.CREATED ||
    status === ExecutionOrderStatus.ASSIGNED ||
    status === ExecutionOrderStatus.EN_ROUTE
  );
}

export function getCommitmentLens(
  allowedActions: readonly ExecutionOrderAllowedAction[] | null | undefined,
): CommitmentLens {
  if (allowedActions?.includes('START') === true) return 'executor';
  if (SUPERVISION_ACTIONS.some((action) => allowedActions?.includes(action) === true)) {
    return 'supervision';
  }
  return 'observer';
}

export function hasRegistrationActions(
  allowedActions: readonly ExecutionOrderAllowedAction[] | null | undefined,
): boolean {
  return REGISTRATION_ACTIONS.some((action) => allowedActions?.includes(action) === true);
}

// ─── Copy verbatim de la tabla de AI-PROD-UX (12 celdas) ─────────────────────

export const START_ALERT_TITLE = 'No puedes iniciar esta orden';

const PRE_START_ASSIGNED_HELP =
  'Esta orden está asignada a ti. Cuando llegues al sitio, inicia la ejecución.';
const PRE_START_POOL_HELP =
  'Esta orden no tiene responsable. Si está disponible para tomar, puedes tomarla e iniciar la ejecución.';
const PRE_START_SUPERVISION_HELP =
  'Supervisa esta orden desde aquí: asigna o reasigna al responsable y crea órdenes de seguimiento cuando haga falta. El inicio lo registra el técnico en campo.';

const IN_PROGRESS_ASSIGNED_HELP =
  'La ejecución está en curso. Registra avances, evidencias y consumos desde la lista de requisitos.';
const IN_PROGRESS_POOL_HELP =
  'La ejecución está en curso. Puedes registrar avances desde la lista de requisitos.';
const IN_PROGRESS_SUPERVISION_HELP =
  'La ejecución está en curso. Puedes seguir el avance en la lista de requisitos y crear una orden de seguimiento si hace falta.';

export const BLOCKED_ALERT_TITLE = 'Orden bloqueada';
const BLOCKED_ASSIGNED_DESCRIPTION =
  'Revisa el motivo del bloqueo. Cuando se resuelva, retoma la ejecución desde esta pantalla.';
const BLOCKED_POOL_DESCRIPTION =
  'La orden está bloqueada. Revisa el motivo; cuando se resuelva, puedes retomar la ejecución.';
const BLOCKED_SUPERVISION_DESCRIPTION =
  'La orden está bloqueada. Revisa el motivo con el equipo en campo y crea una orden de seguimiento si hace falta.';

const TERMINAL_ASSIGNED_HELP =
  'La orden está cerrada. Puedes consultar el resumen, los requisitos y el historial.';
const TERMINAL_POOL_HELP = 'La orden está cerrada. Puedes consultar el resumen y el historial.';
const TERMINAL_SUPERVISION_HELP =
  'La orden está cerrada. Puedes consultar el resultado y crear una orden de seguimiento si hace falta.';

const START_ALERT_ASSIGNED_DESCRIPTION = 'El inicio lo registra el técnico en campo.';
const START_ALERT_POOL_DESCRIPTION =
  'Esta orden aún no tiene responsable asignado. El inicio lo registra el técnico en campo.';

// ─── Selectores ─────────────────────────────────────────────────────────────

export interface CommitmentContext {
  status: ExecutionOrderStatus;
  allowedActions: readonly ExecutionOrderAllowedAction[] | null | undefined;
  /** La orden tiene responsable (técnico o cuadrilla). Dato descriptivo, no permiso. */
  assigneePresent: boolean;
}

/**
 * Paso 5: la alerta de inicio solo se renderiza en pre-inicio para el
 * observador sin acciones de supervisión (p. ej. pool sin toma o técnico sin
 * asignación sobre una orden asignada). En progreso, bloqueada y terminal
 * nunca se renderiza (CA-03); la supervisión ve su copy, no esta alerta
 * (CA-04). `canInteract` ya excluye terminal, offline y fuera de sincronía.
 */
export function shouldRenderStartAlert(context: CommitmentContext): boolean {
  if (!isPreStartStatus(context.status)) return false;
  return getCommitmentLens(context.allowedActions) === 'observer';
}

export function getStartAlertDescription(assigneePresent: boolean): string {
  return assigneePresent ? START_ALERT_ASSIGNED_DESCRIPTION : START_ALERT_POOL_DESCRIPTION;
}

/** Ayuda pre-inicio junto al botón o a las acciones de supervisión. Null = la alerta cubre el caso. */
export function getPreStartHelp(context: CommitmentContext): string | null {
  const lens = getCommitmentLens(context.allowedActions);
  if (lens === 'supervision') return PRE_START_SUPERVISION_HELP;
  if (lens === 'executor') {
    return context.assigneePresent ? PRE_START_ASSIGNED_HELP : PRE_START_POOL_HELP;
  }
  return null;
}

/** Ayuda en curso bajo el checklist activo. Null = observador puro sin registro (solo "sin alerta"). */
export function getInProgressHelp(context: CommitmentContext): string | null {
  const lens = getCommitmentLens(context.allowedActions);
  if (lens === 'supervision') return IN_PROGRESS_SUPERVISION_HELP;
  if (lens === 'executor' || hasRegistrationActions(context.allowedActions)) {
    return context.assigneePresent ? IN_PROGRESS_ASSIGNED_HELP : IN_PROGRESS_POOL_HELP;
  }
  return null;
}

export interface BlockedCopy {
  title: string;
  description: string;
}

export function getBlockedCopy(context: CommitmentContext): BlockedCopy {
  const lens = getCommitmentLens(context.allowedActions);
  if (lens === 'supervision') {
    return { title: BLOCKED_ALERT_TITLE, description: BLOCKED_SUPERVISION_DESCRIPTION };
  }
  return {
    title: BLOCKED_ALERT_TITLE,
    description: context.assigneePresent ? BLOCKED_ASSIGNED_DESCRIPTION : BLOCKED_POOL_DESCRIPTION,
  };
}

/** Ayuda terminal en el bloque de cierre de solo lectura. */
export function getTerminalHelp(context: CommitmentContext): string {
  const lens = getCommitmentLens(context.allowedActions);
  if (lens === 'supervision') return TERMINAL_SUPERVISION_HELP;
  return context.assigneePresent ? TERMINAL_ASSIGNED_HELP : TERMINAL_POOL_HELP;
}
