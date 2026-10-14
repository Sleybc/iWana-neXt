import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { PrivacyIncidentEntity } from '../entities/privacy-incident.entity';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { IncidentsService } from './incidents.service';

describe('IncidentsService A12', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('fija fecha civil y referencia externa en una sola escritura y audita sin PII', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T15:00:00.000Z'));
    const id = '10000000-0000-4000-8000-000000000001';
    const initial = {
      id,
      detectedAt: new Date('2026-10-12T15:00:00.000Z'),
      description: 'Detalle interno que no debe auditarse.',
      affectedCategories: ['IDENTIFICACION'],
      sicReportDueAt: '2026-11-03',
      reportedAt: null,
      externalReference: null,
    };
    const updated = { ...initial, reportedAt: '2026-10-13', externalReference: 'SIC-1842' };
    const repository = {
      findOne: jest.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(updated),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({ schemaName: 'tenant_test' } as never);
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new IncidentsService({} as never, auditService as never);

    await expect(
      service.report(id, { reportedAt: '2026-10-13', externalReference: 'SIC-1842' }, {
        sub: '20000000-0000-4000-8000-000000000001',
      } as never),
    ).resolves.toMatchObject({ reportedAt: '2026-10-13', externalReference: 'SIC-1842' });

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        reportedAt: expect.any(Object),
        externalReference: expect.any(Object),
      }),
      { reportedAt: '2026-10-13', externalReference: 'SIC-1842' },
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'PrivacyIncident', entityId: id }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('Detalle interno');
  });

  it('rechaza una fecha anterior a la detección o posterior al día civil actual', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T15:00:00.000Z'));
    const row = {
      id: '10000000-0000-4000-8000-000000000001',
      detectedAt: new Date('2026-10-12T15:00:00.000Z'),
      reportedAt: null,
      externalReference: null,
    };
    const repository = { findOne: jest.fn().mockResolvedValue(row), update: jest.fn() };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({ schemaName: 'tenant_test' } as never);
    const service = new IncidentsService({} as never, { log: jest.fn() } as never);

    await expect(
      service.report(row.id, { reportedAt: '2026-10-11', externalReference: 'SIC-1' }, {} as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.report(row.id, { reportedAt: '2026-10-15', externalReference: 'SIC-1' }, {} as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('responde conflicto cuando ya fue reportado', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        reportedAt: '2026-10-13',
        externalReference: 'SIC-1',
      } satisfies Partial<PrivacyIncidentEntity>),
      update: jest.fn(),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({ schemaName: 'tenant_test' } as never);
    const service = new IncidentsService({} as never, { log: jest.fn() } as never);

    await expect(
      service.report(
        '10000000-0000-4000-8000-000000000001',
        { reportedAt: '2026-10-14', externalReference: 'SIC-2' },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
