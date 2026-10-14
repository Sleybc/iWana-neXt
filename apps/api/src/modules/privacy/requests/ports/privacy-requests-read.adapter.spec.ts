import { TenantContext } from '@iwana/db';
import * as tenantQuery from '../../ports/privacy-tenant-query';
import { PrivacyRequestsReadAdapter } from './privacy-requests-read.adapter';

const partyId = '75000000-0000-4000-8000-000000000001';

describe('PrivacyRequestsReadAdapter', () => {
  const manager = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    manager.query.mockReset().mockResolvedValue([]);
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ schemaName: 'tenant_privacy_test' } as never);
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T16:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('calcula vencimiento con extensión, estados cerrados y fechas string o Date', async () => {
    manager.query.mockResolvedValueOnce([
      {
        id: 'request-1',
        kind: 'CONSULTA',
        right: 'CONOCER',
        purpose: null,
        status: 'RADICADA',
        received_at: new Date('2026-10-01T17:00:00.000Z'),
        due_at: '2026-10-13',
        extended_until: '2026-10-20',
      },
      {
        id: 'request-2',
        kind: 'RECLAMO',
        right: 'ACTUALIZAR',
        purpose: null,
        status: 'RESUELTA',
        received_at: '2026-10-01T17:00:00.000Z',
        due_at: new Date('2026-10-10T17:00:00.000Z'),
        extended_until: '2026-10-09',
      },
      {
        id: 'request-3',
        kind: 'CONSULTA',
        right: 'CONOCER',
        purpose: null,
        status: 'EN_TRAMITE',
        received_at: '2026-10-01T17:00:00.000Z',
        due_at: '2026-10-13',
        extended_until: null,
      },
    ]);
    const adapter = new PrivacyRequestsReadAdapter({} as never);

    await expect(adapter.listForParty(partyId)).resolves.toMatchObject([
      {
        id: 'request-1',
        receivedAt: '2026-10-01T17:00:00.000Z',
        extendedUntil: '2026-10-20',
        isOverdue: false,
      },
      { id: 'request-2', dueAt: '2026-10-10', extendedUntil: '2026-10-09', isOverdue: false },
      { id: 'request-3', extendedUntil: null, isOverdue: true },
    ]);
  });

  it('responde una lista vacía sin proyectar datos', async () => {
    const adapter = new PrivacyRequestsReadAdapter({} as never);
    await expect(adapter.listForParty(partyId)).resolves.toEqual([]);
  });

  it('calcula conteos y normaliza resultados nulos del driver', async () => {
    const adapter = new PrivacyRequestsReadAdapter({} as never);
    manager.query.mockResolvedValueOnce([{ overdue: '3', due_soon: '2', overdue_tasks: '1' }]);
    await expect(adapter.dueCounts('2026-10-14')).resolves.toEqual({
      overdue: 3,
      dueSoon: 2,
      overdueTasks: 1,
    });

    manager.query.mockResolvedValueOnce([]);
    await expect(adapter.dueCounts('2026-10-14')).resolves.toEqual({
      overdue: 0,
      dueSoon: 0,
      overdueTasks: 0,
    });
  });
});
