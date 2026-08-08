/**
 * Tests unitarios de AuditService — Sprint 1.
 *
 * Verifica:
 * - log() persiste usando TenantContext cuando no se pasan tenantId/schemaName.
 * - log() persiste usando tenantId/schemaName explícitos (bypass de TenantContext).
 * - log() reencamina a platform_audit_logs como anomalía cuando no hay contexto
 *   ni valores explícitos (S-8: antes se descartaba en silencio).
 * - log() swallows cualquier error de persistencia (nunca relanza).
 *
 * MOCKS:
 * - @iwana/db: runInTenantSchema + TenantContext.get() controlables por test.
 *
 * SEGURIDAD: Sin PII real — datos ficticios de prueba.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditAction } from '@iwana/shared';
import { AuditService } from './audit.service';
import { ANOMALIA_AUDITORIA_PREFIX } from './audit.constants';
import { PlatformAuditService } from './platform-audit.service';
import { AuditEntryInput } from './interfaces/audit-entry.interface';

// ---------------------------------------------------------------------------
// Mock global de @iwana/db
// ---------------------------------------------------------------------------

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGet = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      get: () => mockTenantContextGet(),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Configura mockRunInTenantSchema para ejecutar el callback con un manager mockeado */
function setupRunInTenantSchema(): {
  save: jest.Mock;
  create: jest.Mock;
  manager: Record<string, jest.Mock>;
} {
  const save = jest.fn().mockResolvedValue({});
  const create = jest.fn().mockImplementation((_entity: unknown, data: unknown) => data);
  const manager = { save, create };

  mockRunInTenantSchema.mockImplementation(
    async (
      _ds: unknown,
      _schema: string,
      callback: (qr: { manager: typeof manager }) => Promise<unknown>,
    ) => callback({ manager }),
  );

  return { save, create, manager };
}

const BASE_ENTRY: AuditEntryInput = {
  action: AuditAction.LOGIN,
  entityType: 'User',
  entityId: 'user-uuid-1',
  userId: 'user-uuid-1',
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuditService', () => {
  let service: AuditService;
  let platformAuditLog: jest.Mock;

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();
    mockTenantContextGet.mockReset();
    platformAuditLog = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: DataSource,
          useValue: {}, // DataSource injected via @InjectDataSource; no se usa directamente
        },
        {
          provide: PlatformAuditService,
          useValue: { log: platformAuditLog },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Caso 1: usa TenantContext cuando no hay tenantId/schemaName en el input
  // --------------------------------------------------------------------------

  it('persiste la entrada usando TenantContext cuando no se proveen tenantId/schemaName', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-1', schemaName: 'tenant_s1' });
    const { save } = setupRunInTenantSchema();

    await service.log(BASE_ENTRY);

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_s1',
      expect.any(Function),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // Caso 2: usa tenantId/schemaName explícitos (bypass de TenantContext)
  // --------------------------------------------------------------------------

  it('persiste con tenantId/schemaName explícitos sin consultar TenantContext', async () => {
    // TenantContext retornaria otro tenant — no debe usarse
    mockTenantContextGet.mockReturnValue({ tenantId: 'wrong-tenant', schemaName: 'wrong_schema' });
    const { save } = setupRunInTenantSchema();

    await service.log({
      ...BASE_ENTRY,
      tenantId: 'explicit-tenant',
      schemaName: 'explicit_schema',
    });

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'explicit_schema',
      expect.any(Function),
    );
    expect(save).toHaveBeenCalledTimes(1);
    // TenantContext.get() NO debe haberse llamado cuando ambos valores son explícitos
    expect(mockTenantContextGet).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Caso 3 (S-8): sin contexto NO se descarta — se reencamina como anomalía
  // --------------------------------------------------------------------------

  it('reencamina a platform_audit_logs como anomalía cuando no hay TenantContext ni tenantId/schemaName', async () => {
    mockTenantContextGet.mockReturnValue(undefined); // Sin contexto activo

    await service.log(BASE_ENTRY); // No lanza

    // No escribe en ningún schema de tenant: no hay tenant al que atribuirlo
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();

    // Pero tampoco se pierde: queda trazado en el trail de plataforma
    expect(platformAuditLog).toHaveBeenCalledTimes(1);
    expect(platformAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: BASE_ENTRY.action,
        entityType: `${ANOMALIA_AUDITORIA_PREFIX}${BASE_ENTRY.entityType}`,
        entityId: BASE_ENTRY.entityId,
        userId: BASE_ENTRY.userId,
      }),
    );
  });

  it('no reencamina cuando el destino de tenant sí es resoluble', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-1', schemaName: 'tenant_s1' });
    setupRunInTenantSchema();

    await service.log(BASE_ENTRY);

    expect(platformAuditLog).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Caso 4: swallows del error de persistencia — nunca relanza
  // --------------------------------------------------------------------------

  it('swallows el error de runInTenantSchema sin relanzar', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-1', schemaName: 'tenant_s1' });
    mockRunInTenantSchema.mockRejectedValue(new Error('DB connection lost'));

    // No debe lanzar — audit failure es silencioso
    await expect(service.log(BASE_ENTRY)).resolves.toBeUndefined();
    expect(mockRunInTenantSchema).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // Caso 5: guarda los campos correctos en la entidad AuditLog
  // --------------------------------------------------------------------------

  it('crea y guarda AuditLog con los campos correctos', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-1', schemaName: 'tenant_s1' });
    const { save, create } = setupRunInTenantSchema();

    const entry: AuditEntryInput = {
      action: AuditAction.PASSWORD_CHANGED,
      entityType: 'User',
      entityId: 'user-uuid-2',
      userId: 'user-uuid-2',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    await service.log(entry);

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-uuid-2',
        action: AuditAction.PASSWORD_CHANGED,
        entityType: 'User',
        entityId: 'user-uuid-2',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // Caso 6: omisión silenciosa cuando solo se provee tenantId (falta schemaName)
  // --------------------------------------------------------------------------

  it('usa TenantContext cuando solo se provee tenantId sin schemaName', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'ctx-tenant', schemaName: 'ctx_schema' });
    const { save } = setupRunInTenantSchema();

    // Solo tenantId sin schemaName — debe caer a TenantContext
    await service.log({ ...BASE_ENTRY, tenantId: 'partial-tenant' });

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'ctx_schema',
      expect.any(Function),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('SEC-P1: no persiste fullName, latitude ni longitude en newValue', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-1', schemaName: 'tenant_s1' });
    const { save, create } = setupRunInTenantSchema();

    await service.log({
      ...BASE_ENTRY,
      action: AuditAction.CREATE,
      entityType: 'Wfm',
      newValue: {
        id: 'evt-1',
        fullName: 'Persona Ficticia',
        latitude: 4.711,
        longitude: -74.072,
        status: 'SCHEDULED',
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        newValue: expect.objectContaining({
          id: 'evt-1',
          status: 'SCHEDULED',
        }),
      }),
    );
    const savedPayload = create.mock.calls[0]![1] as {
      newValue: Record<string, unknown>;
    };
    expect(savedPayload.newValue).not.toHaveProperty('fullName');
    expect(savedPayload.newValue).not.toHaveProperty('latitude');
    expect(savedPayload.newValue).not.toHaveProperty('longitude');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('SEC-P1 H-5: omite description/title/sector/municipality y coords numéricas', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-1', schemaName: 'tenant_s1' });
    const { create } = setupRunInTenantSchema();

    await service.log({
      ...BASE_ENTRY,
      action: AuditAction.CREATE,
      entityType: 'ScheduleEvent',
      newValue: {
        id: 'evt-2',
        description: 'Visita a domicilio ficticio',
        title: 'Instalación ficticia',
        sector: 'Norte',
        municipality: 'Municipio Ficticio',
        latitude: 4.65,
        longitude: -74.05,
        status: 'DRAFT',
      },
    });

    const savedPayload = create.mock.calls[0]![1] as {
      newValue: Record<string, unknown>;
    };
    expect(savedPayload.newValue).toEqual({ id: 'evt-2', status: 'DRAFT' });
  });
});
