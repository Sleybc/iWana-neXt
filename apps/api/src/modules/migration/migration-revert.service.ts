import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import {
  AuditAction,
  MigrationPromotionReportSchema,
  type MigrationRevertBlocker,
  type MigrationRevertResult,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { SubscriberTagAssignmentPort } from '../crm/ports/subscriber-tag-assignment.port';
import { MIGRATION_AUDIT_ENTITY } from './migration.constants';
import type { MigrationTenantScope } from './migration-batches.service';
import {
  MigrationBillingImportPort,
  MigrationCrmImportPort,
  MigrationSupportImportPort,
  MigrationWorkOrderReferencesPort,
  type MigrationWriteContext,
} from './ports/migration-import.ports';

const REVERTIBLE = new Set(['CARGADO', 'PROMOVIDO', 'CONCILIADO']);

/** Suma bloqueos del mismo motivo que reportan varios módulos. */
function mergeBlockers(blockers: MigrationRevertBlocker[]): MigrationRevertBlocker[] {
  const byReason = new Map<MigrationRevertBlocker['motivo'], number>();
  for (const item of blockers) {
    byReason.set(item.motivo, (byReason.get(item.motivo) ?? 0) + item.cantidad);
  }
  return [...byReason.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad }));
}

/**
 * Reversión por lote (ADR-110 D7; spec §3.3 paso 5). En una sola transacción: comprueba que
 * nada creado después referencie lo del lote (pago, aplicación, documento o periodo, contrato
 * o cambio de estado, ticket, soporte, nota, etiqueta, OT) y, si nada lo bloquea, retira en
 * orden inverso de dependencias: etiquetas → tickets → aplicaciones, documentos y pagos →
 * soportes, historial y contratos → suscriptores → party creados por el lote y huérfanos.
 * Si algo lo bloquea responde 409 con los motivos y no toca nada.
 *
 * Los archivos (PDF importados y soportes) se borran del storage después del commit.
 */
@Injectable()
export class MigrationRevertService {
  private readonly logger = new Logger(MigrationRevertService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly crm: MigrationCrmImportPort,
    private readonly billing: MigrationBillingImportPort,
    private readonly support: MigrationSupportImportPort,
    private readonly workOrders: MigrationWorkOrderReferencesPort,
    private readonly tags: SubscriberTagAssignmentPort,
    private readonly audit: AuditService,
  ) {}

  async revert(
    scope: MigrationTenantScope,
    batchId: string,
    actorId: string,
  ): Promise<MigrationRevertResult> {
    const { result, keys } = await runInTenantSchema(
      this.dataSource,
      scope.schemaName,
      async (qr) => {
        const rows = (await qr.query(
          `SELECT status, promotion FROM migration_batches
            WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [batchId, scope.tenantId],
        )) as Array<{ status: string; promotion: unknown }>;
        const batch = rows[0];
        if (!batch) {
          throw new NotFoundException({
            code: 'MIGRATION_BATCH_NOT_FOUND',
            message: 'El lote no existe.',
          });
        }
        const promotion = MigrationPromotionReportSchema.safeParse(batch.promotion);
        const running =
          batch.status === 'CARGADO' &&
          promotion.success &&
          promotion.data.procesamiento === 'PENDIENTE';
        if (!REVERTIBLE.has(batch.status) || running) {
          throw new ConflictException({
            code: 'MIGRATION_BATCH_NOT_REVERTIBLE',
            message: running
              ? 'La promoción del lote sigue en curso.'
              : 'Solo se revierte un lote cargado, promovido o conciliado.',
          });
        }

        const read = { manager: qr.manager, tenantId: scope.tenantId };
        const ids = await this.crm.batchEntityIds(read, batchId);
        const workOrders = await this.workOrders.countReferences(read, ids);
        const blockers = mergeBlockers([
          ...(await this.crm.revertBlockers(read, batchId, ids)),
          ...(await this.billing.revertBlockers(read, batchId, ids)),
          ...(await this.support.revertBlockers(read, batchId, ids)),
          ...(workOrders > 0
            ? [{ motivo: 'ORDEN_DE_TRABAJO' as const, cantidad: workOrders }]
            : []),
        ]);
        if (blockers.length > 0) {
          throw new ConflictException({
            code: 'MIGRATION_REVERT_BLOCKED',
            message: 'Hay registros creados después que dependen de este lote.',
            details: { blockers },
          });
        }

        const parties = (await qr.query(
          `SELECT DISTINCT promotion_meta->>'partyId' AS party_id
             FROM migration_staging_records
            WHERE tenant_id = $1 AND batch_id = $2 AND entity = 'SUSCRIPTOR'
              AND status = 'PROMOVIDO'
              AND (promotion_meta->>'partyCreated')::boolean IS TRUE`,
          [scope.tenantId, batchId],
        )) as Array<{ party_id: string | null }>;
        const ctx: MigrationWriteContext = {
          manager: qr.manager,
          tenantId: scope.tenantId,
          schemaName: scope.schemaName,
          batchId,
          actorId,
        };
        const tags = await this.tags.removeImportBatch(scope.tenantId, batchId, {
          manager: qr.manager,
        });
        const support = await this.support.revertBatch(ctx);
        const billing = await this.billing.revertBatch(ctx);
        const crm = await this.crm.revertBatch(
          ctx,
          parties.map((row) => row.party_id).filter((id): id is string => !!id),
        );
        await qr.query(
          `UPDATE migration_staging_records SET status = 'REVERTIDO', updated_at = now()
            WHERE tenant_id = $1 AND batch_id = $2 AND status = 'PROMOVIDO'`,
          [scope.tenantId, batchId],
        );
        await qr.query(
          `UPDATE migration_batches
              SET status = 'REVERTIDO', reverted_at = now(), reverted_by = $3, updated_at = now()
            WHERE id = $1 AND tenant_id = $2`,
          [batchId, scope.tenantId, actorId],
        );
        const retirados: MigrationRevertResult['retirados'] = {
          SUSCRIPTOR: crm.subscribers,
          CONTRATO: crm.contracts,
          DOCUMENTO_COBRO: billing.documents,
          PAGO: billing.payments,
          TICKET: support.tickets,
          SOPORTE_DOCUMENTAL: crm.documents,
        };
        await this.audit.logWithin(
          {
            action: AuditAction.DELETE,
            entityType: MIGRATION_AUDIT_ENTITY,
            entityId: batchId,
            userId: actorId,
            tenantId: scope.tenantId,
            schemaName: scope.schemaName,
            oldValue: { status: batch.status },
            newValue: {
              status: 'REVERTIDO',
              retirados,
              aplicaciones: billing.allocations,
              historialSuspension: crm.suspensionRows,
              etiquetas: tags.removed,
            },
          },
          qr.manager,
        );
        return {
          result: {
            id: batchId,
            status: 'REVERTIDO' as const,
            retirados,
            etiquetasRetiradas: tags.removed,
          },
          keys: [...billing.pdfKeys, ...crm.storageKeys],
        };
      },
    );
    for (const key of keys) {
      // H6: solo objetos del propio schema; una clave ajena no se toca.
      if (!key.startsWith(`${scope.schemaName}/`)) {
        this.logger.warn(`[migration] Lote ${batchId}: clave de objeto ajena; se omite.`);
        continue;
      }
      try {
        await this.storage.deleteObject(key);
      } catch (error) {
        this.logger.warn(
          `[migration] Lote ${batchId}: no se borró un archivo revertido (${summarizeErrorForLog(error)}).`,
        );
      }
    }
    return result;
  }
}
