import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';

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
    @Inject(STORAGE_PORT)
    private readonly storage?: Pick<StoragePort, 'deleteObject'>,
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

      // ── Fase 2b: recuperar escrituras cuyo claim falló después del insert ─
      await this.reconcileClaimFailed(client, correlationId);

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
   * Completa el caso de ventana entre el insert de evidence y claimAsset.
   * Si el asset sigue disponible, el worker repite el claim de forma atómica;
   * si otro claim ya ganó, la evidencia queda reflejando el estado real.
   */
  private async reconcileClaimFailed(client: PoolClient, _correlationId: string): Promise<void> {
    const tenants = await client.query<{ schema_name: string }>(
      `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
    );

    for (const tenant of tenants.rows) {
      if (!/^[a-z][a-z0-9_]{0,62}$/i.test(tenant.schema_name)) continue;

      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL search_path TO "${tenant.schema_name}", public`);
        const failed = await client.query<{
          id: string;
          media_asset_id: string;
          execution_order_id: string;
        }>(
          `SELECT id, media_asset_id, execution_order_id
           FROM execution_order_evidence
           WHERE asset_status = 'CLAIM_FAILED' AND media_asset_id IS NOT NULL
           ORDER BY created_at ASC, id ASC
           LIMIT 500`,
        );

        for (const evidence of failed.rows) {
          const claimRef = `${tenant.schema_name}:${evidence.execution_order_id}`;
          const asset = await client.query<{ asset_status: string; claim_ref: string | null }>(
            `SELECT asset_status, claim_ref
             FROM public.media_assets
             WHERE id = $1 AND tenant_schema = $2`,
            [evidence.media_asset_id, tenant.schema_name],
          );
          let current = asset.rows[0];
          if (!current) {
            await client.query(
              `UPDATE execution_order_evidence
               SET asset_status = 'EXPIRED'
               WHERE id = $1 AND asset_status = 'CLAIM_FAILED'`,
              [evidence.id],
            );
            continue;
          }

          if (current.asset_status === 'AVAILABLE' && current.claim_ref === claimRef) {
            await client.query(
              `UPDATE execution_order_evidence
               SET asset_status = 'AVAILABLE'
               WHERE id = $1 AND asset_status = 'CLAIM_FAILED'`,
              [evidence.id],
            );
            continue;
          }

          if (current.asset_status === 'AVAILABLE' && current.claim_ref === null) {
            const claimed = await client.query(
              `UPDATE public.media_assets
               SET claim_ref = $1
               WHERE id = $2 AND tenant_schema = $3
                 AND asset_status = 'AVAILABLE' AND claim_ref IS NULL
                 AND deleted_at IS NULL`,
              [claimRef, evidence.media_asset_id, tenant.schema_name],
            );
            if ((claimed.rowCount ?? 0) > 0) {
              await client.query(
                `UPDATE execution_order_evidence
                 SET asset_status = 'AVAILABLE'
                 WHERE id = $1 AND asset_status = 'CLAIM_FAILED'`,
                [evidence.id],
              );
              continue;
            }

            // Si la actualización perdió una carrera, leer de nuevo antes de
            // clasificar el intento como rechazado.
            const refreshed = await client.query<{
              asset_status: string;
              claim_ref: string | null;
            }>(
              `SELECT asset_status, claim_ref
               FROM public.media_assets
               WHERE id = $1 AND tenant_schema = $2`,
              [evidence.media_asset_id, tenant.schema_name],
            );
            current = refreshed.rows[0] ?? current;
            if (current.asset_status === 'AVAILABLE' && current.claim_ref === claimRef) {
              await client.query(
                `UPDATE execution_order_evidence
                 SET asset_status = 'AVAILABLE'
                 WHERE id = $1 AND asset_status = 'CLAIM_FAILED'`,
                [evidence.id],
              );
              continue;
            }
          }

          // Un claim distinto ya ganó la carrera: este intento no puede
          // recuperarse. Los estados de Media se reflejan sin promover
          // cuarentena ni fabricar una disponibilidad.
          const evidenceStatus = this.mapAssetStatusToEvidenceStatus(
            current.asset_status,
            current.claim_ref,
            claimRef,
          );
          if (evidenceStatus) {
            await client.query(
              `UPDATE execution_order_evidence
               SET asset_status = $1
               WHERE id = $2 AND asset_status = 'CLAIM_FAILED'`,
              [evidenceStatus, evidence.id],
            );
          }
        }
        await client.query('COMMIT');
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  }

  private mapAssetStatusToEvidenceStatus(
    assetStatus: string,
    claimRef: string | null,
    expectedClaimRef: string,
  ): 'PENDING_ANALYSIS' | 'REJECTED' | 'EXPIRED' | null {
    if (assetStatus === 'QUARANTINED') return 'PENDING_ANALYSIS';
    if (assetStatus === 'REJECTED') return 'REJECTED';
    if (assetStatus === 'EXPIRED' || assetStatus === 'DELETED') return 'EXPIRED';
    if (assetStatus === 'AVAILABLE' && claimRef !== expectedClaimRef) return 'REJECTED';
    return null;
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

      const result = await client.query<{ id: string; object_key: string; tenant_schema: string }>(
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
          RETURNING id, object_key, tenant_schema`,
      );

      for (const row of result.rows) {
        await this.writeSoftDeleteAudit(client, row, _correlationId);
      }

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
        const parts = row.claim_ref.split(':');
        if (parts.length !== 2) {
          await client.query(
            `UPDATE public.media_assets
             SET claim_ref = NULL
             WHERE id = $1`,
            [row.id],
          );
          releasedCount++;
          continue;
        }

        const schemaName = parts[0];
        const executionOrderId = parts[1];
        if (schemaName === undefined || executionOrderId === undefined) {
          await client.query(
            `UPDATE public.media_assets
             SET claim_ref = NULL
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
             SET claim_ref = NULL
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
                SET claim_ref = NULL
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
                SET claim_ref = NULL
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
   * La eliminación del objeto físico usa el StoragePort del worker. El estado
   * DELETED solo se confirma después de que el adaptador acepta el borrado.
   */
  private async physicalDeleteRetained(client: PoolClient, _correlationId: string): Promise<void> {
    if (!this.storage) {
      throw new Error('EVIDENCE_STORAGE_CLEANUP_UNAVAILABLE');
    }

    const candidates = await client.query<{
      id: string;
      object_key: string;
      tenant_schema: string;
    }>(
      `SELECT id, object_key, tenant_schema
       FROM public.media_assets
       WHERE usage = 'execution_evidence'
         AND asset_status = 'EXPIRED'
         AND deleted_at IS NOT NULL
         AND deleted_at < NOW() - INTERVAL '${this.PHYSICAL_DELETE_RETENTION_HOURS} hours'
       ORDER BY deleted_at ASC, id ASC
       LIMIT 500`,
    );

    let deletedCount = 0;
    let failedCount = 0;
    for (const candidate of candidates.rows) {
      if (!this.isEvidenceObjectKey(candidate.object_key, candidate.tenant_schema)) {
        failedCount++;
        this.logger.error(`Object key inválido para limpieza [assetId=${candidate.id}]`);
        continue;
      }

      try {
        // El adaptador define deleteObject como idempotente para objetos ausentes.
        await this.storage.deleteObject(candidate.object_key);
        await client.query('BEGIN');
        await client.query(
          `UPDATE public.media_assets
           SET asset_status = 'DELETED'
           WHERE id = $1
             AND usage = 'execution_evidence'
             AND asset_status = 'EXPIRED'
             AND deleted_at IS NOT NULL`,
          [candidate.id],
        );
        await client.query('COMMIT');
        deletedCount++;
      } catch (error: unknown) {
        failedCount++;
        try {
          await client.query('ROLLBACK');
        } catch {
          // El error de rollback no debe ocultar el fallo original.
        }
        this.logger.error(
          `Error al borrar objeto retenido [assetId=${candidate.id}]: ${String(error)}`,
        );
      }
    }

    if (failedCount > 0) {
      throw new Error(`EVIDENCE_PHYSICAL_DELETE_FAILED:${failedCount}`);
    }

    if (deletedCount > 0) {
      this.logger.log(
        `${deletedCount} assets de evidencia eliminados físicamente y marcados DELETED.`,
      );
    }
  }

  private async writeSoftDeleteAudit(
    client: PoolClient,
    asset: { id: string; object_key: string; tenant_schema: string },
    correlationId: string,
  ): Promise<void> {
    if (!/^[a-z][a-z0-9_]{0,62}$/i.test(asset.tenant_schema)) {
      throw new Error('EVIDENCE_TENANT_SCHEMA_INVALID');
    }

    const tenant = await client.query<{ id: string }>(
      `SELECT id FROM public.tenants WHERE schema_name = $1 LIMIT 1`,
      [asset.tenant_schema],
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) {
      throw new Error('EVIDENCE_TENANT_NOT_FOUND');
    }

    await client.query(`SET LOCAL search_path TO "${asset.tenant_schema}", public`);
    await client.query(
      `INSERT INTO "${asset.tenant_schema}".audit_logs
        (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value, request_id)
       VALUES ($1, NULL, $2, $3, $4, NULL, $5::jsonb, $6)`,
      [
        tenantId,
        'DELETE',
        'MediaAsset',
        asset.id,
        JSON.stringify({ assetStatus: 'EXPIRED', reason: 'ORPHAN_TTL' }),
        correlationId,
      ],
    );
  }

  private isEvidenceObjectKey(objectKey: string, tenantSchema: string): boolean {
    if (!/^[a-z][a-z0-9_]{0,62}$/i.test(tenantSchema)) return false;
    return new RegExp(`^${tenantSchema}/execution_evidence/[0-9a-f-]{36}\\.[a-z0-9]+$`, 'i').test(
      objectKey,
    );
  }
}
