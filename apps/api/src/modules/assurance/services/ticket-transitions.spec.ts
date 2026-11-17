import { AccessPermissionKey, TicketStatus, TicketType, UserRole } from '@iwana/shared';
import {
  allowedTicketTransitions,
  canChangeTicketStatus,
  isValidTicketTransition,
  needsPqrCompletionCheck,
  TICKET_STATUS_CHANGE_ROLES,
  VALID_TRANSITIONS,
} from './ticket-transitions';

const MANAGE = new Set<string>([AccessPermissionKey.ASSURANCE_TICKETS_MANAGE]);
const support = { sub: 'support-1', role: UserRole.SUPPORT };
const ticket = (
  status: TicketStatus,
  overrides: Partial<{ type: TicketType; assignedUserId: string | null }> = {},
) => ({
  status,
  type: TicketType.CUSTOMER_INCIDENT,
  assignedUserId: null,
  ...overrides,
});

describe('ticket-transitions — destinos de estado para quien consulta', () => {
  it('la tabla de destinos es la que el servidor admitía (H8), estado por estado', () => {
    expect(VALID_TRANSITIONS).toEqual({
      OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
      ASSIGNED: ['IN_PROGRESS', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'CANCELLED'],
      IN_PROGRESS: [
        'PENDING_CUSTOMER',
        'PENDING_INTERNAL',
        'FIELD_SERVICE_REQUESTED',
        'RESOLVED',
        'CANCELLED',
      ],
      PENDING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
      PENDING_INTERNAL: ['IN_PROGRESS', 'FIELD_SERVICE_REQUESTED', 'CANCELLED'],
      FIELD_SERVICE_REQUESTED: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
      RESOLVED: ['CLOSED', 'IN_PROGRESS'],
      CLOSED: [],
      CANCELLED: [],
    });
  });

  it.each(Object.values(TicketStatus))(
    'paridad con el PATCH desde %s: todo destino ofrecido lo acepta el servidor, y lo no ofrecido salvo «Visita técnica solicitada» lo rechaza',
    (from) => {
      const offered = allowedTicketTransitions(ticket(from), support, MANAGE, true).map(
        (item) => item.status,
      );
      for (const to of Object.values(TicketStatus)) {
        if (offered.includes(to)) {
          expect(isValidTicketTransition(from, to)).toBe(true);
        } else if (to !== TicketStatus.FIELD_SERVICE_REQUESTED) {
          expect(isValidTicketTransition(from, to)).toBe(false);
        }
      }
    },
  );

  it('nunca ofrece «Visita técnica solicitada» (D-API-1), aunque el PATCH aún la acepta', () => {
    for (const from of Object.values(TicketStatus)) {
      const offered = allowedTicketTransitions(ticket(from), support, MANAGE, true);
      expect(offered.map((item) => item.status)).not.toContain(
        TicketStatus.FIELD_SERVICE_REQUESTED,
      );
    }
    expect(
      isValidTicketTransition(TicketStatus.IN_PROGRESS, TicketStatus.FIELD_SERVICE_REQUESTED),
    ).toBe(true);
  });

  it('requiresNote solo en RESOLVED', () => {
    const offered = allowedTicketTransitions(
      ticket(TicketStatus.IN_PROGRESS),
      support,
      MANAGE,
      true,
    );
    expect(offered).toEqual([
      { status: 'PENDING_CUSTOMER', requiresNote: false, blockedReason: null },
      { status: 'PENDING_INTERNAL', requiresNote: false, blockedReason: null },
      { status: 'RESOLVED', requiresNote: true, blockedReason: null },
      { status: 'CANCELLED', requiresNote: false, blockedReason: null },
    ]);
  });

  it('vacío en estado terminal', () => {
    expect(allowedTicketTransitions(ticket(TicketStatus.CLOSED), support, MANAGE, true)).toEqual(
      [],
    );
    expect(allowedTicketTransitions(ticket(TicketStatus.CANCELLED), support, MANAGE, true)).toEqual(
      [],
    );
  });

  it('PQR incompleta: RESOLVED y CLOSED salen con PQR_RECORD_INCOMPLETE; el resto sin motivo', () => {
    const pqr = { type: TicketType.PQR };
    expect(
      allowedTicketTransitions(ticket(TicketStatus.PENDING_CUSTOMER, pqr), support, MANAGE, false),
    ).toEqual([
      { status: 'IN_PROGRESS', requiresNote: false, blockedReason: null },
      { status: 'RESOLVED', requiresNote: true, blockedReason: 'PQR_RECORD_INCOMPLETE' },
      { status: 'CANCELLED', requiresNote: false, blockedReason: null },
    ]);
    expect(
      allowedTicketTransitions(ticket(TicketStatus.RESOLVED, pqr), support, MANAGE, false)[0],
    ).toEqual({ status: 'CLOSED', requiresNote: false, blockedReason: 'PQR_RECORD_INCOMPLETE' });
    expect(
      allowedTicketTransitions(ticket(TicketStatus.RESOLVED, pqr), support, MANAGE, true)[0]
        ?.blockedReason,
    ).toBeNull();
  });

  it('el registro PQR se consulta solo si algún destino lo exige', () => {
    expect(needsPqrCompletionCheck(TicketType.PQR, TicketStatus.IN_PROGRESS)).toBe(true);
    expect(needsPqrCompletionCheck(TicketType.PQR, TicketStatus.OPEN)).toBe(false);
    expect(needsPqrCompletionCheck(TicketType.CUSTOMER_INCIDENT, TicketStatus.IN_PROGRESS)).toBe(
      false,
    );
  });

  describe('mismas guardas que el PATCH', () => {
    it('vacío sin assurance.tickets.manage', () => {
      expect(allowedTicketTransitions(ticket(TicketStatus.OPEN), support, new Set(), true)).toEqual(
        [],
      );
    });

    it('vacío para roles fuera del techo del PATCH, aun con el permiso', () => {
      for (const role of [UserRole.AUDITOR, UserRole.SALES, UserRole.ACCOUNTANT]) {
        expect(
          allowedTicketTransitions(ticket(TicketStatus.OPEN), { sub: 'x', role }, MANAGE, true),
        ).toEqual([]);
      }
    });

    it('técnico y contratista solo sobre el ticket que tienen asignado', () => {
      for (const role of [UserRole.TECHNICIAN, UserRole.CONTRACTOR]) {
        const actor = { sub: 'tech-1', role };
        expect(canChangeTicketStatus({ assignedUserId: 'otro' }, actor, MANAGE)).toBe(false);
        expect(canChangeTicketStatus({ assignedUserId: 'tech-1' }, actor, MANAGE)).toBe(true);
      }
    });

    it('el techo coincide con el decorador del PATCH', () => {
      expect([...TICKET_STATUS_CHANGE_ROLES]).toEqual([
        UserRole.ADMIN,
        UserRole.NOC,
        UserRole.SUPPORT,
        UserRole.TECHNICIAN,
        UserRole.CONTRACTOR,
      ]);
    });
  });
});
