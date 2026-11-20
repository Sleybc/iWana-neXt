import {
  SUBSCRIBER_UPCOMING_VISIT_EVENT_STATUSES,
  SUBSCRIBER_UPCOMING_VISIT_REQUEST_STATUSES,
  SubscriberUpcomingVisitsResponseSchema,
} from './subscriber-upcoming-visits';
import { ScheduleEventStatus, VisitRequestStatus, WfmWorkType } from '../../enums/wfm';

const base = {
  key: 'REQUEST:6f1c2a7e-0b8d-4c1e-9f3a-1d2e3f4a5b6c',
  kind: 'REQUEST',
  id: '6f1c2a7e-0b8d-4c1e-9f3a-1d2e3f4a5b6c',
  visitRequestId: '6f1c2a7e-0b8d-4c1e-9f3a-1d2e3f4a5b6c',
  scheduleEventId: null,
  status: VisitRequestStatus.PENDING,
  workType: WfmWorkType.SUPPORT,
  scheduledAt: null,
  requestedWindowStartAt: null,
  address: null,
  origin: {
    type: 'TICKET',
    ticketId: '1d2e3f4a-0b8d-4c1e-9f3a-6f1c2a7e5b6c',
    ticketNumber: 'TCK-1',
    expedienteId: null,
    contractId: null,
  },
  createdAt: '2026-11-20T10:00:00.000Z',
};

describe('SubscriberUpcomingVisitsResponseSchema', () => {
  it('acepta una visita de ticket por agendar', () => {
    expect(
      SubscriberUpcomingVisitsResponseSchema.safeParse({
        items: [base],
        total: 1,
        truncated: false,
      }).success,
    ).toBe(true);
  });

  it('rechaza ticketId fuera de un origen TICKET y TICKET sin ticketId', () => {
    const contractWithTicket = { ...base, origin: { ...base.origin, type: 'CONTRACT' } };
    const ticketWithoutId = { ...base, origin: { ...base.origin, ticketId: null } };
    for (const item of [contractWithTicket, ticketWithoutId]) {
      expect(
        SubscriberUpcomingVisitsResponseSchema.safeParse({
          items: [item],
          total: 1,
          truncated: false,
        }).success,
      ).toBe(false);
    }
  });

  it('rechaza campos no declarados (contrato estricto)', () => {
    expect(
      SubscriberUpcomingVisitsResponseSchema.safeParse({
        items: [{ ...base, subscriberName: 'x' }],
        total: 1,
        truncated: false,
      }).success,
    ).toBe(false);
  });

  it('solo considera activos los estados abiertos', () => {
    expect(SUBSCRIBER_UPCOMING_VISIT_REQUEST_STATUSES).not.toContain(VisitRequestStatus.CLOSED);
    expect(SUBSCRIBER_UPCOMING_VISIT_REQUEST_STATUSES).not.toContain(VisitRequestStatus.CANCELLED);
    expect(SUBSCRIBER_UPCOMING_VISIT_EVENT_STATUSES).not.toContain(ScheduleEventStatus.COMPLETED);
    expect(SUBSCRIBER_UPCOMING_VISIT_EVENT_STATUSES).toContain(ScheduleEventStatus.DRAFT);
  });
});
