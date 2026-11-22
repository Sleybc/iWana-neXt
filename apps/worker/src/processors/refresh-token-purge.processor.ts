import { Processor, WorkerHost } from '@nestjs/bullmq';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { Pool } from 'pg';
import {
  listSweepableTenants,
  runTenantSweep,
  throwIfTenantSweepFailed,
} from '../common/tenant-sweep';
import { REFRESH_TOKEN_PURGE_QUEUE } from '@iwana/shared';

/**
 * Processor BullMQ para la purga diaria de refresh tokens expirados.
 *
 * Responsabilidad:
 * 1. Obtener los tenants ACTIVE y no retirados del schema público (`listSweepableTenants`).
 * 2. Por cada tenant, en su transacción con `SET LOCAL search_path`, eliminar los
 *    refresh_tokens que cumplan:
 *    - expires_at < NOW() (ya expiró)
 *    - revoked_at IS NOT NULL (además fue revocado explícitamente)
 * 3. Loguear el total de tokens purgados. Una empresa que falla (o con schema inválido) no
 *    detiene a las demás; el job termina fallido nombrándola (`TenantSweepFailedError`).
 *
 * SEGURIDAD:
 * - schema_name se valida con isValidSchemaName() ANTES de interpolarlo en SQL
 *   (`listSweepableTenants`): una empresa con schema inválido se omite con aviso.
 * - Nunca interpolar datos de DB sin validar (previene SQL injection en DDL/DML).
 *
 * IDEMPOTENCIA:
 * - Si el job falla a la mitad, los tokens ya eliminados no se pueden recuperar
 *   (DELETE es irreversible), pero la próxima ejecución limpiará los restantes.
 *   El estado del sistema es siempre convergente hacia "tokens expirados = 0".
 *
 * PGBOUNCER:
 * - Se usa pg.Pool directo (sin TypeORM) para control explícito del cliente.
 *
 * ADR-020: BullMQ para jobs asíncronos
 * HLD-MOD01-ARQUITECTURA-v1.0 Sección 4 (Async workers)
 */
@Injectable()
@Processor(REFRESH_TOKEN_PURGE_QUEUE)
export class RefreshTokenPurgeProcessor extends WorkerHost {
  private readonly logger = new Logger(RefreshTokenPurgeProcessor.name);

  /** Pool de conexiones pg directo para DML sobre schemas de tenant */
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    super();
    this.pool = new Pool({
      host: this.config.get<string>('DB_HOST', 'localhost'),
      port: this.config.get<number>('DB_PORT', 5432),
      user: this.config.get<string>('DB_USER', 'iwana'),
      password: this.config.get<string>('DB_PASSWORD', ''),
      database: this.config.get<string>('DB_NAME', 'iwana'),
      max: 3,
      idleTimeoutMillis: 30000,
    });
  }

  /**
   * Procesa el job de purga de refresh tokens expirados.
   * Se invoca diariamente a las 3am UTC (10pm hora Colombia).
   */
  @SanitizeFailedReason()
  async process(_job: Job): Promise<void> {
    this.logger.log('[purge] Iniciando purga de refresh tokens expirados...');

    const client = await this.pool.connect();
    let totalPurgados = 0;

    try {
      // Empresas ACTIVE y no retiradas (filtro compartido de los barridos del worker).
      const tenants = await listSweepableTenants(client);

      this.logger.log(`[purge] Tenants activos encontrados: ${tenants.length}`);

      // `listSweepableTenants` omite con aviso una empresa con schema inválido (nunca se
      // interpola) y el fallo de una empresa (p. ej. schema sin `refresh_tokens`) no detiene a
      // las demás. Cada empresa en su transacción, con `SET LOCAL search_path` como los demás.
      const { results, failures } = await runTenantSweep(tenants, async (tenant) => {
        await client.query('BEGIN');
        try {
          await client.query(`SET LOCAL search_path TO "${tenant.schemaName}"`);
          // Eliminar tokens que ya expiraron Y fueron revocados explícitamente
          const result = await client.query(
            'DELETE FROM refresh_tokens WHERE expires_at < NOW() AND revoked_at IS NOT NULL',
          );
          await client.query('COMMIT');
          const eliminados = result.rowCount ?? 0;
          if (eliminados > 0) {
            this.logger.debug(`[purge] Tenant ${tenant.id}: ${eliminados} tokens eliminados`);
          }
          return eliminados;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      });
      totalPurgados = results.reduce((sum, count) => sum + count, 0);

      this.logger.log(
        `[purge] Purga completada: ${totalPurgados} refresh tokens eliminados de ${results.length} tenants`,
      );
      throwIfTenantSweepFailed('la purga de refresh tokens', failures);
    } finally {
      // Siempre liberar el cliente al pool, incluso si hubo error
      client.release();
    }
  }
}
