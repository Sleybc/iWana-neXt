import { SlaBreachStatus, TicketFieldDecision, TicketPriority, TicketStatus } from '@iwana/shared';
import type { AssuranceTicket, InternalUser } from '@/lib/api-client';
import { EXECUTION_ORDER_STATUS_LABELS } from '@/components/operations/operations-labels';
import {
  ASSURANCE_UNAVAILABLE_ASSIGNEE_LABEL,
  getAssuranceAssigneeLabel,
} from './assurance-labels';

/**
 * Modelo de lectura de tickets compartido por la pestaña Soporte, la Vista general y el
 * detalle (spec MOD05 pestaña Soporte §5.1, §5.2; D1, D2).
 */

const TERMINAL_STATUSES = new Set<TicketStatus>([TicketStatus.CLOSED, TicketStatus.CANCELLED]);

/** Cerrado o cancelado: el detalle deja de ofrecer acciones. */
export function isTerminalTicket(ticket: Pick<AssuranceTicket, 'status'>): boolean {
  return TERMINAL_STATUSES.has(ticket.status);
}

/** Cuenta como abierto en listas y conteos: ni resuelto, ni cerrado, ni cancelado (D1). */
export function needsAttention(ticket: Pick<AssuranceTicket, 'status'>): boolean {
  return ticket.status !== TicketStatus.RESOLVED && !isTerminalTicket(ticket);
}

type DeadlineFields = Pick<
  AssuranceTicket,
  'slaFirstResponseAt' | 'slaResolveByAt' | 'firstRespondedAt' | 'resolvedAt' | 'closedAt'
>;

/** Plazo pendiente más próximo (ms) o `null` si no hay ninguno. */
export function getTicketDeadline(ticket: DeadlineFields): number | null {
  const deadlines = [
    ticket.firstRespondedAt ? null : ticket.slaFirstResponseAt,
    ticket.resolvedAt || ticket.closedAt ? null : ticket.slaResolveByAt,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  return deadlines.length ? Math.min(...deadlines) : null;
}

export type TicketDeadlineState = 'overdue' | 'at_risk' | 'ok';

/** Vencido o en riesgo solo informa en tickets que requieren atención. */
export function getTicketDeadlineState(
  ticket: Pick<AssuranceTicket, 'status' | 'slaBreachStatus'>,
): TicketDeadlineState {
  if (!needsAttention(ticket)) return 'ok';
  switch (ticket.slaBreachStatus) {
    case SlaBreachStatus.RESOLUTION_BREACHED:
    case SlaBreachStatus.FIRST_RESPONSE_BREACHED:
      return 'overdue';
    case SlaBreachStatus.AT_RISK:
      return 'at_risk';
    default:
      return 'ok';
  }
}

const DEADLINE_RANK: Record<TicketDeadlineState, number> = { overdue: 0, at_risk: 1, ok: 2 };

const PRIORITY_RANK: Record<TicketPriority, number> = {
  [TicketPriority.CRITICAL]: 0,
  [TicketPriority.URGENT]: 1,
  [TicketPriority.HIGH]: 2,
  [TicketPriority.NORMAL]: 3,
  [TicketPriority.LOW]: 4,
};

function timeOf(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function closedMoment(ticket: AssuranceTicket): number {
  return timeOf(ticket.closedAt ?? ticket.resolvedAt ?? ticket.updatedAt);
}

/**
 * Abiertos primero: vencido > en riesgo → prioridad → plazo más próximo (sin plazo al
 * final) → más antiguo. Luego resueltos y cerrados, el más reciente primero.
 */
export function compareTickets(left: AssuranceTicket, right: AssuranceTicket): number {
  const leftOpen = needsAttention(left);
  const rightOpen = needsAttention(right);
  if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
  if (!leftOpen) return closedMoment(right) - closedMoment(left);

  const byDeadlineState =
    DEADLINE_RANK[getTicketDeadlineState(left)] - DEADLINE_RANK[getTicketDeadlineState(right)];
  if (byDeadlineState !== 0) return byDeadlineState;

  const byPriority = (PRIORITY_RANK[left.priority] ?? 5) - (PRIORITY_RANK[right.priority] ?? 5);
  if (byPriority !== 0) return byPriority;

  const leftDeadline = getTicketDeadline(left) ?? Number.POSITIVE_INFINITY;
  const rightDeadline = getTicketDeadline(right) ?? Number.POSITIVE_INFINITY;
  if (leftDeadline !== rightDeadline) return leftDeadline < rightDeadline ? -1 : 1;

  return timeOf(left.createdAt) - timeOf(right.createdAt);
}

/** Indicador de trabajo de campo de la fila (spec §4): paso 2 si el listado lo trae; si no, paso 1. */
export interface TicketFieldWork {
  kind: 'visit' | 'order';
  label: string;
}

const dayFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const timeFormatter = new Intl.DateTimeFormat('es-CO', {
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** «18 nov» (sin el «de» que pone es-CO). */
function formatShortDay(date: Date): string {
  const parts = dayFormatter.formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = (parts.find((part) => part.type === 'month')?.value ?? '').replace('.', '');
  return `${day} ${month}`.trim();
}

function isDatedVisit(visit: NonNullable<AssuranceTicket['activeVisit']>): boolean {
  const dated = visit.status === 'SCHEDULED' || visit.status === 'IN_EXECUTION';
  return dated && visit.windowKind === 'SCHEDULED' && Boolean(visit.windowStartAt);
}

/** «Visita 18 nov, 8:00–12:00»; solo con ventana agendada, si no «Visita por agendar». */
function formatVisitLabel(visit: NonNullable<AssuranceTicket['activeVisit']>): string {
  if (visit.status === 'REQUIRES_RESCHEDULE') return 'Visita por reagendar';
  if (!isDatedVisit(visit) || !visit.windowStartAt) return 'Visita por agendar';
  const start = new Date(visit.windowStartAt);
  const end = visit.windowEndAt ? new Date(visit.windowEndAt) : null;
  const range = end
    ? `${timeFormatter.format(start)}–${timeFormatter.format(end)}`
    : timeFormatter.format(start);
  return `Visita ${formatShortDay(start)}, ${range}`;
}

/**
 * Ventana de la visita del detalle (spec MOD10 §3 L): «18 nov, 8:00–12:00»; si es la ventana
 * pedida y no la agendada, «(solicitada)». Sin fecha, `null`.
 */
export function formatTicketVisitWindow(
  visit: NonNullable<AssuranceTicket['activeVisit']>,
): string | null {
  if (!visit.windowStartAt) return null;
  const start = new Date(visit.windowStartAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = visit.windowEndAt ? new Date(visit.windowEndAt) : null;
  const range =
    end && !Number.isNaN(end.getTime())
      ? `${timeFormatter.format(start)}–${timeFormatter.format(end)}`
      : timeFormatter.format(start);
  const label = `${formatShortDay(start)}, ${range}`;
  return visit.windowKind === 'REQUESTED' ? `${label} (solicitada)` : label;
}

export function getTicketFieldWork(
  ticket: Pick<AssuranceTicket, 'status' | 'fieldDecision' | 'workOrderId'> &
    Partial<Pick<AssuranceTicket, 'activeVisit' | 'executionOrder'>>,
): TicketFieldWork | null {
  // CA-16: una visita con fecha agendada se muestra con su fecha; la orden solo acompaña su número.
  if (ticket.activeVisit && isDatedVisit(ticket.activeVisit)) {
    const label = formatVisitLabel(ticket.activeVisit);
    return {
      kind: 'visit',
      label: ticket.executionOrder ? `${label} · ${ticket.executionOrder.number}` : label,
    };
  }
  if (ticket.executionOrder) {
    const status = EXECUTION_ORDER_STATUS_LABELS[ticket.executionOrder.status];
    return {
      kind: 'order',
      label: status
        ? `Orden ${ticket.executionOrder.number} · ${status}`
        : `Orden ${ticket.executionOrder.number}`,
    };
  }
  if (ticket.activeVisit) return { kind: 'visit', label: formatVisitLabel(ticket.activeVisit) };
  if (ticket.workOrderId) return { kind: 'order', label: 'Orden de trabajo vinculada' };
  if (
    ticket.status === TicketStatus.FIELD_SERVICE_REQUESTED ||
    ticket.fieldDecision === TicketFieldDecision.FIELD_SERVICE_REQUIRED
  ) {
    return { kind: 'visit', label: 'Visita solicitada' };
  }
  return null;
}

/**
 * Responsable de la fila (CA-4, CA-15). Con `assignedUserDisplayName` en la respuesta manda el API
 * (nulo con responsable = desactivado o inexistente); sin el campo, la lista de usuarios.
 */
export function getTicketAssigneeLabel(
  ticket: Pick<AssuranceTicket, 'assignedUserId'> &
    Partial<Pick<AssuranceTicket, 'assignedUserDisplayName'>>,
  user: InternalUser | null | undefined,
): string {
  if (ticket.assignedUserDisplayName !== undefined && ticket.assignedUserId) {
    return ticket.assignedUserDisplayName ?? ASSURANCE_UNAVAILABLE_ASSIGNEE_LABEL;
  }
  return getAssuranceAssigneeLabel(ticket.assignedUserId, user);
}
