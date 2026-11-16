import {
  BadGatewayException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  AuditAction,
  type MigrationSourceCheckResult,
  type MigrationSourceConnection,
  type MigrationSourceConnectionUpsert,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import {
  MIGRATION_SOURCE_CONNECTION_AUDIT_ENTITY,
  MIGRATION_UISP_USERS_AUDIT_ENTITY,
} from './migration.constants';
import { MigrationCrypto } from './migration-crypto';
import type { MigrationTenantScope } from './migration-batches.service';
import { UispApiClient, UispApiError, type UispApiConnection } from './uisp-api/uisp-api.client';

interface ConnectionRow {
  id: string;
  base_url: string;
  app_key_encrypted: string;
  trusted_certificate_sha256: string | null;
  last_checked_at: Date | string | null;
  last_check_result: MigrationSourceCheckResult | null;
  updated_at: Date | string;
}

const COLUMNS = `id, base_url, app_key_encrypted, trusted_certificate_sha256, last_checked_at,
                 last_check_result, updated_at`;

/** TypeORM devuelve `[filas, afectadas]` en UPDATE/DELETE de Postgres y `filas` en lo demás. */
function returningRows(result: unknown): ConnectionRow[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as ConnectionRow[];
  }
  return result as ConnectionRow[];
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/** Respuesta pública: nunca lleva la clave (ni cifrada). */
function toConnection(row: ConnectionRow): MigrationSourceConnection {
  return {
    baseUrl: row.base_url,
    hasAppKey: true,
    trustedCertificateSha256: row.trusted_certificate_sha256,
    lastCheckedAt: row.last_checked_at ? iso(row.last_checked_at) : null,
    lastCheckResult: row.last_check_result,
    updatedAt: iso(row.updated_at),
  };
}

/** Lo que la auditoría guarda de la conexión: sin la clave. */
function auditShape(row: ConnectionRow | null): Record<string, unknown> | null {
  return row
    ? {
        baseUrl: row.base_url,
        trustedCertificateSha256: row.trusted_certificate_sha256,
        lastCheckResult: row.last_check_result,
      }
    : null;
}

export function sourceNotConfigured(): ConflictException {
  return new ConflictException({
    code: 'MIGRATION_SOURCE_NOT_CONFIGURED',
    message: 'Primero registra la conexión con UISP.',
  });
}

/** Error de UISP → respuesta HTTP con código del contrato y motivo técnico sin PII. */
export function uispHttpError(error: UispApiError): Error {
  if (error.kind === 'UNAUTHORIZED') {
    return new UnprocessableEntityException({
      code: 'MIGRATION_SOURCE_UNAUTHORIZED',
      message: 'UISP rechazó la clave de aplicación.',
      details: { reason: error.reason },
    });
  }
  if (error.reason === 'DESTINO_NO_PERMITIDO') {
    // S-1: la dirección apunta a una red interna o reservada. No es un fallo de UISP (502)
    // sino un dato que el administrador debe corregir: 422 con el mismo código y el motivo.
    return new UnprocessableEntityException({
      code: 'MIGRATION_SOURCE_UNREACHABLE',
      message: 'La dirección de UISP apunta a una red interna o reservada.',
      details: { reason: error.reason },
    });
  }
  return new BadGatewayException({
    code: 'MIGRATION_SOURCE_UNREACHABLE',
    message: 'No se pudo conectar con UISP.',
    details: { reason: error.reason },
  });
}

export function checkResultOf(error: UispApiError): MigrationSourceCheckResult {
  return error.kind === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'UNREACHABLE';
}

export interface LoadedSourceConnection {
  id: string;
  connection: UispApiConnection;
}

/**
 * Conexión con UISP por tenant (ADR-110 D15; spec 2026-11-15 «usuarios» §2.1): una por tenant,
 * clave cifrada con la clave PII y nunca devuelta, prueba con `GET /version` antes de guardar,
 * auditoría en la misma transacción sin la clave.
 */
@Injectable()
export class MigrationSourceConnectionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: MigrationCrypto,
    private readonly auditService: AuditService,
    private readonly client: UispApiClient,
  ) {}

  async get(scope: MigrationTenantScope): Promise<MigrationSourceConnection | null> {
    return runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const row = await this.select(qr.manager, scope.tenantId, false);
      return row ? toConnection(row) : null;
    });
  }

  async upsert(
    scope: MigrationTenantScope,
    input: MigrationSourceConnectionUpsert,
    actorId: string,
  ): Promise<MigrationSourceConnection> {
    const trusted = input.trustedCertificateSha256 ?? null;
    try {
      await this.client.checkVersion({
        baseUrl: input.baseUrl,
        appKey: input.appKey,
        trustedCertificateSha256: trusted,
      });
    } catch (error) {
      if (error instanceof UispApiError) throw uispHttpError(error);
      throw error;
    }
    return runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const before = await this.select(qr.manager, scope.tenantId, true);
      const [row] = (await qr.query(
        `INSERT INTO migration_source_connections
           (tenant_id, source_system, base_url, app_key_encrypted, trusted_certificate_sha256,
            last_checked_at, last_check_result, created_by)
         VALUES ($1, 'UISP', $2, $3, $4, now(), 'OK', $5)
         ON CONFLICT (tenant_id, source_system) DO UPDATE
           SET base_url = EXCLUDED.base_url,
               app_key_encrypted = EXCLUDED.app_key_encrypted,
               trusted_certificate_sha256 = EXCLUDED.trusted_certificate_sha256,
               last_checked_at = EXCLUDED.last_checked_at,
               last_check_result = EXCLUDED.last_check_result,
               updated_by = $5, updated_at = now()
         RETURNING ${COLUMNS}`,
        [scope.tenantId, input.baseUrl, this.crypto.encryptText(input.appKey), trusted, actorId],
      )) as ConnectionRow[];
      await this.audit(
        qr.manager,
        scope,
        before ? AuditAction.UPDATE : AuditAction.CREATE,
        row!.id,
        actorId,
        before,
        row!,
      );
      return toConnection(row!);
    });
  }

  /** Prueba la conexión guardada y registra el resultado; si falla, lo devuelve como error. */
  async test(scope: MigrationTenantScope, actorId: string): Promise<MigrationSourceConnection> {
    const loaded = await this.load(scope);
    if (!loaded) throw sourceNotConfigured();
    let failure: UispApiError | null = null;
    try {
      await this.client.checkVersion(loaded.connection);
    } catch (error) {
      if (!(error instanceof UispApiError)) throw error;
      failure = error;
    }
    const connection = await this.recordCheck(
      scope,
      failure ? checkResultOf(failure) : 'OK',
      actorId,
    );
    if (failure) throw uispHttpError(failure);
    if (!connection) throw sourceNotConfigured();
    return connection;
  }

  async remove(scope: MigrationTenantScope, actorId: string): Promise<void> {
    await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const [deleted] = returningRows(
        await qr.query(
          `DELETE FROM migration_source_connections
            WHERE tenant_id = $1 AND source_system = 'UISP'
            RETURNING ${COLUMNS}`,
          [scope.tenantId],
        ),
      );
      // Mismo 409 que probar y traer: no hay conexión es un estado del tenant, no una ruta ausente.
      if (!deleted) throw sourceNotConfigured();
      await this.audit(qr.manager, scope, AuditAction.DELETE, deleted.id, actorId, deleted, null);
      await this.purgePendingReviewRows(qr.manager, scope, actorId);
    });
  }

  /**
   * S-3: al retirar la conexión se borran las filas de revisión sin resolver (nombre y correo
   * traídos con esa clave). Sin conexión no se pueden refrescar y una lectura futura las recrea.
   * Las resueltas no guardan PII (CHECK de la 211) y se conservan. Auditoría solo con el conteo.
   */
  private async purgePendingReviewRows(
    manager: EntityManager,
    scope: MigrationTenantScope,
    actorId: string,
  ): Promise<void> {
    const result = (await manager.query(
      `DELETE FROM migration_uisp_users
        WHERE tenant_id = $1 AND status = 'PENDIENTE'
        RETURNING id`,
      [scope.tenantId],
    )) as unknown;
    const deleted =
      Array.isArray(result) && typeof result[1] === 'number'
        ? result[1]
        : Array.isArray(result)
          ? result.length
          : 0;
    if (deleted === 0) return;
    await this.auditService.logWithin(
      {
        action: AuditAction.DELETE,
        entityType: MIGRATION_UISP_USERS_AUDIT_ENTITY,
        entityId: scope.tenantId,
        userId: actorId,
        tenantId: scope.tenantId,
        schemaName: scope.schemaName,
        newValue: { retiroConexion: true, filasPendientesBorradas: deleted },
      },
      manager,
    );
  }

  /** Conexión con la clave descifrada, solo para uso interno (job y prueba). */
  async load(scope: MigrationTenantScope): Promise<LoadedSourceConnection | null> {
    const row = await runInTenantSchema(this.dataSource, scope.schemaName, (qr) =>
      this.select(qr.manager, scope.tenantId, false),
    );
    if (!row) return null;
    return {
      id: row.id,
      connection: {
        baseUrl: row.base_url,
        appKey: this.crypto.decryptText(row.app_key_encrypted),
        trustedCertificateSha256: row.trusted_certificate_sha256,
      },
    };
  }

  /** Deja constancia del resultado de la última llamada a UISP (prueba o lectura). */
  async recordCheck(
    scope: MigrationTenantScope,
    result: MigrationSourceCheckResult,
    actorId: string,
  ): Promise<MigrationSourceConnection | null> {
    return runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const before = await this.select(qr.manager, scope.tenantId, true);
      if (!before) return null;
      const [after] = returningRows(
        await qr.query(
          `UPDATE migration_source_connections
              SET last_checked_at = now(), last_check_result = $2
            WHERE id = $1 AND tenant_id = $3
            RETURNING ${COLUMNS}`,
          [before.id, result, scope.tenantId],
        ),
      );
      if (!after) return null;
      await this.audit(qr.manager, scope, AuditAction.UPDATE, after.id, actorId, before, after);
      return toConnection(after);
    });
  }

  private async select(
    manager: EntityManager,
    tenantId: string,
    lock: boolean,
  ): Promise<ConnectionRow | null> {
    const rows = (await manager.query(
      `SELECT ${COLUMNS} FROM migration_source_connections
        WHERE tenant_id = $1 AND source_system = 'UISP'${lock ? ' FOR UPDATE' : ''}`,
      [tenantId],
    )) as ConnectionRow[];
    return rows[0] ?? null;
  }

  private audit(
    manager: EntityManager,
    scope: MigrationTenantScope,
    action: AuditAction,
    entityId: string,
    actorId: string,
    before: ConnectionRow | null,
    after: ConnectionRow | null,
  ): Promise<void> {
    return this.auditService.logWithin(
      {
        action,
        entityType: MIGRATION_SOURCE_CONNECTION_AUDIT_ENTITY,
        entityId,
        userId: actorId,
        tenantId: scope.tenantId,
        schemaName: scope.schemaName,
        oldValue: auditShape(before),
        newValue: auditShape(after),
      },
      manager,
    );
  }
}
