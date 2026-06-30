import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import { PlanCatalogReadPort } from '../../ports/plan-catalog-read.port';
import { ProspectsService } from '../prospects.service';
import { ProspectQuotesService } from '../quotes.service';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

describe('ProspectsService', () => {
  let service: ProspectsService;

  const planCatalogReadPortMock = {
    getActivePlans: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const quotesServiceMock = {
    createQuoteSnapshot: jest.fn().mockResolvedValue({ id: 'qt-1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 'ten-1', schemaName: 'tenant_test' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProspectsService,
        { provide: DataSource, useValue: {} },
        { provide: PlanCatalogReadPort, useValue: planCatalogReadPortMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: ProspectQuotesService, useValue: quotesServiceMock },
      ],
    }).compile();

    service = module.get<ProspectsService>(ProspectsService);
  });

  it('rejects installation scheduling when ticketId or workOrderId is missing', async () => {
    await expect(
      service.scheduleInstallation('pros-1', {
        planId: 'plan-1',
        ticketId: '',
        workOrderId: 'wo-1',
      }),
    ).rejects.toThrow('ticket');
  });

  it('records reschedule causes with commercial and technical traceability', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'pros-1',
            tenantId: 'ten-1',
            potentialId: 'pot-1',
            fullName: 'Camila Torres',
            address: 'Calle 123',
            selectedPlanId: 'plan-1',
            status: 'INSTALLATION_SCHEDULED',
            ticketId: 'tic-old',
            workOrderId: 'wo-old',
            executionPolicyRef: null,
            evidenceMode: null,
            conformityEvidenceRef: null,
            lastRescheduleReason: null,
            lastRescheduleNotes: null,
          }),
          save: async (_entity: unknown, data: Record<string, unknown>) => data,
        },
      }),
    );

    const result = await service.rescheduleInstallation('pros-1', {
      reason: 'USER_ABSENT',
      notes: 'Cliente no se encontraba en sitio',
      ticketId: 'tic-1',
      workOrderId: 'wo-1',
    });

    expect(result.status).toBe('RESCHEDULED');
    expect(result.lastRescheduleReason).toBe('USER_ABSENT');
  });

  it('schedules installation with plan snapshot and audit trail', async () => {
    planCatalogReadPortMock.getActivePlans.mockResolvedValue([
      {
        id: 'plan-1',
        name: 'Plan Hogar',
        technology: 'GPON',
        downloadSpeedMbps: 500,
        uploadSpeedMbps: 200,
        basePrice: 100000,
        installationFee: 50000,
        isActive: true,
      },
    ]);

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'pros-1',
            tenantId: 'ten-1',
            potentialId: 'pot-1',
            fullName: 'Camila Torres',
            address: 'Calle 123',
            selectedPlanId: 'plan-0',
            status: 'PROSPECT',
            ticketId: null,
            workOrderId: null,
            executionPolicyRef: null,
            evidenceMode: null,
            conformityEvidenceRef: null,
            lastRescheduleReason: null,
            lastRescheduleNotes: null,
          }),
          save: async (_entity: unknown, data: Record<string, unknown>) => data,
        },
      }),
    );

    const result = await service.scheduleInstallation('pros-1', {
      planId: 'plan-1',
      ticketId: 'tic-1',
      workOrderId: 'wo-1',
    });

    expect(result.status).toBe('INSTALLATION_SCHEDULED');
    expect(quotesServiceMock.createQuoteSnapshot).toHaveBeenCalled();
    expect(auditServiceMock.log).toHaveBeenCalled();
  });

  it('lanza BadRequestException cuando el plan no existe en scheduleInstallation', async () => {
    planCatalogReadPortMock.getActivePlans.mockResolvedValue([]);

    await expect(
      service.scheduleInstallation('pros-1', {
        planId: 'plan-inexistente',
        ticketId: 'tic-1',
        workOrderId: 'wo-1',
      }),
    ).rejects.toThrow('plan');
  });

  it('lanza NotFoundException cuando el prospecto no existe en scheduleInstallation', async () => {
    planCatalogReadPortMock.getActivePlans.mockResolvedValue([
      { id: 'plan-1', name: 'Plan', isActive: true },
    ]);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => null,
          save: async (_entity: unknown, data: Record<string, unknown>) => data,
        },
      }),
    );

    await expect(
      service.scheduleInstallation('pros-inexistente', {
        planId: 'plan-1',
        ticketId: 'tic-1',
        workOrderId: 'wo-1',
      }),
    ).rejects.toThrow('no encontrado');
  });

  it('lanza NotFoundException cuando el prospecto no existe en rescheduleInstallation', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => null,
          save: async (_entity: unknown, data: Record<string, unknown>) => data,
        },
      }),
    );

    await expect(
      service.rescheduleInstallation('pros-inexistente', {
        reason: 'WEATHER',
        notes: 'Lluvia intensa',
        ticketId: 'tic-1',
        workOrderId: 'wo-1',
      }),
    ).rejects.toThrow('no encontrado');
  });

  it('markTechVisitStarted actualiza estado a TECH_VISIT', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'pros-1',
            tenantId: 'ten-1',
            potentialId: 'pot-1',
            fullName: 'Camila Torres',
            address: 'Calle 123',
            selectedPlanId: 'plan-1',
            status: 'INSTALLATION_SCHEDULED',
            ticketId: 'tic-old',
            workOrderId: 'wo-old',
            executionPolicyRef: null,
            evidenceMode: null,
            conformityEvidenceRef: null,
            lastRescheduleReason: null,
            lastRescheduleNotes: null,
          }),
          save: async (_entity: unknown, data: Record<string, unknown>) => data,
        },
      }),
    );

    const result = await service.markTechVisitStarted('pros-1', {
      ticketId: 'tic-1',
      workOrderId: 'wo-1',
    });

    expect(result.status).toBe('TECH_VISIT');
  });

  it('markTechVisitStarted lanza NotFoundException si el prospecto no existe', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => null,
          save: async (_entity: unknown, data: Record<string, unknown>) => data,
        },
      }),
    );

    await expect(
      service.markTechVisitStarted('pros-inexistente', {
        ticketId: 'tic-1',
        workOrderId: 'wo-1',
      }),
    ).rejects.toThrow('no encontrado');
  });
});
