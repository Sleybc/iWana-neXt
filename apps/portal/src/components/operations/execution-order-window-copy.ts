// apps/portal/src/components/operations/execution-order-window-copy.ts
//
// MOD11 E4-portal (CA-12): texto de una OT sin ventana planificada. Una sola
// fuente para la bandeja y el resumen, para que la misma orden diga lo mismo
// en las dos superficies.
//
// - Contrato de tablas v1.2 §7.2 col. 5 y UX consola v1.1 §7.1/§7.3.
// - La semántica depende SOLO del `status` publicado en la fila o el detalle;
//   no se infiere de otras señales (evento, asignación, resultado).
// - Estado abierto (CREATED, ASSIGNED, EN_ROUTE, IN_PROGRESS, BLOCKED):
//   «Por programar», con ayuda dirigida a quien coordina. Estado terminal:
//   «Sin ventana planificada», sin ayuda: ya no es trabajo por programar.
// - La ayuda NO invita al técnico a reclamar CREATED: remite a programación.
import type { ExecutionOrderStatus } from '@iwana/shared';
import { isTerminalStatus } from './execution-order-moment';

export interface ExecutionOrderWindowAbsence {
  /** Texto de la celda o del valor «Ventana planificada». */
  label: string;
  /** Ayuda del resumen abierto; `null` cuando no corresponde (terminal). */
  help: string | null;
}

/**
 * Rótulo de una orden abierta sin ventana. La cola «Por programar» de la
 * bandeja (spec 2026-11-19 §3 H: activas sin ventana) reutiliza el mismo texto.
 */
export const EXECUTION_ORDER_TO_SCHEDULE_LABEL = 'Por programar';

const OPEN_WINDOW_ABSENCE: ExecutionOrderWindowAbsence = {
  label: EXECUTION_ORDER_TO_SCHEDULE_LABEL,
  help: 'Esta orden no tiene una ventana planificada. Coordina su programación con el equipo de programación.',
};

const TERMINAL_WINDOW_ABSENCE: ExecutionOrderWindowAbsence = {
  label: 'Sin ventana planificada',
  help: null,
};

/** Cómo se expresa la ausencia de ventana según el estado publicado de la OT. */
export function getExecutionOrderWindowAbsence(
  status: ExecutionOrderStatus,
): ExecutionOrderWindowAbsence {
  return isTerminalStatus(status) ? TERMINAL_WINDOW_ABSENCE : OPEN_WINDOW_ABSENCE;
}
