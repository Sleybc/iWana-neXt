import { DataSource } from 'typeorm';
import { AuditAction } from '@iwana/shared';
import { AuditQueryService } from './audit-query.service';
import { AuditActorResolver } from './audit-actor.resolver';

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

describe('AuditQueryService', () => {
  const dataSource = {} as DataSource;
  let resolver: jest.Mocked<AuditActorResolver>;
  let service: AuditQueryService;
  let findAndCount: jest.Mock;
  let find: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'tenant-1',
      schemaName: 'tenant_demo',
    });
    findAndCount = jest.fn().mockResolvedValue([
      [
        {
          id: 'audit-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: AuditAction.UPDATE,
          entityType: 'User',
          entityId: 'entity-1',
          oldValue: null,
          newValue: { firstName: 'Ana' },
          ipAddress: '127.0.0.1',
          userAgent: 'UA',
          requestId: 'req-1',
          createdAt: new Date('2026-04-30T00:00:00.000Z'),
        },
      ],
      1,
    ]);
    find = jest.fn().mockResolvedValue([]);
    mockRunInTenantSchema.mockImplementation(
      async (_ds: DataSource, _schemaName: string, callback: (qr: unknown) => Promise<unknown>) =>
        callback({
          manager: { getRepository: jest.fn().mockReturnValue({ findAndCount, find }) },
        }),
    );
    resolver = {
      resolveMany: jest.fn().mockResolvedValue(
        new Map([
          [
            'user-1',
            {
              id: 'user-1',
              type: 'tenant',
              displayName: 'Ana Operadora',
              role: 'ADMIN',
              status: 'ACTIVE',
              isDeleted: false,
            },
          ],
        ]),
      ),
      systemActor: jest.fn().mockReturnValue({ id: null, type: 'system', displayName: 'Sistema' }),
      unknownActor: jest.fn((id: string) => ({ id, type: 'unknown', displayName: `Actor ${id}` })),
    } as unknown as jest.Mocked<AuditActorResolver>;
    service = new AuditQueryService(dataSource, resolver);
  });

  it('enriquece cada audit log tenant con actor resuelto por lote', async () => {
    const result = await service.query({ limit: 50 });

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      dataSource,
      'tenant_demo',
      expect.any(Function),
    );
    expect(resolver.resolveMany).toHaveBeenCalledWith(['user-1'], {
      source: 'tenant',
      queryRunner: expect.anything(),
    });
    expect(result.data[0]?.actor).toEqual({
      id: 'user-1',
      type: 'tenant',
      displayName: 'Ana Operadora',
      role: 'ADMIN',
      status: 'ACTIVE',
      isDeleted: false,
    });
  });

  it('usa actor de sistema cuando userId es null', async () => {
    findAndCount.mockResolvedValueOnce([
      [
        {
          id: 'audit-system',
          tenantId: 'tenant-1',
          userId: null,
          action: AuditAction.CREATE,
          entityType: 'Job',
          entityId: 'job-1',
          oldValue: null,
          newValue: null,
          ipAddress: null,
          userAgent: null,
          requestId: null,
          createdAt: new Date('2026-04-30T00:00:00.000Z'),
        },
      ],
      1,
    ]);

    const result = await service.query({ limit: 50 });

    expect(result.data[0]?.actor).toEqual({ id: null, type: 'system', displayName: 'Sistema' });
  });

  it('aplica filtro fromDate/toDate en query', async () => {
    await service.query({
      limit: 50,
      fromDate: '2026-01-01T00:00:00.000Z',
      toDate: '2026-06-30T23:59:59.999Z',
    });

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: expect.anything() }),
      }),
    );
  });

  describe('exportCsv', () => {
    const baseEntry = {
      id: 'audit-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: 'entity-1',
      oldValue: null,
      newValue: null,
      ipAddress: '127.0.0.1',
      userAgent: 'UA',
      requestId: 'req-1',
      createdAt: new Date('2026-04-30T00:00:00.000Z'),
    };

    it('genera CSV con filtros de fecha y sin truncar', async () => {
      find.mockResolvedValueOnce([baseEntry]);

      const result = await service.exportCsv({
        fromDate: '2026-01-01T00:00:00.000Z',
        toDate: '2026-12-31T23:59:59.999Z',
      });

      expect(result.truncated).toBe(false);
      expect(result.rowCount).toBe(1);
      expect(result.csv).toContain('Ana Operadora');
      expect(result.csv).toContain('UPDATE');
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdAt: expect.anything() }),
          take: 5001,
        }),
      );
    });

    it('marca truncated cuando hay más de 5000 filas', async () => {
      find.mockResolvedValueOnce(
        Array.from({ length: 5001 }, (_, i) => ({ ...baseEntry, id: `audit-${i}` })),
      );

      const result = await service.exportCsv({});

      expect(result.truncated).toBe(true);
      expect(result.rowCount).toBe(5000);
      expect(result.csv.startsWith('"Export limitado a 5000 registros"')).toBe(true);
    });
  });
});
