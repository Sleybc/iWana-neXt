import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { PrivacyIncidentEntity } from '../entities/privacy-incident.entity';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { IncidentsService, sicReportDueDate } from './incidents.service';

const id = '78000000-0000-4000-8000-000000000001';
const actorId = '78000000-0000-4000-8000-000000000002';

function incident(overrides: Partial<PrivacyIncidentEntity> = {}): PrivacyIncidentEntity {
  return {
    id,
    detectedAt: new Date('2026-10-12T15:00:00.000Z'),
    description: 'Descripción sintética.',
    affectedCategories: ['IDENTIFICACION'],
    sicReportDueAt: '2026-11-03',
    reportedAt: null,
    externalReference: null,
    actorId,
    ...overrides,
  } as PrivacyIncidentEntity;
}

describe('IncidentsService — cobertura de ciclo de vida', () => {
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((input: Partial<PrivacyIncidentEntity>) => input),
    save: jest.fn(),
    update: jest.fn(),
  };
  const manager = { getRepository: jest.fn(() => repository) };
  const audit = { log: jest.fn() };
  let service: IncidentsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T15:00:00.000Z'));
    jest.clearAllMocks();
    repository.find.mockReset().mockResolvedValue([]);
    repository.findOne.mockReset();
    repository.create.mockReset().mockImplementation((input) => input);
    repository.save.mockReset();
    repository.update.mockReset();
    audit.log.mockReset().mockResolvedValue(undefined);
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ schemaName: 'tenant_privacy_test' } as never);
    service = new IncidentsService({} as never, audit as unknown as AuditService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('lista los incidentes de más reciente a más antiguo', async () => {
    repository.find.mockResolvedValue([incident()]);
    await expect(service.list()).resolves.toEqual([
      {
        id,
        detectedAt: '2026-10-12T15:00:00.000Z',
        description: 'Descripción sintética.',
        affectedCategories: ['IDENTIFICACION'],
        sicReportDueAt: '2026-11-03',
        reportedAt: null,
        externalReference: null,
      },
    ]);
    expect(repository.find).toHaveBeenCalledWith({ order: { detectedAt: 'DESC', id: 'DESC' } });
  });

  it('calcula 15 días hábiles desde Bogotá al registrar y audita sin la descripción', async () => {
    const saved = incident({ id, detectedAt: new Date('2026-10-14T15:00:00.000Z') });
    repository.save.mockResolvedValue(saved);
    const description = 'Detalle sintético que no debe llegar a auditoría.';

    await expect(
      service.create(
        { description, affectedCategories: ['IDENTIFICACION'] } as never,
        {
          sub: actorId,
        } as never,
      ),
    ).resolves.toMatchObject({ id, reportedAt: null, externalReference: null });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        detectedAt: expect.any(Date),
        description,
        reportedAt: null,
        externalReference: null,
        actorId,
      }),
    );
    expect(audit.log).toHaveBeenCalledWith({
      action: AuditAction.CREATE,
      entityType: 'PrivacyIncident',
      entityId: id,
    });
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(description);
  });

  it('cubre la fecha límite SIC al cruzar un festivo colombiano', () => {
    expect(sicReportDueDate(new Date('2026-07-01T15:00:00.000Z'))).toBe('2026-07-24');
  });

  it('detecta que el incidente desapareció antes o durante el reporte', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.report(
        id,
        { reportedAt: '2026-10-14', externalReference: 'SIC-SINTETICO' } as never,
        {
          sub: actorId,
        } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    repository.findOne.mockResolvedValueOnce(incident());
    repository.update.mockResolvedValueOnce({ affected: 1 });
    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.report(
        id,
        { reportedAt: '2026-10-14', externalReference: 'SIC-SINTETICO' } as never,
        {
          sub: actorId,
        } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resuelve la colisión concurrente como ya reportado o como ausencia confirmada', async () => {
    repository.findOne.mockResolvedValueOnce(incident());
    repository.update.mockResolvedValueOnce({ affected: 0 });
    repository.findOne.mockResolvedValueOnce(incident({ reportedAt: '2026-10-14' }));
    await expect(
      service.report(
        id,
        { reportedAt: '2026-10-14', externalReference: 'SIC-SINTETICO' } as never,
        {
          sub: actorId,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    repository.findOne.mockReset().mockResolvedValueOnce(incident());
    repository.update.mockResolvedValueOnce({ affected: 0 });
    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.report(
        id,
        { reportedAt: '2026-10-14', externalReference: 'SIC-SINTETICO' } as never,
        {
          sub: actorId,
        } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
