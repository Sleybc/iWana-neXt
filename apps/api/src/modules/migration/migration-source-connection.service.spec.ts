import {
  BadGatewayException,
  ConflictException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, MigrationSourceConnectionSchema } from '@iwana/shared';
import { MigrationCrypto } from './migration-crypto';
import { MigrationSourceConnectionService } from './migration-source-connection.service';
import { UispApiError } from './uisp-api/uisp-api.client';

const tenantId = '69000000-0000-4000-8000-000000000001';
const actorId = '69000000-0000-4000-8000-000000000002';
const scope = { tenantId, schemaName: 'tenant_conn_unit' };
const APP_KEY = 'clave-sintetica-conexion-9f8e7d';
const SHA = 'ab'.repeat(32);

interface Row {
  id: string;
  base_url: string;
  app_key_encrypted: string;
  trusted_certificate_sha256: string | null;
  last_checked_at: Date | null;
  last_check_result: string | null;
  updated_at: Date;
}

/** Doble mínimo de la tabla: una fila por tenant, como `uq_..._tenant_source`. */
function fakeDatabase() {
  const state: { row: Row | null; sql: string[]; params: unknown[][] } = {
    row: null,
    sql: [],
    params: [],
  };
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    state.sql.push(sql);
    state.params.push(params);
    if (sql.startsWith('SET') || sql.includes('search_path')) return [];
    if (sql.includes('SELECT') && sql.includes('FROM migration_source_connections')) {
      return state.row ? [state.row] : [];
    }
    if (sql.includes('INSERT INTO migration_source_connections')) {
      state.row = {
        id: state.row?.id ?? '69000000-0000-4000-8000-0000000000aa',
        base_url: params[1] as string,
        app_key_encrypted: params[2] as string,
        trusted_certificate_sha256: params[3] as string | null,
        last_checked_at: new Date(),
        last_check_result: 'OK',
        updated_at: new Date(),
      };
      return [state.row];
    }
    if (sql.includes('UPDATE migration_source_connections')) {
      if (!state.row) return [[], 0];
      state.row = {
        ...state.row,
        last_checked_at: new Date(),
        last_check_result: params[1] as string,
      };
      return [[state.row], 1];
    }
    if (sql.includes('DELETE FROM migration_uisp_users')) {
      return [[{ id: 'p1' }, { id: 'p2' }], 2];
    }
    if (sql.includes('DELETE FROM migration_source_connections')) {
      const deleted = state.row;
      state.row = null;
      return [deleted ? [deleted] : [], deleted ? 1 : 0];
    }
    return [];
  });
  const qr = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    query,
    manager: { query },
  };
  return { state, dataSource: { createQueryRunner: () => qr } };
}

describe('MigrationSourceConnectionService', () => {
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '34'.repeat(32),
    MFA_ENCRYPTION_KEY: '56'.repeat(32),
    PII_HASH_KEY: '78'.repeat(32),
    NODE_ENV: 'test',
  });
  const crypto = new MigrationCrypto(config);
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const client = { checkVersion: jest.fn().mockResolvedValue(undefined) };
  let db: ReturnType<typeof fakeDatabase>;
  let service: MigrationSourceConnectionService;
  const logs: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    logs.length = 0;
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(' ')));
    }
    db = fakeDatabase();
    service = new MigrationSourceConnectionService(
      db.dataSource as never,
      crypto,
      audit as never,
      client as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const input = { baseUrl: 'https://uisp.example.test', appKey: APP_KEY };

  /** Todo lo que sale del servicio: respuestas, auditoría, SQL (salvo el cifrado) y logs. */
  function exposed(...responses: unknown[]): string {
    return JSON.stringify([responses, audit.logWithin.mock.calls, logs]);
  }

  it('prueba /version con la clave, guarda la clave cifrada y nunca la devuelve', async () => {
    const connection = await service.upsert(
      scope,
      { ...input, trustedCertificateSha256: SHA },
      actorId,
    );

    expect(client.checkVersion).toHaveBeenCalledWith({
      baseUrl: input.baseUrl,
      appKey: APP_KEY,
      trustedCertificateSha256: SHA,
    });
    expect(MigrationSourceConnectionSchema.parse(connection)).toEqual(connection);
    expect(connection).toMatchObject({
      baseUrl: input.baseUrl,
      hasAppKey: true,
      trustedCertificateSha256: SHA,
      lastCheckResult: 'OK',
    });
    const stored = db.state.row!.app_key_encrypted;
    expect(stored).not.toContain(APP_KEY);
    expect(crypto.decryptText(stored)).toBe(APP_KEY);
    expect(db.state.params.flat()).not.toContain(APP_KEY);
    // La clave no aparece ni en claro ni cifrada en respuesta, auditoría o logs.
    expect(exposed(connection)).not.toContain(APP_KEY);
    expect(exposed(connection)).not.toContain(stored);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        entityType: 'MigrationSourceConnection',
        userId: actorId,
        tenantId,
        oldValue: null,
        newValue: {
          baseUrl: input.baseUrl,
          trustedCertificateSha256: SHA,
          lastCheckResult: 'OK',
        },
      }),
      expect.anything(),
    );
  });

  it('reemplazar la conexión audita UPDATE con el estado anterior', async () => {
    await service.upsert(scope, input, actorId);
    audit.logWithin.mockClear();

    await service.upsert(scope, { ...input, baseUrl: 'https://otro.example.test' }, actorId);

    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        oldValue: expect.objectContaining({ baseUrl: input.baseUrl }),
        newValue: expect.objectContaining({ baseUrl: 'https://otro.example.test' }),
      }),
      expect.anything(),
    );
  });

  it.each([
    [
      new UispApiError('UNAUTHORIZED', 'CREDENCIAL_RECHAZADA', false),
      UnprocessableEntityException,
      'MIGRATION_SOURCE_UNAUTHORIZED',
    ],
    [
      new UispApiError('UNREACHABLE', 'CERTIFICADO_NO_COINCIDE', false),
      BadGatewayException,
      'MIGRATION_SOURCE_UNREACHABLE',
    ],
    // S-1: dirección interna o reservada → 422 (es un dato inválido, no un fallo de UISP).
    [
      new UispApiError('UNREACHABLE', 'DESTINO_NO_PERMITIDO', false),
      UnprocessableEntityException,
      'MIGRATION_SOURCE_UNREACHABLE',
    ],
  ])('si la prueba falla no guarda nada (%s)', async (failure, type, code) => {
    client.checkVersion.mockRejectedValueOnce(failure);

    const error = await service.upsert(scope, input, actorId).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(type);
    expect((error as { getResponse(): unknown }).getResponse()).toEqual(
      expect.objectContaining({ code, details: { reason: failure.reason } }),
    );
    expect(db.state.row).toBeNull();
    expect(audit.logWithin).not.toHaveBeenCalled();
    expect(JSON.stringify((error as { getResponse(): unknown }).getResponse())).not.toContain(
      APP_KEY,
    );
  });

  it('GET devuelve null sin conexión y la conexión sin clave cuando existe', async () => {
    await expect(service.get(scope)).resolves.toBeNull();
    await service.upsert(scope, input, actorId);

    const connection = await service.get(scope);

    expect(Object.keys(connection!).sort()).toEqual([
      'baseUrl',
      'hasAppKey',
      'lastCheckResult',
      'lastCheckedAt',
      'trustedCertificateSha256',
      'updatedAt',
    ]);
    expect(exposed(connection)).not.toContain(APP_KEY);
  });

  describe('probar', () => {
    it('sin conexión → MIGRATION_SOURCE_NOT_CONFIGURED', async () => {
      await expect(service.test(scope, actorId)).rejects.toBeInstanceOf(ConflictException);
      expect(client.checkVersion).not.toHaveBeenCalled();
    });

    it('usa la clave descifrada y registra OK', async () => {
      await service.upsert(scope, input, actorId);
      client.checkVersion.mockClear();

      const connection = await service.test(scope, actorId);

      expect(client.checkVersion).toHaveBeenCalledWith(
        expect.objectContaining({ appKey: APP_KEY }),
      );
      expect(connection.lastCheckResult).toBe('OK');
      expect(exposed(connection)).not.toContain(APP_KEY);
    });

    it('una clave rechazada queda registrada y se devuelve como error', async () => {
      await service.upsert(scope, input, actorId);
      client.checkVersion.mockRejectedValueOnce(
        new UispApiError('UNAUTHORIZED', 'CREDENCIAL_RECHAZADA', false),
      );

      await expect(service.test(scope, actorId)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(db.state.row!.last_check_result).toBe('UNAUTHORIZED');
      expect(audit.logWithin).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          newValue: expect.objectContaining({ lastCheckResult: 'UNAUTHORIZED' }),
        }),
        expect.anything(),
      );
      expect(exposed()).not.toContain(APP_KEY);
    });

    it('un error que no es de UISP se propaga sin registrar', async () => {
      await service.upsert(scope, input, actorId);
      client.checkVersion.mockRejectedValueOnce(new Error('inesperado'));

      await expect(service.test(scope, actorId)).rejects.toThrow('inesperado');
      expect(db.state.row!.last_check_result).toBe('OK');
    });
  });

  describe('retirar', () => {
    it('sin conexión → 409 MIGRATION_SOURCE_NOT_CONFIGURED (mismo estado que probar y traer)', async () => {
      const error = await service.remove(scope, actorId).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'MIGRATION_SOURCE_NOT_CONFIGURED' });
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('borra la conexión y audita DELETE sin la clave', async () => {
      await service.upsert(scope, input, actorId);
      audit.logWithin.mockClear();

      await service.remove(scope, actorId);

      expect(db.state.row).toBeNull();
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.DELETE, newValue: null }),
        expect.anything(),
      );
      // S-3: las filas de revisión sin resolver (con nombre y correo) se van con la conexión.
      const purge = db.state.sql.findIndex((sql) =>
        sql.includes('DELETE FROM migration_uisp_users'),
      );
      expect(purge).toBeGreaterThan(-1);
      expect(db.state.sql[purge]).toMatch(/status = 'PENDIENTE'/u);
      expect(db.state.params[purge]).toEqual([tenantId]);
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DELETE,
          entityType: 'MigrationUispUsers',
          newValue: { retiroConexion: true, filasPendientesBorradas: 2 },
        }),
        expect.anything(),
      );
      expect(exposed()).not.toContain(APP_KEY);
    });
  });

  it('recordCheck sin conexión no escribe', async () => {
    await expect(service.recordCheck(scope, 'OK', actorId)).resolves.toBeNull();
    expect(audit.logWithin).not.toHaveBeenCalled();
  });
});
