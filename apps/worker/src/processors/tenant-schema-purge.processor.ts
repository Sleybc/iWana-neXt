import { Processor, WorkerHost } from '@nestjs/bullmq';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { Pool } from 'pg';
import { resolvePurgeDbCredentials } from '@iwana/db';
import { TENANT_SCHEMA_PURGE_QUEUE } from '@iwana/shared';

/** Resultados normales de `public.iwana_purge_tenant_schema` (migración pública 029). */
type PurgeOutcome = 'PURGED' | 'SKIPPED_LOCKED' | 'SKIPPED_GONE';

const PURGE_REJECTION = /^TENANT_PURGE_[A-Z_]+$/;

/**
 * Processor BullMQ para la purga física diferida de tenants eliminados (ADR-033).
 *
 * R7 / ADR-108: el procesador ya no ejecuta DDL. Conecta con el rol `iwana_purger`,
 * que solo puede ejecutar dos funciones `SECURITY DEFINER` de la base:
 * `iwana_list_purge_candidates` y `iwana_purge_tenant_schema`. Ellas imponen la
 * elegibilidad (tenant marcado, piso de 30 días, nombre válido, esquema del migrator,
 * exclusión de `tenant_iwana`, sin dependencias externas), bloquean la fila antes del
 * `DROP` y escriben la auditoría en la misma transacción.
 *
 * Un tenant que la base rechaza no detiene el lote: se registra su código y, al final,
 * el job termina en error con el conteo para que BullMQ lo marque como fallido.
 */
@Injectable()
@Processor(TENANT_SCHEMA_PURGE_QUEUE)
export class TenantSchemaPurgeProcessor extends WorkerHost {
  private readonly logger = new Logger(TenantSchemaPurgeProcessor.name);

  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    super();
    const credentials = resolvePurgeDbCredentials({
      NODE_ENV: this.config.get<string>('NODE_ENV'),
      DB_PURGER_USER: this.config.get<string>('DB_PURGER_USER'),
      DB_PURGER_PASSWORD: this.config.get<string>('DB_PURGER_PASSWORD'),
      DB_USER: this.config.get<string>('DB_USER', 'iwana'),
      DB_PASSWORD: this.config.get<string>('DB_PASSWORD', ''),
    });
    if (credentials.fallback) {
      this.logger.warn(
        '[tenant-purge] DB_PURGER_USER no definido: se usa DB_USER y la purga fallará ' +
          '(solo iwana_purger tiene EXECUTE sobre la función de purga). Ver ADR-108.',
      );
    }
    this.pool = new Pool({
      host: this.config.get<string>('DB_HOST', 'localhost'),
      port: this.config.get<number>('DB_PORT', 5432),
      user: credentials.username,
      password: credentials.password,
      database: this.config.get<string>('DB_NAME', 'iwana'),
      max: 2,
      idleTimeoutMillis: 30000,
    });
  }

  @SanitizeFailedReason()
  async process(_job: Job): Promise<void> {
    const retentionDays = this.getRetentionDays();
    const batchSize = this.getBatchSize();
    const client = await this.pool.connect();

    try {
      const { rows: candidates } = await client.query<{ id: string }>(
        'SELECT id::text AS id FROM public.iwana_list_purge_candidates($1::int, $2::int) AS id',
        [retentionDays, batchSize],
      );

      this.logger.log(
        `[tenant-purge] Tenants elegibles: ${candidates.length} (retencion=${retentionDays} dias)`,
      );

      const failures: string[] = [];
      for (const { id } of candidates) {
        try {
          const { rows } = await client.query<{ outcome: PurgeOutcome }>(
            'SELECT public.iwana_purge_tenant_schema($1::uuid, $2::int) AS outcome',
            [id, retentionDays],
          );
          const outcome = rows[0]?.outcome;
          if (outcome === 'PURGED') {
            this.logger.log(`[tenant-purge] Tenant purgado: id=${id}`);
          } else {
            this.logger.warn(`[tenant-purge] Tenant omitido: id=${id} resultado=${outcome}`);
          }
        } catch (error: unknown) {
          const code = this.rejectionCode(error);
          failures.push(code);
          this.logger.error(`[tenant-purge] Tenant no purgado: id=${id} codigo=${code}`);
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `[tenant-purge] ${failures.length} de ${candidates.length} tenants no se purgaron: ` +
            [...new Set(failures)].join(', '),
        );
      }
    } finally {
      client.release();
    }
  }

  /** Código sin datos: el motivo de la función, o el SQLSTATE si es otro error. */
  private rejectionCode(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (PURGE_REJECTION.test(message)) return message;
    const sqlstate = (error as { code?: unknown } | null)?.code;
    return typeof sqlstate === 'string' ? `SQLSTATE_${sqlstate}` : 'UNKNOWN';
  }

  private getRetentionDays(): number {
    const configured = Number(this.config.get<number | string>('TENANT_PURGE_RETENTION_DAYS', 30));
    return Number.isFinite(configured) && configured >= 1 ? configured : 30;
  }

  private getBatchSize(): number {
    const configured = Number(this.config.get<number | string>('TENANT_PURGE_BATCH_SIZE', 20));
    return Number.isFinite(configured) && configured >= 1 ? configured : 20;
  }
}
