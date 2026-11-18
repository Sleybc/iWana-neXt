import { randomUUID } from 'node:crypto';
import {
  EXECUTION_ORDER_NUMBER_PATTERN,
  ExecutionOrderLookupQuerySchema,
  ExecutionOrderLookupResponseSchema,
  LINK_EXECUTION_ORDER_OUTCOMES,
  LinkExecutionOrderBodySchema,
  LinkExecutionOrderResponseSchema,
  TICKET_ACTIVE_VISIT_STATUSES,
  TICKET_PARTY_NAME_STATES,
  TicketDetailExtensionSchema,
  TicketPartyRefSchema,
} from './ticket-detail.contract';
import * as shared from '../../index';
import { VisitRequestStatus } from '../../enums/wfm';

const party = (overrides: Record<string, unknown> = {}) => ({
  type: 'SUBSCRIBER',
  refId: randomUUID(),
  displayName: 'Titular sintético',
  nameState: 'AVAILABLE',
  profile: { kind: 'SUBSCRIBER', id: randomUUID() },
  ...overrides,
});

const detail = (overrides: Record<string, unknown> = {}) => ({
  requester: party(),
  relatedTo: null,
  activeVisit: {
    id: randomUUID(),
    status: 'SCHEDULED',
    windowKind: 'SCHEDULED',
    windowStartAt: '2026-11-17T13:00:00.000Z',
    windowEndAt: '2026-11-17T15:00:00.000Z',
    scheduleEventId: randomUUID(),
  },
  executionOrder: {
    id: randomUUID(),
    number: 'OTE-20261116-001',
    status: 'COMPLETED',
    result: 'EXECUTED',
    closedAt: '2026-11-16T20:00:00.000Z',
  },
  executionOrderCount: 1,
  allowedTransitions: [{ status: 'RESOLVED', requiresNote: true, blockedReason: null }],
  ...overrides,
});

describe('ticket-detail.contract — MOD10 detalle del ticket, paso 2', () => {
  it('se exporta desde la raíz de @iwana/shared', () => {
    expect(shared.TicketDetailExtensionSchema).toBe(TicketDetailExtensionSchema);
    expect(shared.LinkExecutionOrderBodySchema).toBe(LinkExecutionOrderBodySchema);
  });

  it('acepta un detalle completo y uno sin visita, orden ni relacionado', () => {
    expect(TicketDetailExtensionSchema.safeParse(detail()).success).toBe(true);
    expect(
      TicketDetailExtensionSchema.safeParse(
        detail({
          activeVisit: null,
          executionOrder: null,
          executionOrderCount: 0,
          allowedTransitions: [],
        }),
      ).success,
    ).toBe(true);
  });

  it('rechaza campos que no son del contrato (datos del cliente de la orden)', () => {
    const withLabel = detail();
    (withLabel.executionOrder as Record<string, unknown>)['customerDisplayLabel'] = 'Fuga';
    expect(TicketDetailExtensionSchema.safeParse(withLabel).success).toBe(false);
  });

  it('allowedTransitions nunca es nulo', () => {
    expect(
      TicketDetailExtensionSchema.safeParse(detail({ allowedTransitions: null })).success,
    ).toBe(false);
  });

  it.each(TICKET_PARTY_NAME_STATES.filter((state) => state !== 'AVAILABLE'))(
    'solo AVAILABLE puede traer nombre (%s exige null)',
    (nameState) => {
      expect(TicketPartyRefSchema.safeParse(party({ nameState })).success).toBe(false);
      expect(TicketPartyRefSchema.safeParse(party({ nameState, displayName: null })).success).toBe(
        true,
      );
    },
  );

  it('número de orden exacto: normaliza mayúsculas y espacios, rechaza prefijos y comodines', () => {
    expect(ExecutionOrderLookupQuerySchema.parse({ number: ' ote-20261116-001 ' })).toEqual({
      number: 'OTE-20261116-001',
    });
    for (const number of [
      'OTE-2026',
      'OTE-20261116-%',
      'WO-20261116-001',
      'OTE-20261116-0012345',
    ]) {
      expect(ExecutionOrderLookupQuerySchema.safeParse({ number }).success).toBe(false);
    }
    expect(EXECUTION_ORDER_NUMBER_PATTERN.test('OTE-20261116-1000')).toBe(true);
    expect(
      ExecutionOrderLookupQuerySchema.safeParse({ number: 'OTE-20261116-001', q: 'x' }).success,
    ).toBe(false);
  });

  it('la respuesta de la búsqueda distingue NONE, THIS y OTHER', () => {
    const base = detail().executionOrder as Record<string, unknown>;
    for (const linkedTicket of ['NONE', 'THIS', 'OTHER']) {
      expect(ExecutionOrderLookupResponseSchema.safeParse({ ...base, linkedTicket }).success).toBe(
        true,
      );
    }
    expect(
      ExecutionOrderLookupResponseSchema.safeParse({ ...base, linkedTicket: 'X' }).success,
    ).toBe(false);
  });

  it('el vínculo manual exige el id de la orden de ejecución y limita la nota', () => {
    const executionOrderId = randomUUID();
    expect(LinkExecutionOrderBodySchema.safeParse({ executionOrderId }).success).toBe(true);
    expect(LinkExecutionOrderBodySchema.safeParse({ executionOrderId: 'OTE-1' }).success).toBe(
      false,
    );
    expect(
      LinkExecutionOrderBodySchema.safeParse({ executionOrderId, notes: 'x'.repeat(2001) }).success,
    ).toBe(false);
    expect(
      LinkExecutionOrderBodySchema.safeParse({ executionOrderId, workOrderId: randomUUID() })
        .success,
    ).toBe(false);
  });
  it('visita activa: solo estados no terminales; la lista y los terminales cubren el enum', () => {
    const terminal = [
      VisitRequestStatus.CLOSED,
      VisitRequestStatus.CANCELLED,
      VisitRequestStatus.REJECTED,
      VisitRequestStatus.EXPIRED,
    ];
    expect([...TICKET_ACTIVE_VISIT_STATUSES, ...terminal].sort()).toEqual(
      Object.values(VisitRequestStatus).sort(),
    );
    for (const status of terminal) {
      const visit = { ...(detail().activeVisit as Record<string, unknown>), status };
      expect(TicketDetailExtensionSchema.safeParse(detail({ activeVisit: visit })).success).toBe(
        false,
      );
    }
  });

  it('sin permiso de órdenes, orden y total llegan nulos (CA-12)', () => {
    expect(
      TicketDetailExtensionSchema.safeParse(
        detail({ activeVisit: null, executionOrder: null, executionOrderCount: null }),
      ).success,
    ).toBe(true);
  });

  it('la respuesta del vínculo trae la orden y LINKED o ALREADY_LINKED', () => {
    const base = detail().executionOrder as Record<string, unknown>;
    expect([...LINK_EXECUTION_ORDER_OUTCOMES]).toEqual(['LINKED', 'ALREADY_LINKED']);
    for (const outcome of LINK_EXECUTION_ORDER_OUTCOMES) {
      expect(LinkExecutionOrderResponseSchema.safeParse({ ...base, outcome }).success).toBe(true);
    }
    expect(LinkExecutionOrderResponseSchema.safeParse({ ...base, outcome: 'X' }).success).toBe(
      false,
    );
    expect(shared.LinkExecutionOrderResponseSchema).toBe(LinkExecutionOrderResponseSchema);
  });
});
