import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import { AuditAction, MigrationBatchCountsSchema } from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import {
  MIGRATION_AUDIT_ENTITY,
  MIGRATION_PURGE_BATCH_SIZE,
  MIGRATION_UISP_USERS_AUDIT_ENTITY,
  MIGRATION_UISP_USERS_PENDING_RETENTION_DAYS,
  migrationObjectKey,
} from './migration.constants';
import type { ResolvedTenant } from './migration-simulation.service';

interface PurgeCandidate {
  id: string;
  counts: unknown;
  source_object_key: string | null;
}

/**
 * Purga a 30 días (ADR-110 D10): borra los ZIP cifrados y las intermedias del lote; el lote
 * conserva conteos y motivos (sin PII). Primero el storage, luego la base: si el borrado del
 * objeto falla, el lote sigue pendiente y la próxima corrida lo reintenta.
 */
@Injectable()
export class MigrationPurgeService {
  private readonly logger = new Logger(MigrationPurgeService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Purga hasta `MIGRATION_PURGE_BATCH_SIZE` lotes vencidos; devuelve cuántos purgó (las filas de
   * usuarios de UISP no cuentan: el número solo decide si hace falta otra vuelta de lotes).
   */
  async purgeTenant(tenant: ResolvedTenant, now: Date = new Date()): Promise<number> {
    await this.purgePendingUispUsers(tenant, now);
    const candidates = (await runInTenantSchema(this.dataSource, tenant.schemaName, (qr) =>
      qr.query(
        `SELECT id, counts, source_object_key FROM migration_batches
          WHERE tenant_id = $1 AND purged_at IS NULL AND purge_after <= $2
          ORDER BY purge_after, id
          LIMIT $3`,
        [tenant.tenantId, now, MIGRATION_PURGE_BATCH_SIZE],
      ),
    )) as PurgeCandidate[];

    let purged = 0;
    for (const candidate of candidates) {
      const prefix = candidate.source_object_key;
      if (prefix) {
        if (!prefix.startsWith(`${tenant.schemaName}/migration/${candidate.id}/`)) {
          this.logger.warn(`[migration] Lote ${candidate.id}: clave de objeto ajena; se omite.`);
          continue;
        }
        const counts = MigrationBatchCountsSchema.safeParse(candidate.counts);
        const files = counts.success ? counts.data.archivos.recibidos : 0;
        for (let index = 0; index < files; index += 1) {
          await this.storage.deleteObject(migrationObjectKey(prefix, index));
        }
      }
      await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
        const deleted = (await qr.query(
          `DELETE FROM migration_staging_records WHERE batch_id = $1 AND tenant_id = $2`,
          [candidate.id, tenant.tenantId],
        )) as [unknown[], number] | unknown[];
        await qr.query(
          `UPDATE migration_batches
              SET purged_at = now(), source_object_key = NULL, updated_at = now()
            WHERE id = $1 AND tenant_id = $2 AND purged_at IS NULL`,
          [candidate.id, tenant.tenantId],
        );
        await this.auditService.logWithin(
          {
            action: AuditAction.UPDATE,
            entityType: MIGRATION_AUDIT_ENTITY,
            entityId: candidate.id,
            userId: null,
            tenantId: tenant.tenantId,
            schemaName: tenant.schemaName,
            newValue: {
              purged: true,
              stagingRowsDeleted:
                Array.isArray(deleted) && typeof deleted[1] === 'number' ? deleted[1] : null,
            },
          },
          qr.manager,
        );
      });
      purged += 1;
    }
    return purged;
  }

  /**
   * Filas de revisión de usuarios de UISP sin resolver cuya última lectura (o alta, si nunca se
   * leyó) tiene más de 30 días: se borran con su nombre y correo (spec «usuarios» §4, D10). Las
   * resueltas ya no guardan PII (CHECK de la 211) y se conservan. Auditoría solo con el conteo.
   */
  private async purgePendingUispUsers(tenant: ResolvedTenant, now: Date): Promise<void> {
    const cutoff = new Date(
      now.getTime() - MIGRATION_UISP_USERS_PENDING_RETENTION_DAYS * 86_400_000,
    );
    await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
      const result = (await qr.query(
        `DELETE FROM migration_uisp_users
          WHERE tenant_id = $1 AND status = 'PENDIENTE'
            AND COALESCE(last_fetched_at, created_at) <= $2
          RETURNING id`,
        [tenant.tenantId, cutoff],
      )) as [unknown[], number] | unknown[];
      const deleted =
        Array.isArray(result) && typeof result[1] === 'number' ? result[1] : result.length;
      if (deleted === 0) return;
      await this.auditService.logWithin(
        {
          action: AuditAction.DELETE,
          entityType: MIGRATION_UISP_USERS_AUDIT_ENTITY,
          entityId: tenant.tenantId,
          userId: null,
          tenantId: tenant.tenantId,
          schemaName: tenant.schemaName,
          newValue: { retencion: 'PENDIENTE_30_DIAS', filasBorradas: deleted },
        },
        qr.manager,
      );
      this.logger.log(
        `[migration] Usuarios de UISP pendientes purgados por retención (tenant=${tenant.tenantId}, filas=${deleted}).`,
      );
    });
  }
}
