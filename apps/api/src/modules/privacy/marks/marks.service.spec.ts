import { TenantContext } from '@iwana/db';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { MarksService } from './marks.service';

const partyId = '70000000-0000-4000-8000-000000000001';
const requestId = '70000000-0000-4000-8000-000000000002';

describe('MarksService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('devuelve solo la última marca abierta de cada tipo', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        {
          id: '70000000-0000-4000-8000-000000000003',
          partyId,
          mark: 'RECLAMO_EN_TRAMITE',
          event: 'CLOSE',
          requestId,
          occurredAt: new Date('2026-10-14T15:00:00.000Z'),
        },
        {
          id: '70000000-0000-4000-8000-000000000004',
          partyId,
          mark: 'RECLAMO_EN_TRAMITE',
          event: 'OPEN',
          requestId,
          occurredAt: new Date('2026-10-13T15:00:00.000Z'),
        },
        {
          id: '70000000-0000-4000-8000-000000000005',
          partyId,
          mark: 'DATOS_BLOQUEADOS',
          event: 'OPEN',
          requestId,
          occurredAt: new Date('2026-10-12T15:00:00.000Z'),
        },
      ]),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ schemaName: 'tenant_privacy_test' } as never);
    const service = new MarksService({} as never);

    await expect(service.listForParty(partyId)).resolves.toEqual([
      {
        id: '70000000-0000-4000-8000-000000000005',
        partyId,
        mark: 'DATOS_BLOQUEADOS',
        event: 'OPEN',
        requestId,
        occurredAt: '2026-10-12T15:00:00.000Z',
      },
    ]);
    expect(repository.find).toHaveBeenCalledWith({
      where: { partyId },
      order: { occurredAt: 'DESC', id: 'DESC' },
    });
  });

  it('devuelve una lista vacía cuando no hay marcas', async () => {
    const repository = { find: jest.fn().mockResolvedValue([]) };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const service = new MarksService({} as never);
    await expect(service.listForParty(partyId)).resolves.toEqual([]);
  });
});
