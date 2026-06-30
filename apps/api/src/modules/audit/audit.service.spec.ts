/**
 * Tests unitarios de AuditService — Sprint 1.
 *
 * Verifica:
 * - log() persiste usando TenantContext cuando no se pasan tenantId/schemaName.
 * - log() persiste usando tenantId/schemaName explícitos (bypass de TenantContext).
 * - log() omite silenciosamente cuando no hay contexto ni valores explícitos.
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

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();
    mockTenantContextGet.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: DataSource,
          useValue: {}, // DataSource injected via @InjectDataSource; no se usa directamente
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
  // Caso 3: omisión silenciosa sin contexto ni valores explícitos
  // --------------------------------------------------------------------------

  it('omite silenciosamente cuando no hay TenantContext ni tenantId/schemaName', async () => {
    mockTenantContextGet.mockReturnValue(undefined); // Sin contexto activo

    await service.log(BASE_ENTRY); // No lanza

    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
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
});
