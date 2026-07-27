/**
 * Tests unitarios de PlatformAuditService — RF-AUD-03.
 *
 * Verifica:
 * - log() persiste en public.platform_audit_logs via DataSource.getRepository.
 * - log() swallows cualquier error de persistencia (nunca relanza).
 * - log() guarda los campos correctos en la entidad PlatformAuditLog.
 * - log() ignora tenantId/schemaName del input (siempre schema público).
 *
 * SEGURIDAD: Sin PII real — datos ficticios de prueba.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditAction } from '@iwana/shared';
import { PlatformAuditService } from './platform-audit.service';
import { AuditEntryInput } from './interfaces/audit-entry.interface';
import { AuditActorResolver } from './audit-actor.resolver';

// ---------------------------------------------------------------------------
// Helpers de mock para DataSource.getRepository + createQueryBuilder
// ---------------------------------------------------------------------------

function buildMockDataSource(): {
  dataSource: DataSource;
  save: jest.Mock;
  create: jest.Mock;
  findAndCount: jest.Mock;
  find: jest.Mock;
} {
  const save = jest.fn().mockResolvedValue({});
  const create = jest.fn().mockImplementation((_entity: unknown, data: unknown) => data);
  const findAndCount = jest.fn().mockResolvedValue([[], 0]);
  const find = jest.fn().mockResolvedValue([]);
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({ save, create, findAndCount, find }),
    createQueryBuilder: jest.fn(),
  } as unknown as DataSource;
  return { dataSource, save, create, findAndCount, find };
}

/**
 * Construye un mock de query builder encadenable para tests de query().
 */
function buildMockQueryBuilder(
  overrides: {
    getMany?: jest.Mock;
    getCount?: jest.Mock;
    getManyAndCount?: jest.Mock;
  } = {},
) {
  const getMany = overrides.getMany ?? jest.fn();
  const getCount = overrides.getCount ?? jest.fn();
  const getManyAndCount = overrides.getManyAndCount ?? jest.fn();

  const qb: Record<string, jest.Mock> = {
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany,
    getCount,
    getManyAndCount,
  };

  // Los métodos que devuelven el mismo qb deben ser encadenables
  for (const key of Object.keys(qb)) {
    if (!['getMany', 'getCount', 'getManyAndCount'].includes(key)) {
      qb[key] = jest.fn(() => qb);
    }
  }
  // Restauramos los mocks reales que sí devuelven valores
  qb.getMany = getMany;
  qb.getCount = getCount;
  qb.getManyAndCount = getManyAndCount;

  return qb;
}

const BASE_ENTRY: AuditEntryInput = {
  action: AuditAction.UPDATE,
  entityType: 'Tenant',
  entityId: 'tenant-uuid-1',
  userId: 'sysadmin-uuid-1',
  ipAddress: '10.0.0.1',
  userAgent: 'Mozilla/5.0',
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PlatformAuditService', () => {
  let service: PlatformAuditService;
  let save: jest.Mock;
  let create: jest.Mock;
  let findAndCount: jest.Mock;
  let find: jest.Mock;
  let resolver: jest.Mocked<AuditActorResolver>;

  beforeEach(async () => {
    const { dataSource, save: s, create: c, findAndCount: fc, find: f } = buildMockDataSource();
    save = s;
    create = c;
    findAndCount = fc;
    find = f;
    resolver = {
      resolveMany: jest.fn().mockResolvedValue(
        new Map([
          [
            'user-uuid-1',
            {
              id: 'user-uuid-1',
              type: 'platform',
              displayName: 'Admin Plataforma',
              role: 'SYSTEM_ADMIN',
              status: 'ACTIVE',
              isDeleted: false,
            },
          ],
        ]),
      ),
      systemActor: jest.fn().mockReturnValue({ id: null, type: 'system', displayName: 'Sistema' }),
      unknownActor: jest.fn((id: string) => ({ id, type: 'unknown', displayName: `Actor ${id}` })),
    } as unknown as jest.Mocked<AuditActorResolver>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAuditService,
        { provide: DataSource, useValue: dataSource },
        { provide: AuditActorResolver, useValue: resolver },
      ],
    }).compile();

    service = module.get<PlatformAuditService>(PlatformAuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Caso 1: persiste en platform_audit_logs con los campos correctos
  // --------------------------------------------------------------------------

  it('persiste la entrada en platform_audit_logs con los campos correctos', async () => {
    await service.log(BASE_ENTRY);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'sysadmin-uuid-1',
        action: AuditAction.UPDATE,
        entityType: 'Tenant',
        entityId: 'tenant-uuid-1',
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // Caso 2: swallows el error de persistencia — nunca relanza
  // --------------------------------------------------------------------------

  it('swallows el error de save sin relanzar', async () => {
    save.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.log(BASE_ENTRY)).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // Caso 3: userId null para acciones de sistema (jobs BullMQ)
  // --------------------------------------------------------------------------

  it('acepta userId null para acciones de sistema', async () => {
    await service.log({ ...BASE_ENTRY, userId: null });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });

  // --------------------------------------------------------------------------
  // Caso 4: tenantId/schemaName en el input son ignorados (siempre schema público)
  // --------------------------------------------------------------------------

  it('ignora tenantId y schemaName del input — siempre escribe en schema público', async () => {
    // PlatformAuditLog usa @Entity({ schema: 'public' }) — no se pasa schema al repo
    await service.log({ ...BASE_ENTRY, tenantId: 'any-tenant', schemaName: 'any_schema' });

    // El servicio nunca usa tenantId/schemaName para enrutar — solo los campos de la entidad
    expect(save).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: expect.anything() }),
    );
  });

  // --------------------------------------------------------------------------
  // Caso 5: oldValue y newValue opcionales
  // --------------------------------------------------------------------------

  it('persiste oldValue y newValue cuando se proveen', async () => {
    const oldValue = { status: 'ACTIVE' };
    const newValue = { status: 'SUSPENDED' };

    await service.log({ ...BASE_ENTRY, oldValue, newValue });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ oldValue, newValue }));
  });

  it('persiste null para oldValue y newValue cuando no se proveen', async () => {
    await service.log(BASE_ENTRY);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ oldValue: null, newValue: null }),
    );
  });

  describe('query', () => {
    const mockEntry = {
      id: 'entry-uuid-1',
      userId: 'user-uuid-1',
      action: 'CREATE',
      entityType: 'PlatformUser',
      entityId: 'pu-uuid-1',
      oldValue: null,
      newValue: { email: 'admin@iwana.co' },
      ipAddress: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
      requestId: null,
      createdAt: new Date(),
    };

    let qbMock: Record<string, jest.Mock>;
    let getManyMock: jest.Mock;
    let getCountMock: jest.Mock;

    beforeEach(() => {
      getManyMock = jest.fn().mockResolvedValue([mockEntry]);
      getCountMock = jest.fn().mockResolvedValue(1);
      qbMock = buildMockQueryBuilder({ getMany: getManyMock, getCount: getCountMock });

      // Mock de createQueryBuilder — el servicio lo llama dos veces
      // (una para datos, otra para count)
      const dataSource = service['dataSource'] as unknown as {
        createQueryBuilder: jest.Mock;
        getRepository: jest.Mock;
      };
      dataSource.createQueryBuilder = jest.fn().mockReturnValue(qbMock);
      // Para exportCsv que usa getRepository().find()
      (dataSource.getRepository as jest.Mock).mockReturnValue({ save, create, findAndCount, find });
    });

    it('retorna datos y nextCursor=null cuando hay resultados', async () => {
      const result = await service.query({ limit: 50 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.actor).toEqual({
        id: 'user-uuid-1',
        type: 'platform',
        displayName: 'Admin Plataforma',
        role: 'SYSTEM_ADMIN',
        status: 'ACTIVE',
        isDeleted: false,
      });
      expect(result.nextCursor).toBeNull();
      expect(resolver.resolveMany).toHaveBeenCalledWith(['user-uuid-1'], { source: 'platform' });
      // Verifica que se llamó a orderBy y take en la query builder
      expect(qbMock.orderBy).toHaveBeenCalledWith('audit.createdAt', 'DESC');
      expect(qbMock.addOrderBy).toHaveBeenCalledWith('audit.id', 'DESC');
      expect(qbMock.take).toHaveBeenCalledWith(51);
    });

    it('retorna nextCursor cuando hay mas resultados que el limite', async () => {
      getManyMock.mockResolvedValue([
        mockEntry,
        { ...mockEntry, id: 'entry-uuid-2' },
        { ...mockEntry, id: 'entry-uuid-3' },
      ]);
      const result = await service.query({ limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeTruthy();
    });

    it('aplica filtro de action cuando se provee', async () => {
      await service.query({ limit: 50, action: AuditAction.CREATE });
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'audit.action = :action',
        expect.objectContaining({ action: AuditAction.CREATE }),
      );
    });

    it('aplica filtro de entityType cuando se provee', async () => {
      await service.query({ limit: 50, entityType: 'PlatformUser' });
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'audit.entityType = :entityType',
        expect.objectContaining({ entityType: 'PlatformUser' }),
      );
    });

    it('aplica filtro de cursor cuando se provee', async () => {
      // El cursor usa encodeAuditCursor. Necesitamos un cursor válido.
      const cursor = Buffer.from(
        JSON.stringify({
          d: '2026-01-01T00:00:00.000Z',
          i: 'entry-uuid-5',
        }),
        'utf8',
      ).toString('base64url');
      await service.query({ limit: 50, cursor });
      // El cursor aplica un Brackets con where/orWhere
      expect(qbMock.andWhere).toHaveBeenCalled();
    });

    it('aplica filtro fromDate/toDate como BETWEEN en query', async () => {
      await service.query({
        limit: 50,
        fromDate: '2026-01-01T00:00:00.000Z',
        toDate: '2026-06-30T23:59:59.999Z',
      });
      // applyCreatedAtFilter emite BETWEEN con parámetros escalares
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'audit.createdAt BETWEEN :fromDate AND :toDate',
        expect.objectContaining({
          fromDate: expect.any(Date),
          toDate: expect.any(Date),
        }),
      );
    });

    it('aplica solo fromDate con >= en query', async () => {
      await service.query({ limit: 50, fromDate: '2026-01-01T00:00:00.000Z' });
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'audit.createdAt >= :fromDate',
        expect.objectContaining({
          fromDate: expect.any(Date),
        }),
      );
    });

    it('aplica solo toDate con <= en query', async () => {
      await service.query({ limit: 50, toDate: '2026-06-30T23:59:59.999Z' });
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'audit.createdAt <= :toDate',
        expect.objectContaining({
          toDate: expect.any(Date),
        }),
      );
    });
  });

  describe('exportCsv', () => {
    const mockEntry = {
      id: 'entry-uuid-1',
      userId: 'user-uuid-1',
      action: 'CREATE',
      entityType: 'PlatformUser',
      entityId: 'pu-uuid-1',
      oldValue: null,
      newValue: null,
      ipAddress: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
      requestId: 'req-1',
      createdAt: new Date('2026-04-30T12:00:00.000Z'),
    };

    it('genera CSV con headers en español y actor displayName', async () => {
      find.mockResolvedValueOnce([mockEntry]);

      const result = await service.exportCsv({ action: AuditAction.CREATE });

      expect(result.truncated).toBe(false);
      expect(result.rowCount).toBe(1);
      expect(result.csv).toContain('Fecha');
      expect(result.csv).toContain('Acción');
      expect(result.csv).toContain('Admin Plataforma');
      expect(result.csv).toContain('CREATE');
      expect(result.csv).not.toContain('Export limitado');
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: AuditAction.CREATE }),
          take: 5001,
        }),
      );
    });

    it('marca truncated y añade comentario cuando hay más de 5000 filas', async () => {
      const rows = Array.from({ length: 5001 }, (_, i) => ({
        ...mockEntry,
        id: `entry-uuid-${i}`,
      }));
      find.mockResolvedValueOnce(rows);

      const result = await service.exportCsv({});

      expect(result.truncated).toBe(true);
      expect(result.rowCount).toBe(5000);
      expect(result.csv.startsWith('"Export limitado a 5000 registros"')).toBe(true);
    });

    it('aplica filtros de fecha en export sin cursor', async () => {
      find.mockResolvedValueOnce([]);
      await service.exportCsv({
        fromDate: '2026-01-01T00:00:00.000Z',
        toDate: '2026-06-30T23:59:59.999Z',
        cursor: 'should-be-ignored',
      });
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdAt: expect.anything() }),
        }),
      );
      const where = find.mock.calls[0]?.[0]?.where as Record<string, unknown>;
      expect(where['id']).toBeUndefined();
    });
  });
});
