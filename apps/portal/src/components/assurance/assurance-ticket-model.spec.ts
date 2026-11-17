import { SlaBreachStatus, TicketFieldDecision, TicketPriority, TicketStatus } from '@iwana/shared';
import type { AssuranceTicket } from '@/lib/api-client';
import {
  compareTickets,
  getTicketDeadline,
  getTicketDeadlineState,
  getTicketAssigneeLabel,
  getTicketFieldWork,
  isTerminalTicket,
  needsAttention,
} from './assurance-ticket-model';

function ticket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: overrides.id ?? 't',
    ticketNumber: 'TCK-1',
    status: TicketStatus.OPEN,
    priority: TicketPriority.NORMAL,
    slaFirstResponseAt: null,
    slaResolveByAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: SlaBreachStatus.OK,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  } as AssuranceTicket;
}

const ids = (list: AssuranceTicket[]) => [...list].sort(compareTickets).map((t) => t.id);

describe('predicados de estado (CA-6, D1)', () => {
  it.each([
    [TicketStatus.OPEN, false, true],
    [TicketStatus.IN_PROGRESS, false, true],
    [TicketStatus.RESOLVED, false, false],
    [TicketStatus.CLOSED, true, false],
    [TicketStatus.CANCELLED, true, false],
  ])('%s: terminal=%s, requiere atención=%s', (status, terminal, attention) => {
    expect(isTerminalTicket({ status })).toBe(terminal);
    expect(needsAttention({ status })).toBe(attention);
  });
});

describe('plazo', () => {
  it('toma el plazo pendiente más próximo y lo ignora si ya hubo respuesta o resolución', () => {
    const t = ticket({
      slaFirstResponseAt: '2026-11-02T10:00:00.000Z',
      slaResolveByAt: '2026-11-03T10:00:00.000Z',
    });
    expect(getTicketDeadline(t)).toBe(Date.parse('2026-11-02T10:00:00.000Z'));
    expect(getTicketDeadline({ ...t, firstRespondedAt: '2026-11-01T11:00:00.000Z' })).toBe(
      Date.parse('2026-11-03T10:00:00.000Z'),
    );
    expect(getTicketDeadline({ ...t, firstRespondedAt: 'x', resolvedAt: 'y' })).toBeNull();
  });

  it('deriva vencido y en riesgo de slaBreachStatus, solo en tickets que requieren atención', () => {
    expect(
      getTicketDeadlineState(ticket({ slaBreachStatus: SlaBreachStatus.RESOLUTION_BREACHED })),
    ).toBe('overdue');
    expect(
      getTicketDeadlineState(ticket({ slaBreachStatus: SlaBreachStatus.FIRST_RESPONSE_BREACHED })),
    ).toBe('overdue');
    expect(getTicketDeadlineState(ticket({ slaBreachStatus: SlaBreachStatus.AT_RISK }))).toBe(
      'at_risk',
    );
    expect(getTicketDeadlineState(ticket())).toBe('ok');
    expect(
      getTicketDeadlineState(
        ticket({
          status: TicketStatus.RESOLVED,
          slaBreachStatus: SlaBreachStatus.RESOLUTION_BREACHED,
        }),
      ),
    ).toBe('ok');
  });
});

describe('orden de abiertos (CA-5, D2)', () => {
  it('sin plazos, Crítica precede a Normal', () => {
    expect(
      ids([
        ticket({ id: 'normal', priority: TicketPriority.NORMAL }),
        ticket({ id: 'critica', priority: TicketPriority.CRITICAL }),
      ]),
    ).toEqual(['critica', 'normal']);
  });

  it('clave 1: vencido precede a en riesgo y en riesgo a cualquier otro, sin importar prioridad', () => {
    expect(
      ids([
        ticket({ id: 'critica', priority: TicketPriority.CRITICAL }),
        ticket({
          id: 'riesgo',
          priority: TicketPriority.LOW,
          slaBreachStatus: SlaBreachStatus.AT_RISK,
        }),
        ticket({
          id: 'vencido',
          priority: TicketPriority.LOW,
          slaBreachStatus: SlaBreachStatus.FIRST_RESPONSE_BREACHED,
        }),
      ]),
    ).toEqual(['vencido', 'riesgo', 'critica']);
  });

  it('clave 2: Crítica > Urgente > Alta > Normal > Baja aunque la menor tenga plazo más próximo', () => {
    expect(
      ids([
        ticket({
          id: 'baja',
          priority: TicketPriority.LOW,
          slaResolveByAt: '2026-11-02T00:00:00.000Z',
        }),
        ticket({ id: 'normal', priority: TicketPriority.NORMAL }),
        ticket({ id: 'alta', priority: TicketPriority.HIGH }),
        ticket({ id: 'urgente', priority: TicketPriority.URGENT }),
        ticket({ id: 'critica', priority: TicketPriority.CRITICAL }),
      ]),
    ).toEqual(['critica', 'urgente', 'alta', 'normal', 'baja']);
  });

  it('clave 3: plazo más próximo primero y sin plazo al final de su prioridad', () => {
    expect(
      ids([
        ticket({ id: 'sin-plazo' }),
        ticket({ id: 'lejano', slaResolveByAt: '2026-11-09T00:00:00.000Z' }),
        ticket({ id: 'proximo', slaResolveByAt: '2026-11-03T00:00:00.000Z' }),
      ]),
    ).toEqual(['proximo', 'lejano', 'sin-plazo']);
  });

  it('clave 4: a igualdad, el más antiguo primero', () => {
    expect(
      ids([
        ticket({ id: 'nuevo', createdAt: '2026-11-05T00:00:00.000Z' }),
        ticket({ id: 'viejo', createdAt: '2026-10-01T00:00:00.000Z' }),
      ]),
    ).toEqual(['viejo', 'nuevo']);
  });
});

describe('orden de cerrados', () => {
  it('los que requieren atención van antes; cerrados por closedAt ?? resolvedAt ?? updatedAt descendente', () => {
    expect(
      ids([
        ticket({
          id: 'cerrado-viejo',
          status: TicketStatus.CLOSED,
          closedAt: '2026-10-01T00:00:00.000Z',
        }),
        ticket({
          id: 'resuelto',
          status: TicketStatus.RESOLVED,
          resolvedAt: '2026-11-04T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        }),
        ticket({ id: 'abierto' }),
        ticket({
          id: 'cancelado',
          status: TicketStatus.CANCELLED,
          updatedAt: '2026-11-02T00:00:00.000Z',
        }),
      ]),
    ).toEqual(['abierto', 'resuelto', 'cancelado', 'cerrado-viejo']);
  });
});

describe('indicador de trabajo de campo, paso 1 (§4)', () => {
  it('sin visita ni orden no hay indicador', () => {
    expect(getTicketFieldWork(ticket())).toBeNull();
  });

  it('visita solicitada por estado o por decisión', () => {
    expect(getTicketFieldWork(ticket({ status: TicketStatus.FIELD_SERVICE_REQUESTED }))).toEqual({
      kind: 'visit',
      label: 'Visita solicitada',
    });
    expect(
      getTicketFieldWork(ticket({ fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED })),
    ).toEqual({ kind: 'visit', label: 'Visita solicitada' });
  });

  it('la orden vinculada prevalece sobre la visita solicitada', () => {
    expect(
      getTicketFieldWork(
        ticket({ status: TicketStatus.FIELD_SERVICE_REQUESTED, workOrderId: 'wo-1' }),
      ),
    ).toEqual({ kind: 'order', label: 'Orden de trabajo vinculada' });
  });
});

describe('indicador de trabajo de campo, paso 2 (§4, CA-16)', () => {
  const visit = (overrides: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    status: 'SCHEDULED',
    windowKind: 'SCHEDULED',
    windowStartAt: new Date(2026, 10, 18, 8, 0).toISOString(),
    windowEndAt: new Date(2026, 10, 18, 12, 0).toISOString(),
    scheduleEventId: null,
    ...overrides,
  });

  it('visita agendada: fecha y ventana', () => {
    expect(
      getTicketFieldWork(ticket({ activeVisit: visit() } as Partial<AssuranceTicket>)),
    ).toEqual({
      kind: 'visit',
      label: 'Visita 18 nov, 8:00–12:00',
    });
  });

  it('visita sin agenda (ventana pedida o sin ventana): «Visita por agendar»', () => {
    expect(
      getTicketFieldWork(
        ticket({ activeVisit: visit({ windowKind: 'REQUESTED' }) } as Partial<AssuranceTicket>),
      ),
    ).toEqual({ kind: 'visit', label: 'Visita por agendar' });
    expect(
      getTicketFieldWork(
        ticket({
          activeVisit: visit({ windowKind: null, windowStartAt: null, windowEndAt: null }),
        } as Partial<AssuranceTicket>),
      ),
    ).toEqual({ kind: 'visit', label: 'Visita por agendar' });
  });

  it('visita por reagendar con evento viejo: no muestra la fecha vencida (H1 contrato)', () => {
    expect(
      getTicketFieldWork(
        ticket({
          activeVisit: visit({ status: 'REQUIRES_RESCHEDULE' }),
        } as Partial<AssuranceTicket>),
      ),
    ).toEqual({ kind: 'visit', label: 'Visita por reagendar' });
    expect(
      getTicketFieldWork(
        ticket({ activeVisit: visit({ status: 'PENDING' }) } as Partial<AssuranceTicket>),
      ),
    ).toEqual({ kind: 'visit', label: 'Visita por agendar' });
  });

  it('visita agendada con orden: manda la fecha (CA-16) y acompaña el número de la orden', () => {
    expect(
      getTicketFieldWork(
        ticket({
          workOrderId: 'wo-1',
          activeVisit: visit(),
          executionOrder: {
            id: '22222222-2222-4222-8222-222222222222',
            number: 'OTE-20261117-001',
            status: 'IN_PROGRESS',
            result: null,
            closedAt: null,
          },
        } as Partial<AssuranceTicket>),
      ),
    ).toEqual({ kind: 'visit', label: 'Visita 18 nov, 8:00–12:00 · OTE-20261117-001' });
  });

  it('orden de ejecución sin visita fechada: número y estado, por encima del paso 1', () => {
    expect(
      getTicketFieldWork(
        ticket({
          workOrderId: 'wo-1',
          activeVisit: visit({
            status: 'READY_TO_SCHEDULE',
            windowKind: null,
            windowStartAt: null,
            windowEndAt: null,
          }),
          executionOrder: {
            id: '22222222-2222-4222-8222-222222222222',
            number: 'OTE-20261117-001',
            status: 'IN_PROGRESS',
            result: null,
            closedAt: null,
          },
        } as Partial<AssuranceTicket>),
      ),
    ).toEqual({ kind: 'order', label: 'Orden OTE-20261117-001 · En progreso' });
  });

  it('sin datos del paso 2 vuelve al paso 1', () => {
    expect(
      getTicketFieldWork(
        ticket({
          status: TicketStatus.FIELD_SERVICE_REQUESTED,
          activeVisit: null,
          executionOrder: null,
        } as Partial<AssuranceTicket>),
      ),
    ).toEqual({ kind: 'visit', label: 'Visita solicitada' });
  });
});

describe('responsable del listado (CA-15)', () => {
  it('usa el nombre del API sin lista de usuarios; nulo con responsable → no disponible', () => {
    expect(
      getTicketAssigneeLabel(
        ticket({
          assignedUserId: 'u-1',
          assignedUserDisplayName: 'Numa Patrón',
        } as Partial<AssuranceTicket>),
        null,
      ),
    ).toBe('Numa Patrón');
    expect(
      getTicketAssigneeLabel(
        ticket({
          assignedUserId: 'u-1',
          assignedUserDisplayName: null,
        } as Partial<AssuranceTicket>),
        { id: 'u-1', firstName: 'Usuario', lastName: 'Inactivo' } as never,
      ),
    ).toBe('Responsable no disponible');
    expect(
      getTicketAssigneeLabel(
        ticket({ assignedUserId: null, assignedUserDisplayName: null } as Partial<AssuranceTicket>),
        null,
      ),
    ).toBe('Sin asignar');
  });

  it('sin el campo (respuesta antigua) resuelve con la lista de usuarios', () => {
    expect(
      getTicketAssigneeLabel(ticket({ assignedUserId: 'u-1' }), {
        id: 'u-1',
        firstName: 'Numa',
        lastName: 'Patrón',
      } as never),
    ).toBe('Numa Patrón');
  });
});
