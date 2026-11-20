import { TicketTimelineEventType, UserRole } from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Regla única de visibilidad de comentarios internos: la usan el detalle de comentarios, los
 * adjuntos y el resumen del listado (spec MOD05 Soporte vista dividida §3 F, CA-9 y CA-10).
 */
export const ROLES_RESTRICTED_FROM_INTERNAL_COMMENTS: readonly string[] = [
  UserRole.TECHNICIAN,
  UserRole.CONTRACTOR,
];

export function canSeeInternal(actor: Pick<JwtPayload, 'role'>): boolean {
  return !ROLES_RESTRICTED_FROM_INTERNAL_COMMENTS.includes(actor.role);
}

/**
 * Roles que gestionan la asignación (mismos de `POST tickets/:id/assign`). Solo ellos ven la nota
 * de una asignación o reasignación (spec MOD10 asignación visible §2 D; decisión del usuario
 * 2026-11-20: «solo gestión»).
 */
export const ROLES_ALLOWED_ASSIGNMENT_NOTE: readonly string[] = [
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
];

/**
 * Quita `payload.note` de los eventos de historial para quien no gestiona la asignación, salvo el
 * responsable de ESE evento (`payload.assignedUserId === actor.sub`): la nota va dirigida a él
 * (spec MOD10 asignación visible D5). Se decide por evento: un responsable anterior no ve las notas
 * de asignaciones posteriores a otra persona.
 */
const ASSIGNMENT_EVENT_TYPES: readonly string[] = [
  TicketTimelineEventType.ASSIGNED,
  TicketTimelineEventType.REASSIGNED,
];

export function redactAssignmentNotes<
  T extends { eventType: string; payload: Record<string, unknown> | null },
>(events: T[], actor: Pick<JwtPayload, 'role' | 'sub'>): T[] {
  if (ROLES_ALLOWED_ASSIGNMENT_NOTE.includes(actor.role)) return events;
  return events.map((event) => {
    if (!ASSIGNMENT_EVENT_TYPES.includes(event.eventType)) return event;
    if (!event.payload || !('note' in event.payload)) return event;
    if (actor.sub && event.payload.assignedUserId === actor.sub) return event;
    const { note: _note, ...payload } = event.payload;
    return { ...event, payload };
  });
}
