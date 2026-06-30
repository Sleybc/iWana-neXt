import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CoverageReadPort } from '../../ports/coverage-read.port';
import { PlanCatalogReadPort } from '../../ports/plan-catalog-read.port';
import { AuditService } from '../../../audit/audit.service';
import { PotentialsService } from '../potentials.service';

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

describe('PotentialsService', () => {
  let service: PotentialsService;

  const coverageReadPortMock = {
    checkAvailability: jest.fn(),
  };

  const planCatalogReadPortMock = {
    getActivePlans: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 'ten-1', schemaName: 'tenant_test' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PotentialsService,
        { provide: DataSource, useValue: {} },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('0'.repeat(64)) },
        },
        { provide: CoverageReadPort, useValue: coverageReadPortMock },
        { provide: PlanCatalogReadPort, useValue: planCatalogReadPortMock },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    service = module.get<PotentialsService>(PotentialsService);
  });

  it('crea potencial con qualified en false', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({
            ...data,
            id: 'pot-1',
            createdAt: new Date('2026-03-22T00:00:00Z'),
            updatedAt: new Date('2026-03-22T00:00:00Z'),
          }),
        },
      }),
    );

    const created = await service.create({ fullName: 'Camila Torres', source: 'Web' });

    expect(created.id).toBe('pot-1');
    expect(created.qualified).toBe(false);
    expect(auditServiceMock.log).toHaveBeenCalled();
  });

  it('califica un potencial a prospecto solo con cobertura y plan elegible', async () => {
    coverageReadPortMock.checkAvailability.mockResolvedValue({
      available: true,
      nodes: [{ id: 'node-1', name: 'Nodo 1', type: 'NODE', available: true }],
    });
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

    let saveCount = 0;
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'pot-1',
            tenantId: 'ten-1',
            fullName: 'Camila Torres',
            source: 'Web',
            notes: null,
            qualified: false,
          }),
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => {
            saveCount += 1;
            if (saveCount === 1) {
              return { ...data, updatedAt: new Date() };
            }

            return {
              ...data,
              id: saveCount === 2 ? 'pros-1' : 'cons-1',
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        },
      }),
    );

    const result = await service.qualify('pot-1', {
      address: 'Calle 123',
      planId: 'plan-1',
      consentAccepted: true,
      consentChannel: 'WEB',
      legalTextVersion: 'v1',
    });

    expect(result.id).toBe('pros-1');
    expect(result.status).toBe('PROSPECT');
    expect(result.selectedPlanId).toBe('plan-1');
  });

  it('lanza BadRequestException cuando no hay cobertura disponible', async () => {
    coverageReadPortMock.checkAvailability.mockResolvedValue({ available: false, nodes: [] });
    planCatalogReadPortMock.getActivePlans.mockResolvedValue([
      { id: 'plan-1', name: 'Plan', isActive: true },
    ]);

    await expect(
      service.qualify('pot-1', {
        address: 'Calle 123',
        planId: 'plan-1',
        consentAccepted: true,
        consentChannel: 'WEB',
        legalTextVersion: 'v1',
      }),
    ).rejects.toThrow('La calificacion requiere cobertura disponible y un plan elegible.');
  });

  it('lanza BadRequestException cuando el plan no existe', async () => {
    coverageReadPortMock.checkAvailability.mockResolvedValue({
      available: true,
      nodes: [{ id: 'node-1', name: 'Nodo 1', type: 'NODE', available: true }],
    });
    planCatalogReadPortMock.getActivePlans.mockResolvedValue([]);

    await expect(
      service.qualify('pot-1', {
        address: 'Calle 123',
        planId: 'plan-inexistente',
        consentAccepted: true,
        consentChannel: 'WEB',
        legalTextVersion: 'v1',
      }),
    ).rejects.toThrow('La calificacion requiere cobertura disponible y un plan elegible.');
  });

  it('lanza NotFoundException cuando el potencial no existe', async () => {
    coverageReadPortMock.checkAvailability.mockResolvedValue({
      available: true,
      nodes: [{ id: 'node-1', name: 'Nodo 1', type: 'NODE', available: true }],
    });
    planCatalogReadPortMock.getActivePlans.mockResolvedValue([
      { id: 'plan-1', name: 'Plan', isActive: true },
    ]);

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => null,
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({
            ...data,
            id: 'pros-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      }),
    );

    await expect(
      service.qualify('pot-inexistente', {
        address: 'Calle 123',
        planId: 'plan-1',
        consentAccepted: true,
        consentChannel: 'WEB',
        legalTextVersion: 'v1',
      }),
    ).rejects.toThrow('Potencial pot-inexistente no encontrado.');
  });

  it('findAll devuelve la lista de potenciales', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          find: async () => [
            {
              id: 'pot-1',
              tenantId: 'ten-1',
              fullName: 'Camila Torres',
              emailEncrypted: null,
              phoneEncrypted: null,
              source: 'Web',
              notes: null,
              qualified: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      }),
    );

    const result = await service.findAll();
    expect(result).toHaveLength(1);
    expect(result[0]!.fullName).toBe('Camila Torres');
    expect(result[0]!.qualified).toBe(false);
  });
});
