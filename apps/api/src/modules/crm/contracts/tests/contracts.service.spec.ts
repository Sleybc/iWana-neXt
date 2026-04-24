import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContractsService } from '../contracts.service';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Contract } from '../entities/contract.entity';

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

/** Factory de contrato mínimo para tests */
function buildContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'ctr-1',
    tenantId: 'ten-1',
    quoteId: null,
    subscriberId: 'sub-1',
    planId: 'plan-fibra-300',
    planSnapshotJson: { id: 'plan-fibra-300' },
    status: ContractStatus.DRAFT,
    alias: 'Servicio — Bogotá Cra 10',
    installationAddress: 'Cra 10 #23-45',
    installationCity: 'Bogotá',
    installationDepartment: 'Cundinamarca',
    installationPostalCode: '110111',
    installationNotes: null,
    customerSegment: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    paymentMethod: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    createdAt: new Date('2026-04-24T00:00:00Z'),
    updatedAt: new Date('2026-04-24T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as Contract;
}

describe('ContractsService', () => {
  let service: ContractsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContractsService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crea contrato con alias autogenerado cuando no se provee', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_e: unknown, data: Record<string, unknown>) => data,
            save: async (_e: unknown, data: Record<string, unknown>) => ({ ...data, id: 'ctr-1' }),
          },
        }),
      );

      const result = await service.create({
        subscriberId: 'sub-1',
        planId: 'plan-1',
        planSnapshotJson: {},
        installationCity: 'Medellín',
        installationAddress: 'Cll 50 #30-10',
      });

      expect(result.id).toBe('ctr-1');
      expect((result as unknown as Record<string, unknown>).alias).toMatch(/Servicio/);
    });

    it('usa el alias provisto cuando viene en el DTO', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_e: unknown, data: Record<string, unknown>) => data,
            save: async (_e: unknown, data: Record<string, unknown>) => ({ ...data, id: 'ctr-2' }),
          },
        }),
      );

      const result = await service.create({
        subscriberId: 'sub-1',
        planId: 'plan-1',
        planSnapshotJson: {},
        alias: 'Mi alias personalizado',
      });

      expect((result as unknown as Record<string, unknown>).alias).toBe('Mi alias personalizado');
    });

    it('persiste quoteId null cuando no se proporciona', async () => {
      let savedData: Record<string, unknown> = {};
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_e: unknown, data: Record<string, unknown>) => data,
            save: async (_e: unknown, data: Record<string, unknown>) => {
              savedData = data;
              return { ...data, id: 'ctr-3' };
            },
          },
        }),
      );

      await service.create({ subscriberId: 'sub-1', planId: 'p-1', planSnapshotJson: {} });

      expect(savedData.quoteId).toBeNull();
    });
  });

  // ── createFromExpediente ──────────────────────────────────────────────────

  describe('createFromExpediente', () => {
    it('lanza NotFoundException cuando el subscriber no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.createFromExpediente('sub-x', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException cuando el expediente no existe', async () => {
      const mockManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ id: 'sub-1', expedienteId: 'exp-1' }) // subscriber
          .mockResolvedValueOnce(null), // expediente no encontrado
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: mockManager }),
      );

      await expect(service.createFromExpediente('sub-1', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException cuando el expediente no tiene planId', async () => {
      const mockManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ id: 'sub-1', expedienteId: 'exp-1' })
          .mockResolvedValueOnce({ id: 'exp-1', interestedPlanId: null }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: mockManager }),
      );

      await expect(service.createFromExpediente('sub-1', {})).rejects.toThrow(BadRequestException);
    });

    it('crea contrato DRAFT con datos del expediente', async () => {
      const subscriber = {
        id: 'sub-1',
        expedienteId: 'exp-1',
        address: 'Cra 7',
        city: 'Bogotá',
        department: null,
        postalCode: null,
        customerSegment: 'RESIDENTIAL',
      };
      const expediente = {
        id: 'exp-1',
        interestedPlanId: 'plan-fibra-100',
        additionalProductIds: ['prod-1'],
        additionalServiceIds: [],
        paymentMethod: 'PSE',
        billingCycle: 'MONTHLY',
        fiscalName: null,
        address: 'Cra 7 #10-20',
        city: 'Bogotá',
        department: 'Cundinamarca',
        postalCode: '110010',
      };

      let savedEntity: Record<string, unknown> = {};
      const mockManager = {
        findOne: jest.fn().mockResolvedValueOnce(subscriber).mockResolvedValueOnce(expediente),
        create: (_e: unknown, data: Record<string, unknown>) => data,
        save: async (_e: unknown, data: Record<string, unknown>) => {
          savedEntity = data;
          return { ...data, id: 'ctr-4' };
        },
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: mockManager }),
      );

      const result = await service.createFromExpediente('sub-1', {});

      expect(result.id).toBe('ctr-4');
      expect(savedEntity.planId).toBe('plan-fibra-100');
      expect(savedEntity.status).toBe(ContractStatus.DRAFT);
      expect(savedEntity.paymentMethod).toBe('PSE');
      expect(Array.isArray(savedEntity.additionalProductIds)).toBe(true);
    });
  });

  // ── findAllBySubscriber ───────────────────────────────────────────────────

  describe('findAllBySubscriber', () => {
    it('retorna lista de contratos del subscriber', async () => {
      const contracts = [buildContract(), buildContract({ id: 'ctr-2' })];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { find: async () => contracts } }),
      );

      const result = await service.findAllBySubscriber('sub-1');

      expect(result).toHaveLength(2);
    });
  });

  // ── Transiciones de estado ────────────────────────────────────────────────

  describe('activate', () => {
    it('transiciona DRAFT → ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.DRAFT });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.activate('ctr-1');
      expect(result.status).toBe(ContractStatus.ACTIVE);
    });

    it('lanza ConflictException si el contrato no está en DRAFT', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(service.activate('ctr-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('suspend', () => {
    it('transiciona ACTIVE → SUSPENDED', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.suspend('ctr-1');
      expect(result.status).toBe(ContractStatus.SUSPENDED);
    });
  });

  describe('reactivate', () => {
    it('transiciona SUSPENDED → ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.SUSPENDED });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.reactivate('ctr-1');
      expect(result.status).toBe(ContractStatus.ACTIVE);
    });
  });

  describe('terminate', () => {
    it('transiciona ACTIVE → TERMINATED', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.terminate('ctr-1');
      expect(result.status).toBe(ContractStatus.TERMINATED);
    });

    it('transiciona SUSPENDED → TERMINATED', async () => {
      const contract = buildContract({ status: ContractStatus.SUSPENDED });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.terminate('ctr-1');
      expect(result.status).toBe(ContractStatus.TERMINATED);
    });
  });

  describe('archive', () => {
    it('transiciona TERMINATED → ARCHIVED', async () => {
      const contract = buildContract({ status: ContractStatus.TERMINATED });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.archive('ctr-1');
      expect(result.status).toBe(ContractStatus.ARCHIVED);
    });

    it('lanza ConflictException al intentar archivar contrato ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(service.archive('ctr-1')).rejects.toThrow(ConflictException);
    });

    it('ARCHIVED no puede transicionar a ningún estado (estado final)', async () => {
      const contract = buildContract({ status: ContractStatus.ARCHIVED });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      // archive desde ARCHIVED intenta ARCHIVED → ARCHIVED, no está permitido
      await expect(service.archive('ctr-1')).rejects.toThrow(ConflictException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('elimina (soft-delete) un contrato en DRAFT', async () => {
      const contract = buildContract({ status: ContractStatus.DRAFT });
      const softDeleteSpy = jest.fn().mockResolvedValue(undefined);

      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { softDelete: softDeleteSpy } }),
        );

      await expect(service.remove('ctr-1')).resolves.toBeUndefined();
      expect(softDeleteSpy).toHaveBeenCalledWith(expect.anything(), { id: 'ctr-1' });
    });

    it('lanza BadRequestException al intentar eliminar un contrato ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(service.remove('ctr-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('lanza ConflictException al intentar cambiar planSnapshotJson en contrato ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(
        service.update('ctr-1', { planSnapshotJson: { id: 'plan-nuevo' } }),
      ).rejects.toThrow(ConflictException);
    });

    it('actualiza alias sin problemas', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.update('ctr-1', { alias: 'Nuevo alias' });
      expect(result.alias).toBe('Nuevo alias');
    });
  });
});
