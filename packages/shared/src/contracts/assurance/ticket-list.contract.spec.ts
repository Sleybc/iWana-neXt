import { randomUUID } from 'node:crypto';
import {
  ListTicketsOrderSchema,
  TICKET_LIST_ORDERS,
  TicketListItemExtensionSchema,
} from './ticket-list.contract';
import * as shared from '../../index';

const item = (overrides: Record<string, unknown> = {}) => ({
  assignedUserDisplayName: 'Ana Pérez',
  activeVisit: {
    id: randomUUID(),
    status: 'SCHEDULED',
    windowKind: 'SCHEDULED',
    windowStartAt: '2026-11-18T13:00:00.000Z',
    windowEndAt: '2026-11-18T17:00:00.000Z',
    scheduleEventId: randomUUID(),
  },
  executionOrder: {
    id: randomUUID(),
    number: 'OTE-20261117-001',
    status: 'IN_PROGRESS',
    result: null,
    closedAt: null,
  },
  ...overrides,
});

describe('ticket-list.contract (spec MOD05 pestaña Soporte §16 B-1 a B-3)', () => {
  it('acepta una fila completa y una sin responsable ni trabajo de campo', () => {
    expect(TicketListItemExtensionSchema.safeParse(item()).success).toBe(true);
    expect(
      TicketListItemExtensionSchema.safeParse({
        assignedUserDisplayName: null,
        activeVisit: null,
        executionOrder: null,
      }).success,
    ).toBe(true);
  });

  it('acepta una visita por agendar (sin ventana)', () => {
    const parsed = TicketListItemExtensionSchema.safeParse(
      item({
        activeVisit: {
          id: randomUUID(),
          status: 'READY_TO_SCHEDULE',
          windowKind: null,
          windowStartAt: null,
          windowEndAt: null,
          scheduleEventId: null,
        },
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rechaza campos extra (nunca correo ni otros datos del usuario)', () => {
    expect(TicketListItemExtensionSchema.safeParse(item({ assignedUserEmail: 'x' })).success).toBe(
      false,
    );
  });

  it('exige los tres campos aunque sean nulos', () => {
    const { executionOrder: _omit, ...rest } = item();
    expect(TicketListItemExtensionSchema.safeParse(rest).success).toBe(false);
  });

  it('el orden admite recent y urgency, recent por defecto', () => {
    expect(TICKET_LIST_ORDERS).toEqual(['recent', 'urgency']);
    expect(ListTicketsOrderSchema.parse(undefined)).toBe('recent');
    expect(ListTicketsOrderSchema.parse('urgency')).toBe('urgency');
    expect(ListTicketsOrderSchema.safeParse('priority').success).toBe(false);
  });

  it('se exporta desde la raíz de @iwana/shared', () => {
    expect(shared.TicketListItemExtensionSchema).toBe(TicketListItemExtensionSchema);
    expect(shared.TICKET_LIST_ORDERS).toBe(TICKET_LIST_ORDERS);
  });
});
