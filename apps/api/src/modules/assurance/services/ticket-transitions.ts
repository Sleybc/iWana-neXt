import {
  AccessPermissionKey,
  TicketStatus,
  TicketType,
  UserRole,
  type TicketAllowedTransition,
} from '@iwana/shared';

/** Destinos que admite el servidor desde cada estado (H8). */
export const VALID_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  [TicketStatus.OPEN]: [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.CANCELLED],
  [TicketStatus.ASSIGNED]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.PENDING_CUSTOMER,
    TicketStatus.PENDING_INTERNAL,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.PENDING_CUSTOMER,
    TicketStatus.PENDING_INTERNAL,
    TicketStatus.FIELD_SERVICE_REQUESTED,
    TicketStatus.RESOLVED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.PENDING_CUSTOMER]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.RESOLVED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.PENDING_INTERNAL]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.FIELD_SERVICE_REQUESTED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.FIELD_SERVICE_REQUESTED]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.RESOLVED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  [TicketStatus.CLOSED]: [],
  [TicketStatus.CANCELLED]: [],
};

/** Techo de roles de `PATCH /assurance/tickets/:id/status` (lo usa también el decorador). */
export const TICKET_STATUS_CHANGE_ROLES = [
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.TECHNICIAN,
  UserRole.CONTRACTOR,
] as const;

/** Roles que solo operan los tickets que tienen asignados. */
export const TICKET_OWNERSHIP_RESTRICTED_ROLES: readonly UserRole[] = [
  UserRole.TECHNICIAN,
  UserRole.CONTRACTOR,
];

/**
 * Destinos que el servidor acepta pero no se ofrecen (D-API-1, 2026-11-16): «Visita técnica
 * solicitada» se alcanza con «Solicitar visita», que crea la visita; el cambio directo no.
 */
export const TICKET_TRANSITIONS_NOT_OFFERED: readonly TicketStatus[] = [
  TicketStatus.FIELD_SERVICE_REQUESTED,
];

/** Los destinos que exigen registro PQR completo. */
const PQR_COMPLETION_TARGETS: readonly TicketStatus[] = [
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
];

/** Regla única de transición: la usan el `PATCH` y la lista de destinos del detalle. */
export function isValidTicketTransition(from: TicketStatus, to: TicketStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/** ¿Debe validarse el registro PQR antes de este cambio? */
export function requiresPqrCompletion(type: TicketType, to: TicketStatus): boolean {
  return type === TicketType.PQR && PQR_COMPLETION_TARGETS.includes(to);
}

/** ¿Algún destino ofrecido desde este estado exige comprobar el registro PQR? */
export function needsPqrCompletionCheck(type: TicketType, from: TicketStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).some((to) => requiresPqrCompletion(type, to));
}

/**
 * ¿Puede quien consulta cambiar el estado de este ticket? Mismas guardas que el `PATCH`:
 * techo de roles, permiso `assurance.tickets.manage` y propiedad para técnico o contratista.
 */
export function canChangeTicketStatus(
  ticket: { assignedUserId: string | null },
  actor: { sub: string; role: string },
  permissions: ReadonlySet<string>,
): boolean {
  if (!(TICKET_STATUS_CHANGE_ROLES as readonly string[]).includes(actor.role)) return false;
  if (!permissions.has(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)) return false;
  if (
    (TICKET_OWNERSHIP_RESTRICTED_ROLES as readonly string[]).includes(actor.role) &&
    ticket.assignedUserId !== actor.sub
  ) {
    return false;
  }
  return true;
}

/**
 * Lista de estados destino para quien consulta (spec §5). Nunca nula: vacía en estado
 * terminal o sin permiso. `requiresNote` solo en RESOLVED (`TransitionTicketSchema`).
 */
export function allowedTicketTransitions(
  ticket: { status: TicketStatus; type: TicketType; assignedUserId: string | null },
  actor: { sub: string; role: string },
  permissions: ReadonlySet<string>,
  pqrRecordComplete: boolean,
): TicketAllowedTransition[] {
  if (!canChangeTicketStatus(ticket, actor, permissions)) return [];
  return (VALID_TRANSITIONS[ticket.status] ?? [])
    .filter((status) => !TICKET_TRANSITIONS_NOT_OFFERED.includes(status))
    .map((status) => ({
      status,
      requiresNote: status === TicketStatus.RESOLVED,
      blockedReason:
        requiresPqrCompletion(ticket.type, status) && !pqrRecordComplete
          ? ('PQR_RECORD_INCOMPLETE' as const)
          : null,
    }));
}
