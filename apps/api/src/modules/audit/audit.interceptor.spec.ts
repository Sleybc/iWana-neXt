/**
 * Tests unitarios de AuditInterceptor — Sprint 1 + RF-AUD-03.
 *
 * Verifica:
 * - Pasa sin auditar para métodos GET, HEAD, OPTIONS.
 * - Audita POST → AuditAction.CREATE tras respuesta exitosa.
 * - Audita PATCH → AuditAction.UPDATE.
 * - Audita DELETE → AuditAction.DELETE.
 * - Omite cuando el handler tiene @SkipAudit().
 * - Omite cuando no hay TenantContext ni usuario de plataforma activo.
 * - Extrae entityId desde el route param :id cuando está disponible.
 * - Extrae entityId desde response.data.id como fallback.
 * - Sanitiza passwordHash/mfaSecret del newValue antes de persistir.
 * - No audita respuestas de error (tap error callback).
 * - RF-AUD-03: usuario de plataforma (jwt.type='platform') → PlatformAuditService.
 * - RF-AUD-03: usuario de tenant (jwt.type='tenant') + TenantContext → AuditService.
 *
 * SEGURIDAD: Sin PII real — datos ficticios de prueba.
 */

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { AuditAction } from '@iwana/shared';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { PlatformAuditService } from './platform-audit.service';
import { SKIP_AUDIT_KEY } from './decorators/skip-audit.decorator';

// ---------------------------------------------------------------------------
// Mock global de @iwana/db
// ---------------------------------------------------------------------------

const mockTenantContextGet = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: {
      get: () => mockTenantContextGet(),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers de contexto de ejecucion
// ---------------------------------------------------------------------------

function buildMockContext(
  overrides: {
    method?: string;
    params?: Record<string, string>;
    user?: { sub: string; type?: 'platform' | 'tenant' };
    handlerSkipAudit?: boolean;
    ip?: string;
    headers?: Record<string, string>;
  } = {},
): jest.Mocked<ExecutionContext> {
  const {
    method = 'POST',
    params = {},
    user,
    handlerSkipAudit = false,
    ip = '127.0.0.1',
    headers = {},
  } = overrides;

  const request = {
    method,
    params,
    headers,
    ip,
    user,
    socket: { remoteAddress: ip },
  };

  const ctx = {
    getType: jest.fn().mockReturnValue('http'),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({
      name: 'UsersController',
    }),
  } as unknown as jest.Mocked<ExecutionContext>;

  return ctx;
}

function buildReflector(options: { skipAudit?: boolean; entityName?: string } = {}): Reflector {
  const ref = {
    getAllAndOverride: jest.fn().mockImplementation((key: string) => {
      if (key === SKIP_AUDIT_KEY) return options.skipAudit ?? false;
      if (key === 'auditEntity') return options.entityName ?? undefined;
      return undefined;
    }),
  } as unknown as Reflector;
  return ref;
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('AuditInterceptor', () => {
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let platformAuditService: jest.Mocked<Pick<PlatformAuditService, 'log'>>;

  beforeEach(() => {
    mockTenantContextGet.mockReset();
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    platformAuditService = { log: jest.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // GET — no debe auditar
  // --------------------------------------------------------------------------

  it('pasa sin auditar para método GET', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tid', schemaName: 's1' });
    const ctx = buildMockContext({ method: 'GET' });
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, { handle: () => of({ data: { id: 'e1' } }) });
    await lastValueFrom(result$);

    expect(auditService.log).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // POST → CREATE
  // --------------------------------------------------------------------------

  it('audita POST como AuditAction.CREATE tras respuesta exitosa', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-1', schemaName: 'schema_1' });
    const ctx = buildMockContext({ method: 'POST', user: { sub: 'usr-1' } });
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, {
      handle: () => of({ data: { id: 'entity-created' } }),
    });
    await lastValueFrom(result$);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        entityType: 'Users', // 'UsersController' → 'Users'
        entityId: 'entity-created',
        userId: 'usr-1',
        tenantId: 'tenant-1',
        schemaName: 'schema_1',
      }),
    );
  });

  // --------------------------------------------------------------------------
  // PATCH → UPDATE
  // --------------------------------------------------------------------------

  it('audita PATCH como AuditAction.UPDATE con entityId desde route param', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-2', schemaName: 'schema_2' });
    const ctx = buildMockContext({ method: 'PATCH', params: { id: 'route-uuid' } });
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, { handle: () => of({ data: { name: 'updated' } }) });
    await lastValueFrom(result$);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityId: 'route-uuid',
      }),
    );
  });

  // --------------------------------------------------------------------------
  // DELETE → DELETE (sin newValue)
  // --------------------------------------------------------------------------

  it('audita DELETE como AuditAction.DELETE sin persistir newValue', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-3', schemaName: 'schema_3' });
    const ctx = buildMockContext({ method: 'DELETE', params: { id: 'del-uuid' } });
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, { handle: () => of({ data: null }) });
    await lastValueFrom(result$);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.DELETE,
        newValue: null,
        entityId: 'del-uuid',
      }),
    );
  });

  // --------------------------------------------------------------------------
  // @SkipAudit() — no debe auditar
  // --------------------------------------------------------------------------

  it('omite completamente cuando el handler tiene @SkipAudit()', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tid', schemaName: 's1' });
    const ctx = buildMockContext({ method: 'POST' });
    const reflector = buildReflector({ skipAudit: true });
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, { handle: () => of({}) });
    await lastValueFrom(result$);

    expect(auditService.log).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Sin TenantContext ni usuario de plataforma — no debe auditar
  // --------------------------------------------------------------------------

  it('omite completamente cuando no hay TenantContext ni usuario de plataforma', async () => {
    mockTenantContextGet.mockReturnValue(undefined); // Sin contexto
    const ctx = buildMockContext({ method: 'POST' }); // Sin user en request
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, { handle: () => of({}) });
    await lastValueFrom(result$);

    expect(auditService.log).not.toHaveBeenCalled();
    expect(platformAuditService.log).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // RF-AUD-03: usuario de plataforma → PlatformAuditService
  // --------------------------------------------------------------------------

  it('RF-AUD-03: enruta a PlatformAuditService cuando jwt.type es "platform"', async () => {
    mockTenantContextGet.mockReturnValue(undefined); // Sin TenantContext para usuario de plataforma
    const ctx = buildMockContext({
      method: 'PATCH',
      params: { id: 'tenant-uuid-1' },
      user: { sub: 'platform-user-1', type: 'platform' },
    });
    const reflector = buildReflector({ entityName: 'Tenant' });
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, {
      handle: () => of({ data: { name: 'ISP Bogotá' } }),
    });
    await lastValueFrom(result$);

    // Solo PlatformAuditService debe llamarse
    expect(platformAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityType: 'Tenant',
        entityId: 'tenant-uuid-1',
        userId: 'platform-user-1',
      }),
    );
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('RF-AUD-03: usuario de plataforma con TenantContext activo sigue usando PlatformAuditService', async () => {
    // Aunque haya TenantContext (edge case), el tipo de usuario dicta el destino
    mockTenantContextGet.mockReturnValue({ tenantId: 'tid', schemaName: 's1' });
    const ctx = buildMockContext({
      method: 'POST',
      user: { sub: 'sys-admin-1', type: 'platform' },
    });
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, { handle: () => of({ data: { id: 'new-id' } }) });
    await lastValueFrom(result$);

    expect(platformAuditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('RF-AUD-03: usuario de tenant con TenantContext usa AuditService (no plataforma)', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tenant-1', schemaName: 'schema_1' });
    const ctx = buildMockContext({
      method: 'POST',
      user: { sub: 'tenant-user-1', type: 'tenant' },
    });
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, {
      handle: () => of({ data: { id: 'created-id' } }),
    });
    await lastValueFrom(result$);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        schemaName: 'schema_1',
        userId: 'tenant-user-1',
      }),
    );
    expect(platformAuditService.log).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Sanitización — passwordHash/mfaSecret no deben aparecer en newValue
  // --------------------------------------------------------------------------

  it('sanitiza campos sensibles del newValue antes de persistir', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tid', schemaName: 's1' });
    const ctx = buildMockContext({ method: 'POST', params: { id: 'uid' } });
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const sensitiveResponse = {
      data: {
        id: 'uid',
        name: 'John Doe',
        passwordHash: '$2b$12$supersecret',
        mfaSecret: 'iv:tag:cipher',
        email: 'abc123emailhash',
        accessToken: 'jwt.token.here',
        role: 'tenant_admin',
      },
    };

    const result$ = interceptor.intercept(ctx, { handle: () => of(sensitiveResponse) });
    await lastValueFrom(result$);

    const callArg = (auditService.log as jest.Mock).mock.calls[0]?.[0] as
      | { newValue: Record<string, unknown> }
      | undefined;

    expect(callArg?.newValue).toBeDefined();
    expect(callArg?.newValue).not.toHaveProperty('passwordHash');
    expect(callArg?.newValue).not.toHaveProperty('mfaSecret');
    expect(callArg?.newValue).not.toHaveProperty('email');
    expect(callArg?.newValue).not.toHaveProperty('accessToken');
    // Campos no sensibles sí deben estar
    expect(callArg?.newValue).toHaveProperty('name', 'John Doe');
    expect(callArg?.newValue).toHaveProperty('role', 'tenant_admin');
  });

  // --------------------------------------------------------------------------
  // Error en el handler — no debe auditar
  // --------------------------------------------------------------------------

  it('no audita cuando el handler lanza un error', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tid', schemaName: 's1' });
    const ctx = buildMockContext({ method: 'POST' });
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, {
      handle: () => throwError(() => new Error('handler error')),
    });

    await expect(lastValueFrom(result$)).rejects.toThrow('handler error');
    expect(auditService.log).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // @AuditEntity() — debe usar el nombre del decorador
  // --------------------------------------------------------------------------

  it('usa el nombre del decorador @AuditEntity() en lugar del nombre del controlador', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tid', schemaName: 's1' });
    const ctx = buildMockContext({ method: 'POST' });
    const reflector = buildReflector({ entityName: 'Subscriber' });
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, { handle: () => of({ data: { id: 'sub-1' } }) });
    await lastValueFrom(result$);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'Subscriber' }),
    );
  });

  // --------------------------------------------------------------------------
  // Contexto no-HTTP — debe pasar sin auditar
  // --------------------------------------------------------------------------

  it('pasa sin auditar para contextos no-HTTP (ej: RPC)', async () => {
    mockTenantContextGet.mockReturnValue({ tenantId: 'tid', schemaName: 's1' });
    const ctx = buildMockContext({ method: 'POST' });
    (ctx.getType as jest.Mock).mockReturnValue('rpc');
    const reflector = buildReflector();
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      reflector,
    );

    const result$ = interceptor.intercept(ctx, { handle: () => of({}) });
    await lastValueFrom(result$);

    expect(auditService.log).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Punto ciego cerrado: CUD autenticado sin destino de auditoria resoluble
  // --------------------------------------------------------------------------

  describe('peticion CUD autenticada sin destino de auditoria resoluble', () => {
    it('registra la anomalia en platform_audit_logs en vez de descartarla', async () => {
      mockTenantContextGet.mockReturnValue(undefined); // Sin TenantContext
      const ctx = buildMockContext({
        method: 'POST',
        // Token de tenant en una superficie sin TenantContext: el caso que hizo
        // intrazable la escalada de privilegio.
        user: { sub: 'usr-tenant-1', type: 'tenant' },
      });
      const reflector = buildReflector();
      const interceptor = new AuditInterceptor(
        auditService as unknown as AuditService,
        platformAuditService as unknown as PlatformAuditService,
        reflector,
      );

      const result$ = interceptor.intercept(ctx, { handle: () => of({ data: { id: 'e9' } }) });
      await lastValueFrom(result$);

      expect(auditService.log).not.toHaveBeenCalled();
      expect(platformAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: expect.stringContaining('ANOMALIA_AUDITORIA'),
          userId: 'usr-tenant-1',
        }),
      );
    });

    it('no registra anomalia cuando la peticion es anonima', async () => {
      mockTenantContextGet.mockReturnValue(undefined);
      const ctx = buildMockContext({ method: 'POST' }); // Sin user
      const reflector = buildReflector();
      const interceptor = new AuditInterceptor(
        auditService as unknown as AuditService,
        platformAuditService as unknown as PlatformAuditService,
        reflector,
      );

      const result$ = interceptor.intercept(ctx, { handle: () => of({}) });
      await lastValueFrom(result$);

      expect(platformAuditService.log).not.toHaveBeenCalled();
    });
  });
});
