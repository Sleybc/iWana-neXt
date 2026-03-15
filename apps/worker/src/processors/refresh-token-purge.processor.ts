import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { Pool } from 'pg';
import { REFRESH_TOKEN_PURGE_QUEUE } from '@iwana/shared';

/**
 * Fila de resultado interno para la query de tenants activos.
 */
interface TenantRow {
  id: string;
  schema_name: string;
}

/**
 * Processor BullMQ para la purga diaria de refresh tokens expirados.
 *
 * Responsabilidad:
 * 1. Obtener todos los tenants con status ACTIVE del schema público.
 * 2. Por cada tenant, eliminar de su schema los refresh_tokens que cumplan:
 *    - expires_at < NOW() (ya expiró)
 *    - revoked_at IS NOT NULL (además fue revocado explícitamente)
 * 3. Loguear el total de tokens purgados.
 *
 * SEGURIDAD:
 * - schema_name se valida con isValidSchemaName() ANTES de interpolarlo en SQL.
 *   Si la validación falla → UnrecoverableError (no reintentar).
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
  async process(_job: Job): Promise<void> {
    this.logger.log('[purge] Iniciando purga de refresh tokens expirados...');

    const client = await this.pool.connect();
    let totalPurgados = 0;

    try {
      // Obtener todos los tenants activos con su schema name
      const { rows: tenants } = await client.query<TenantRow>(
        "SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'",
      );

      this.logger.log(`[purge] Tenants activos encontrados: ${tenants.length}`);

      for (const tenant of tenants) {
        // Validar schema_name ANTES de interpolarlo en SQL (previene SQL injection)
        if (!isValidSchemaName(tenant.schema_name)) {
          throw new UnrecoverableError(
            `[purge] schema_name inválido detectado: "${tenant.schema_name}" — abortando purga por seguridad`,
          );
        }

        // Eliminar tokens que ya expiraron Y fueron revocados explícitamente
        const result = await client.query(
          `DELETE FROM ${tenant.schema_name}.refresh_tokens WHERE expires_at < NOW() AND revoked_at IS NOT NULL`,
        );

        const eliminados = result.rowCount ?? 0;
        totalPurgados += eliminados;

        if (eliminados > 0) {
          this.logger.debug(
            `[purge] Tenant ${tenant.id} (${tenant.schema_name}): ${eliminados} tokens eliminados`,
          );
        }
      }

      this.logger.log(
        `[purge] Purga completada: ${totalPurgados} refresh tokens eliminados de ${tenants.length} tenants`,
      );
    } finally {
      // Siempre liberar el cliente al pool, incluso si hubo error
      client.release();
    }
  }
}

/**
 * Valida que el schema_name solo contenga caracteres alfanuméricos y guiones bajos,
 * comenzando con una letra minúscula. Máximo 63 caracteres (límite de PostgreSQL).
 *
 * Previene SQL injection al interpoler el schema name directamente en consultas DDL/DML.
 */
function isValidSchemaName(name: string): boolean {
  return /^[a-z][a-z0-9_]{0,62}$/.test(name);
}
