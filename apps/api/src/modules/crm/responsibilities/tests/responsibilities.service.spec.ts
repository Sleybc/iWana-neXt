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
    // resetAllMocks limpia también la cola de mockImplementationOnce,
    // evitando contaminación entre tests cuando el número de llamadas cambia.
    jest.resetAllMocks();
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
            query: async () => [],
          },
        }),
      );

      await expect(service.getResponsibility('exp-nonexistent')).rejects.toThrow(
        'Expediente exp-nonexistent no encontrado',
      );
    });

    it('uses legacy assigned_to fields when schema lacks current responsibility columns', async () => {
      const updatedAt = new Date('2026-03-05T08:00:00Z');

      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => {
                const error = new Error(
                  'column "current_responsible_user_id" does not exist',
                ) as Error & {
                  driverError?: { code?: string };
                };
                error.driverError = { code: '42703' };
                throw error;
              },
              query: async () => [
                {
                  id: 'exp-legacy',
                  assigned_to: 'user-legacy',
                  updated_at: updatedAt.toISOString(),
                },
              ],
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => ({
                id: 'user-legacy',
                firstName: 'Julia',
                lastName: 'Rojas',
                email: 'julia@tenant.test',
                role: 'SUPPORT',
              }),
            },
          }),
        );

      await expect(service.getResponsibility('exp-legacy')).resolves.toEqual({
        currentResponsibleUserId: 'user-legacy',
        currentResponsibleAssignedAt: updatedAt,
        currentResponsible: {
          userId: 'user-legacy',
          name: 'Julia Rojas',
          role: 'SUPPORT',
        },
        expedienteId: 'exp-legacy',
      });
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

      // Con el nuevo código solo hay 1 llamada a runInTenantSchema.
      // El mismo qr resuelve el expediente, guarda los cambios y busca el actor nuevo.
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async (entity: unknown, options: { where: { id: string } }) => {
              if (entity === ExpedienteRecord) return expediente;
              // Para resolveActorWithQr: búsqueda de usuario
              return {
                id: options.where.id,
                firstName: 'Carlos',
                lastName: 'Mejía',
                email: 'carlos@tenant.test',
                role: 'ASESOR_COMERCIAL',
              };
            },
            update: async (_entity: unknown, _id: unknown, data: Record<string, unknown>) => {
              savedExpediente = data;
              return { affected: 1 };
            },
            save: async (entity: unknown, data: Record<string, unknown>) => {
              if (entity === OperationalResponsibilityHistory) {
                savedHistoryEntries.push(data);
                return { id: 'history-1', ...data };
              }
              return data;
            },
            create: (_entity: unknown, data: Record<string, unknown>) => data,
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
      // El snapshot devuelto debe reflejar el nuevo responsable sin segunda transacción
      expect(result.currentResponsibleUserId).toBe('user-new');
      expect(result.currentResponsible.name).toBe('Carlos Mejía');
      void savedExpediente;
    });

    it('does NOT modify sales_attributions when updating responsibility', async () => {
      const expediente = buildExpediente({
        id: 'exp-3',
        currentResponsibleUserId: null,
      });

      const savedEntities: string[] = [];

      // Con el nuevo código solo hay 1 llamada a runInTenantSchema.
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async (entity: unknown) => {
              if (entity === ExpedienteRecord) return expediente;
              return {
                id: 'user-new',
                firstName: 'Test',
                lastName: 'User',
                email: 'test@tenant.test',
                role: 'SALES',
              };
            },
            update: async (entity: unknown) => {
              savedEntities.push(
                (entity as { name?: string }).name ?? String(entity),
              );
              return { affected: 1 };
            },
            save: async (entity: unknown, data: unknown) => {
              savedEntities.push(
                (entity as { name?: string }).name ?? String(entity),
              );
              return data ?? entity;
            },
            create: (_entity: unknown, data: Record<string, unknown>) => data,
          },
        }),
      );

      await service.updateResponsibility('exp-3', { responsibleUserId: 'user-new' }, 'actor-user');

      expect(savedEntities).not.toContain('SalesAttribution');
      expect(savedEntities.filter((c) => c.includes('attribution'))).toHaveLength(0);
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
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => buildExpediente({ id: 'exp-empty' }),
            query: async () => [],
            findAndCount: async () => [[], 0],
          },
        }),
      );

      const result = await service.getResponsibilityHistory('exp-empty', 1, 20);

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('throws NotFoundException when expediente does not exist', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => null,
            query: async () => [],
          },
        }),
      );

      await expect(service.getResponsibilityHistory('exp-nonexistent', 1, 20)).rejects.toThrow(
        'Expediente exp-nonexistent no encontrado',
      );
    });

    it('returns empty history when findAndCount fails due to schema compatibility', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => buildExpediente({ id: 'exp-1' }),
            query: async () => [],
            findAndCount: async () => {
              const error = new Error(
                'relation "operational_responsibility_history" does not exist',
              ) as Error & {
                driverError?: { code?: string };
              };
              error.driverError = { code: '42P01' };
              throw error;
            },
          },
        }),
      );

      await expect(service.getResponsibilityHistory('exp-1', 1, 20)).resolves.toEqual({
        data: [],
        total: 0,
      });
    });

    it('returns empty history when schema lacks responsibility columns on expediente_records', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => {
              const error = new Error(
                'column "current_responsible_user_id" does not exist',
              ) as Error & {
                driverError?: { code?: string };
              };
              error.driverError = { code: '42703' };
              throw error;
            },
            query: async () => [{ id: 'exp-legacy', assigned_to: 'user-legacy', updated_at: null }],
            findAndCount: async () => {
              const error = new Error(
                'relation "operational_responsibility_history" does not exist',
              ) as Error & {
                driverError?: { code?: string };
              };
              error.driverError = { code: '42P01' };
              throw error;
            },
          },
        }),
      );

      await expect(service.getResponsibilityHistory('exp-legacy', 1, 20)).resolves.toEqual({
        data: [],
        total: 0,
      });
    });

    it('rethrows findAndCount failures unrelated to schema compatibility', async () => {
      const failure = new Error('database unavailable');

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => buildExpediente({ id: 'exp-1' }),
            query: async () => [],
            findAndCount: async () => {
              throw failure;
            },
          },
        }),
      );

      await expect(service.getResponsibilityHistory('exp-1', 1, 20)).rejects.toThrow(failure);
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
