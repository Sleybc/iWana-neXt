import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { ResponsibilitiesService } from '../responsibilities.service';
import { OperationalResponsibilityHistory } from '../entities/operational-responsibility-history.entity';
import { ExpedienteRecord } from '../../expedientes/entities/expediente-record.entity';

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

describe('ResponsibilitiesService', () => {
  let service: ResponsibilitiesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ResponsibilitiesService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<ResponsibilitiesService>(ResponsibilitiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getResponsibility', () => {
    it('returns responsibility with readable name/role when user exists', async () => {
      const expediente = buildExpediente({
        id: 'exp-1',
        currentResponsibleUserId: 'user-responsible',
        currentResponsibleAssignedAt: new Date('2026-03-01T10:00:00Z'),
      });

      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => expediente,
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => ({
                id: 'user-responsible',
                firstName: 'Laura',
                lastName: 'Pérez',
                email: 'laura@tenant.test',
                role: 'ASESOR_COMERCIAL',
              }),
            },
          }),
        );

      const result = await service.getResponsibility('exp-1');

      expect(result.currentResponsibleUserId).toBe('user-responsible');
      expect(result.currentResponsible.name).toBe('Laura Pérez');
      expect(result.currentResponsible.role).toBe('ASESOR_COMERCIAL');
    });

    it('throws NotFoundException when expediente does not exist', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => null,
          },
        }),
      );

      await expect(service.getResponsibility('exp-nonexistent')).rejects.toThrow(
        'Expediente exp-nonexistent no encontrado',
      );
    });
  });

  describe('updateResponsibility', () => {
    it('creates operational history entry when updating responsibility', async () => {
      const expediente = buildExpediente({
        id: 'exp-2',
        currentResponsibleUserId: 'user-old',
      });

      const savedHistoryEntries: unknown[] = [];
      let savedExpediente: unknown;

      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => expediente,
              save: async (entity: unknown, data: Record<string, unknown>) => {
                if (entity === ExpedienteRecord) {
                  savedExpediente = data;
                  return data;
                }
                if (entity === OperationalResponsibilityHistory) {
                  savedHistoryEntries.push(data);
                  return { id: 'history-1', ...data };
                }
                return data;
              },
              create: (_entity: unknown, data: Record<string, unknown>) => data,
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => ({
                ...expediente,
                currentResponsibleUserId: 'user-new',
              }),
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => ({
                id: 'user-new',
                firstName: 'Carlos',
                lastName: 'Mejía',
                email: 'carlos@tenant.test',
                role: 'ASESOR_COMERCIAL',
              }),
            },
          }),
        );

      const result = await service.updateResponsibility(
        'exp-2',
        { responsibleUserId: 'user-new', notes: 'Transferencia de caso' },
        'actor-user',
      );

      expect(savedHistoryEntries).toHaveLength(1);
      expect(savedHistoryEntries[0]).toEqual(
        expect.objectContaining({
          tenantId: 'ten-1',
          expedienteId: 'exp-2',
          previousResponsibleUserId: 'user-old',
          newResponsibleUserId: 'user-new',
          changedBy: 'actor-user',
          notes: 'Transferencia de caso',
        }),
      );
    });

    it('does NOT modify sales_attributions when updating responsibility', async () => {
      const expediente = buildExpediente({
        id: 'exp-3',
        currentResponsibleUserId: null,
      });

      const managerCalls: string[] = [];

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => expediente,
            save: async (entity: unknown) => {
              managerCalls.push((entity as { name?: string }).name ?? String(entity));
              return entity;
            },
            create: (_entity: unknown, data: Record<string, unknown>) => data,
          },
        }),
      );

      await service.updateResponsibility('exp-3', { responsibleUserId: 'user-new' }, 'actor-user');

      expect(managerCalls).not.toContain('SalesAttribution');
      expect(managerCalls.filter((c) => c.includes('attribution'))).toHaveLength(0);
    });
  });

  describe('getResponsibilityHistory', () => {
    it('returns only operational history items from OperationalResponsibilityHistory', async () => {
      const historyItems = [
        {
          id: 'hist-1',
          tenantId: 'ten-1',
          expedienteId: 'exp-1',
          previousResponsibleUserId: 'user-old',
          newResponsibleUserId: 'user-new',
          changedBy: 'actor-1',
          changedAt: new Date('2026-03-01T10:00:00Z'),
          notes: 'Primera asignación',
        },
        {
          id: 'hist-2',
          tenantId: 'ten-1',
          expedienteId: 'exp-1',
          previousResponsibleUserId: 'user-new',
          newResponsibleUserId: 'user-third',
          changedBy: 'actor-2',
          changedAt: new Date('2026-03-02T14:00:00Z'),
          notes: null,
        },
      ];

      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => buildExpediente({ id: 'exp-1' }),
              findAndCount: async () => [historyItems, 2],
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              find: async () => [
                {
                  id: 'user-old',
                  firstName: 'Ana',
                  lastName: 'Torres',
                  email: 'ana@test.com',
                  role: 'ASESOR',
                },
                {
                  id: 'user-new',
                  firstName: 'Luis',
                  lastName: 'García',
                  email: 'luis@test.com',
                  role: 'COORDINADOR',
                },
                {
                  id: 'user-third',
                  firstName: 'María',
                  lastName: 'López',
                  email: 'maria@test.com',
                  role: 'ASESOR',
                },
                {
                  id: 'actor-1',
                  firstName: 'Carlos',
                  lastName: 'Ruiz',
                  email: 'carlos@test.com',
                  role: 'ADMIN',
                },
                {
                  id: 'actor-2',
                  firstName: 'Laura',
                  lastName: 'Díaz',
                  email: 'laura@test.com',
                  role: 'ADMIN',
                },
              ],
            },
          }),
        );

      const result = await service.getResponsibilityHistory('exp-1', 1, 20);

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      const firstItem = result.data[0]!;
      expect(firstItem.previousResponsible?.name).toBe('Ana Torres');
      expect(firstItem.newResponsible?.name).toBe('Luis García');
      expect(firstItem.changedByActor?.name).toBe('Carlos Ruiz');
    });

    it('returns empty when no history exists', async () => {
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => buildExpediente({ id: 'exp-empty' }),
              findAndCount: async () => [[], 0],
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              find: async () => [],
            },
          }),
        );

      const result = await service.getResponsibilityHistory('exp-empty', 1, 20);

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });
  });
});

function buildExpediente(overrides: Partial<ExpedienteRecord> = {}): ExpedienteRecord {
  return {
    id: 'exp-base',
    tenantId: 'ten-1',
    currentResponsibleUserId: null,
    currentResponsibleAssignedAt: null,
    status: 'NUEVO_POTENCIAL' as any,
    fullName: 'Cliente Demo',
    createdBy: 'user-base',
    assignedTo: null,
    completenessCommercial: 0,
    completenessLegal: 0,
    completenessTechnical: 0,
    completenessOperational: 0,
    createdAt: new Date('2026-03-23T00:00:00Z'),
    updatedAt: new Date('2026-03-23T00:00:00Z'),
    deletedAt: null,
    contactAttempts: [],
    consents: [],
    coverageChecks: [],
    statusChanges: [],
    ...overrides,
  } as ExpedienteRecord;
}
