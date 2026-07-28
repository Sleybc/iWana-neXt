import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

/**
 * Nombre de la cola para la detección de assets de evidencia huérfanos.
 */
export const EVIDENCE_ORPHAN_DETECTION_QUEUE = 'evidence-orphan-detection';

/**
 * Tipos de operaciones en la cola.
 */
interface OrphanDetectionJobData {
  /** Job recurrente sin payload específico */
  operation: 'detect-and-clean';
  /** ID de correlación para trazabilidad */
  correlationId: string;
}

/**
 * Processor que detecta y limpia assets de evidencia huérfanos.
 *
 * ADR-068: Los assets huérfanos se detectan por ausencia de claim al vencer
 * el TTL aprobado, se soft-deletean con auditoría y se eliminan físicamente
 * mediante job posterior.
 *
 * Flujo:
 * 1. Escanea public.media_assets con usage='execution_evidence'
 * 2. Encuentra assets sin claim_ref (nunca reclamados) con created_at > TTL
 * 3. Soft-delete: actualiza asset_status='EXPIRED', deleted_at=NOW()
 * 4. Eliminación física (fase 2): assets con deleted_at > periodo de retención
 *    se eliminan de MinIO y de la BD
 */
@Injectable()
@Processor(EVIDENCE_ORPHAN_DETECTION_QUEUE)
export class EvidenceOrphanDetectionProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(EvidenceOrphanDetectionProcessor.name);
  private readonly pool: Pool;

  /** TTL para considerar un asset huérfano: 24 horas desde creación */
  private readonly ORPHAN_TTL_HOURS = 24;
  /** Periodo de retención después del soft-delete antes de eliminación física: 7 días */
  private readonly PHYSICAL_DELETE_RETENTION_HOURS = 7 * 24;

  constructor(
    config: ConfigService,
    @InjectQueue(EVIDENCE_ORPHAN_DETECTION_QUEUE)
    private readonly queue: Queue,
  ) {
    super();
    this.pool = new Pool({
      host: config.get<string>('DB_HOST', 'localhost'),
      port: config.get<number>('DB_PORT', 5432),
      user: config.get<string>('DB_USER', 'iwana'),
      password: config.get<string>('DB_PASSWORD', ''),
      database: config.get<string>('DB_NAME', 'iwana'),
      max: 2,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    // Programar job recurrente cada 6 horas
    await this.queue.add(
      'detect-orphans-recurring',
      {
        operation: 'detect-and-clean',
        correlationId: randomUUID(),
      } satisfies OrphanDetectionJobData,
      {
        repeat: { pattern: '0 */6 * * *' },
        jobId: 'evidence-orphan-detection-recurring',
      },
    );
    this.logger.log('Job recurrente de detección de huérfanos programado (cada 6h)');
  }

  async process(job: Job<OrphanDetectionJobData>): Promise<void> {
    const correlationId = job.data?.correlationId ?? randomUUID();
    this.logger.log(`Iniciando detección de huérfanos [correlationId=${correlationId}]`);

    const client = await this.pool.connect();
    try {
      // ── Fase 1: Assets no reclamados (nunca tuvieron claim) ──────────
      await this.softDeleteUnclaimedOrphans(client, correlationId);

      // ── Fase 2: Claims huérfanos (claim set pero evidence no existe) ───
      await this.releaseOrphanClaims(client, correlationId);

      // ── Fase 3: Eliminación física de assets retenidos ────────────────
      await this.physicalDeleteRetained(client, correlationId);
    } catch (error: unknown) {
      this.logger.error(
        `Error en detección de huérfanos [correlationId=${correlationId}]: ${String(error)}`,
      );
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fase 1: Encuentra assets de evidencia que nunca fueron reclamados
   * y cuyo TTL expiró, marcándolos como EXPIRED (soft-delete).
   */
  private async softDeleteUnclaimedOrphans(
    client: PoolClient,
    _correlationId: string,
  ): Promise<void> {
    try {
      await client.query('BEGIN');

      const result = await client.query<{ id: string; object_key: string }>(
        `UPDATE public.media_assets
         SET asset_status = 'EXPIRED',
             deleted_at = NOW(),
             claim_ref = CASE
               WHEN claim_ref IS NULL THEN '[ORPHAN]'
               ELSE claim_ref
             END
         WHERE usage = 'execution_evidence'
           AND asset_status IN ('QUARANTINED', 'AVAILABLE')
           AND claim_ref IS NULL
           AND deleted_at IS NULL
           AND created_at < NOW() - INTERVAL '${this.ORPHAN_TTL_HOURS} hours'
         RETURNING id, object_key`,
      );

      await client.query('COMMIT');

      const count = result.rows.length;
      if (count > 0) {
        this.logger.log(
          `Soft-delete de ${count} assets huérfanos completado. ` +
            `IDs: [${result.rows.map((r) => r.id).join(', ')}]`,
        );
      } else {
        this.logger.log('No se encontraron assets huérfanos en esta ejecución.');
      }
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      this.logger.error(`Error en soft-delete de huérfanos: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Fase 2 (P0-3): Detecta claims huérfanos — assets reclamados
   * (claim_ref IS NOT NULL) cuyo registro de evidencia no existe en
   * el schema tenant correspondiente.
   *
   * ADR-068: el claim en Media (public) puede sobrevivir a un rollback
   * del schema tenant. Este worker reconcilia liberando el claim.
   */
  private async releaseOrphanClaims(client: PoolClient, _correlationId: string): Promise<void> {
    try {
      const claimed = await client.query<{
        id: string;
        claim_ref: string;
      }>(
        `SELECT id, claim_ref
         FROM public.media_assets
         WHERE usage = 'execution_evidence'
           AND claim_ref IS NOT NULL
           AND claim_ref != '[ORPHAN]'
           AND asset_status != 'DELETED'
           AND created_at < NOW() - INTERVAL '10 minutes'
         LIMIT 500`,
      );

      let releasedCount = 0;

      for (const row of claimed.rows) {
        const [schemaName, executionOrderId] = row.claim_ref.split(':');
        if (schemaName === undefined || executionOrderId === undefined) {
          await client.query(
            `UPDATE public.media_assets
             SET claim_ref = NULL, asset_status = 'AVAILABLE'
             WHERE id = $1`,
            [row.id],
          );
          releasedCount++;
          continue;
        }

        // SEC-01: validar schema name contra regex para prevenir SQL injection
        // via interpolación dinámica en queries cross-schema
        if (!/^[a-z][a-z0-9_]*$/i.test(schemaName) || schemaName.length > 63) {
          await client.query(
            `UPDATE public.media_assets
             SET claim_ref = NULL, asset_status = 'AVAILABLE'
             WHERE id = $1`,
            [row.id],
          );
          releasedCount++;
          continue;
        }

        try {
          const evidence = await client.query<{ id: string }>(
            `SELECT id FROM "${schemaName}"."execution_order_evidence"
             WHERE media_asset_id = $1 AND execution_order_id = $2
             LIMIT 1`,
            [row.id, executionOrderId],
          );

          if (evidence.rows.length === 0) {
            await client.query(
              `UPDATE public.media_assets
               SET claim_ref = NULL, asset_status = 'AVAILABLE'
               WHERE id = $1`,
              [row.id],
            );
            releasedCount++;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('does not exist') || msg.includes('no existe')) {
            await client.query(
              `UPDATE public.media_assets
               SET claim_ref = NULL, asset_status = 'AVAILABLE'
               WHERE id = $1`,
              [row.id],
            );
            releasedCount++;
          }
        }
      }

      if (releasedCount > 0) {
        this.logger.log(
          `${releasedCount} claims huérfanos liberados de ${claimed.rows.length} examinados.`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(`Error en liberación de claims huérfanos: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Fase 3: Elimina físicamente los assets que ya pasaron el periodo de
   * retención después del soft-delete. Elimina de MinIO primero y luego de BD.
   *
   * NOTA: La eliminación del objeto físico de MinIO requiere acceso al
   * StoragePort. En esta versión, se registra el intento y se delega a un
   * job futuro. El worker de limpieza de Media (TODO: Phase 03B+) manejará
   * la eliminación física del bucket.
   */
  private async physicalDeleteRetained(client: PoolClient, _correlationId: string): Promise<void> {
    try {
      await client.query('BEGIN');

      // Marcar para eliminación física los assets cuyo soft-delete ya cumplió
      // el periodo de retención
      const result = await client.query<{ id: string; object_key: string }>(
        `UPDATE public.media_assets
         SET asset_status = 'DELETED',
             object_key = object_key -- preservar para trazabilidad
         WHERE usage = 'execution_evidence'
           AND asset_status = 'EXPIRED'
           AND deleted_at IS NOT NULL
           AND deleted_at < NOW() - INTERVAL '${this.PHYSICAL_DELETE_RETENTION_HOURS} hours'
         RETURNING id, object_key`,
      );

      await client.query('COMMIT');

      const count = result.rows.length;
      if (count > 0) {
        this.logger.log(
          `${count} assets marcados para eliminación física. ` +
            `La eliminación del bucket se delega al worker de limpieza de Media.`,
        );
      }
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      this.logger.error(`Error en eliminación física de huérfanos retenidos: ${String(error)}`);
      throw error;
    }
  }
}
