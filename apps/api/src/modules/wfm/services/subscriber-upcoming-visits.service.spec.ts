import { ForbiddenException } from '@nestjs/common';
import { ScheduleEventStatus, UserRole, WfmWorkType } from '@iwana/shared';
import type { SubscriberUpcomingVisitItem } from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  buildOrigin,
  sortUpcomingVisits,
  SubscriberUpcomingVisitsService,
} from './subscriber-upcoming-visits.service';

const item = (key: string, scheduledAt: string | null, createdAt: string) =>
  ({
    key,
    kind: 'EVENT',
    id: key,
    visitRequestId: null,
    scheduleEventId: null,
    status: ScheduleEventStatus.DRAFT,
    workType: WfmWorkType.SUPPORT,
    scheduledAt,
    requestedWindowStartAt: null,
    address: null,
    origin: buildOrigin(null, null, null, new Map()),
    createdAt,
  }) as SubscriberUpcomingVisitItem;

describe('SubscriberUpcomingVisitsService (unidad)', () => {
  it('origen: ticket > oportunidad > contrato > ninguno; número solo si el ticket es del suscriptor', () => {
    const numbers = new Map([['t-1', 'TCK-1']]);
    expect(buildOrigin('t-1', 'e-1', 'c-1', numbers)).toEqual({
      type: 'TICKET',
      ticketId: 't-1',
      ticketNumber: 'TCK-1',
      expedienteId: 'e-1',
      contractId: 'c-1',
    });
    expect(buildOrigin('t-x', null, null, numbers).ticketNumber).toBeNull();
    expect(buildOrigin(null, 'e-1', 'c-1', numbers).type).toBe('OPPORTUNITY');
    expect(buildOrigin(null, null, 'c-1', numbers).type).toBe('CONTRACT');
    expect(buildOrigin('', null, null, numbers)).toMatchObject({ type: 'NONE', ticketId: null });
  });

  it('ordena por agendar primero (recientes antes) y luego por fecha ascendente', () => {
    const sorted = sortUpcomingVisits([
      item('b', '2099-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
      item('old', null, '2026-01-01T00:00:00.000Z'),
      item('a', '2099-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
      item('new', null, '2026-02-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((entry) => entry.key)).toEqual(['new', 'old', 'a', 'b']);
  });

  it.each([UserRole.TECHNICIAN, UserRole.CONTRACTOR])(
    'rechaza %s antes de consultar puertos o base',
    async (role) => {
      const crm = { findExpedienteId: jest.fn(), listContractIds: jest.fn() };
      const service = new SubscriberUpcomingVisitsService(
        {} as never,
        crm as never,
        { listSubscriberTicketRefs: jest.fn() } as never,
      );
      await expect(service.list('s', { role } as JwtPayload)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(crm.findExpedienteId).not.toHaveBeenCalled();
    },
  );
});
