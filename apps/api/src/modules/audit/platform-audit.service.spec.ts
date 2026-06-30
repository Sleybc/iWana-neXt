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
// Helpers de mock para DataSource.getRepository
// ---------------------------------------------------------------------------

function buildMockDataSource(): {
  dataSource: DataSource;
  save: jest.Mock;
  create: jest.Mock;
  findAndCount: jest.Mock;
} {
  const save = jest.fn().mockResolvedValue({});
  const create = jest.fn().mockImplementation((_entity: unknown, data: unknown) => data);
  const findAndCount = jest.fn().mockResolvedValue([[], 0]);
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({ save, create, findAndCount }),
  } as unknown as DataSource;
  return { dataSource, save, create, findAndCount };
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
  let resolver: jest.Mocked<AuditActorResolver>;

  beforeEach(async () => {
    const { dataSource, save: s, create: c, findAndCount: fc } = buildMockDataSource();
    save = s;
    create = c;
    findAndCount = fc;
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

    beforeEach(() => {
      findAndCount.mockResolvedValue([[mockEntry], 1]);
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
      expect(findAndCount).toHaveBeenCalledWith({
        where: {},
        order: { createdAt: 'DESC', id: 'DESC' },
        take: 51,
      });
    });

    it('retorna nextCursor cuando hay mas resultados que el limite', async () => {
      findAndCount.mockResolvedValue([
        [mockEntry, { ...mockEntry, id: 'entry-uuid-2' }, { ...mockEntry, id: 'entry-uuid-3' }],
        3,
      ]);
      const result = await service.query({ limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBe('entry-uuid-2');
    });

    it('aplica filtro de action cuando se provee', async () => {
      await service.query({ limit: 50, action: 'CREATE' });
      expect(findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ action: 'CREATE' }) }),
      );
    });

    it('aplica filtro de entityType cuando se provee', async () => {
      await service.query({ limit: 50, entityType: 'PlatformUser' });
      expect(findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ entityType: 'PlatformUser' }) }),
      );
    });

    it('aplica filtro de cursor cuando se provee', async () => {
      await service.query({ limit: 50, cursor: 'entry-uuid-5' });
      expect(findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: expect.anything() }) }),
      );
    });
  });
});
