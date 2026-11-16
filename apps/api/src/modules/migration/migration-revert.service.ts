import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
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
  type ComplementRecord,
  type MigrationWriteContext,
} from './ports/migration-import.ports';

const REVERTIBLE = new Set(['CARGADO', 'PROMOVIDO', 'CONCILIADO']);

const REVERT_BLOCKED_MESSAGE = 'Hay registros creados después que dependen de este lote.';

/** Mensaje del 409 cuando hay adjuntos añadidos a mano en tickets importados (spec MOD09 §2.3). */
function manualAttachmentsMessage(count: number): string {
  return count === 1
    ? `${REVERT_BLOCKED_MESSAGE} Hay 1 adjunto añadido a mano en un ticket importado: quítalo antes de revertir el lote.`
    : `${REVERT_BLOCKED_MESSAGE} Hay ${count} adjuntos añadidos a mano en tickets importados: quítalos antes de revertir el lote.`;
}

/** 23001: la FK RESTRICT de `ticket_comment_attachments` impidió borrar un comentario. */
function isRestrictViolation(error: unknown): boolean {
  const value = error as { code?: unknown; driverError?: { code?: unknown } } | null;
  return value?.code === '23001' || value?.driverError?.code === '23001';
}

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
 *
 * Adjuntos de tickets (spec MOD09 adjuntos §2.3): se retiran con sus activos antes de borrar los
 * comentarios (FK RESTRICT) y sus objetos se purgan después del commit. Un adjunto añadido a mano
 * en un ticket importado bloquea la reversión (`TICKET_POSTERIOR`) y no se borra nada.
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

  /** `promotion_meta` de los titulares complementados del lote (solo ids, campos y HMAC). */
  private async complementRecords(
    qr: QueryRunner,
    tenantId: string,
    batchId: string,
  ): Promise<ComplementRecord[]> {
    const rows = (await qr.query(
      `SELECT promotion_meta FROM migration_staging_records
        WHERE tenant_id = $1 AND batch_id = $2 AND entity = 'SUSCRIPTOR' AND status = 'PROMOVIDO'
          AND promotion_meta->>'mode' = 'COMPLEMENTO'`,
      [tenantId, batchId],
    )) as Array<{ promotion_meta: Partial<ComplementRecord> | null }>;
    return rows.flatMap(({ promotion_meta: meta }) =>
      meta?.subscriberId
        ? [
            {
              subscriberId: meta.subscriberId,
              linkedExternalId: meta.linkedExternalId ?? null,
              filled: Array.isArray(meta.filled) ? meta.filled : [],
              contactIds: Array.isArray(meta.contactIds) ? meta.contactIds : [],
            },
          ]
        : [],
    );
  }

  async revert(
    scope: MigrationTenantScope,
    batchId: string,
    actorId: string,
  ): Promise<MigrationRevertResult> {
    const { result, keys, attachmentAssets } = await runInTenantSchema(
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
        const ctx: MigrationWriteContext = {
          manager: qr.manager,
          tenantId: scope.tenantId,
          schemaName: scope.schemaName,
          batchId,
          actorId,
        };
        const ids = await this.crm.batchEntityIds(read, batchId);
        // Titulares existentes complementados (spec 2026-11-15 §2.6): nunca se borran.
        const complements = await this.complementRecords(qr, scope.tenantId, batchId);
        if (complements.length > 0) ids.complements = complements;
        const workOrders = await this.workOrders.countReferences(read, ids);
        // Antes que los comentarios (FK RESTRICT). Si algo bloquea, el throw revierte la
        // transacción: filas y activos vuelven y ningún objeto se purga (eso es tras el commit).
        const attachments = await this.support.retireBatchAttachments(ctx);
        const blockers = mergeBlockers([
          ...(await this.crm.revertBlockers(read, batchId, ids)),
          ...(await this.billing.revertBlockers(read, batchId, ids)),
          ...(await this.support.revertBlockers(read, batchId, ids)),
          ...(workOrders > 0
            ? [{ motivo: 'ORDEN_DE_TRABAJO' as const, cantidad: workOrders }]
            : []),
          ...(attachments.manual > 0
            ? [{ motivo: 'TICKET_POSTERIOR' as const, cantidad: attachments.manual }]
            : []),
        ]);
        if (blockers.length > 0) {
          throw new ConflictException({
            code: 'MIGRATION_REVERT_BLOCKED',
            message:
              attachments.manual > 0
                ? manualAttachmentsMessage(attachments.manual)
                : REVERT_BLOCKED_MESSAGE,
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
        const tags = await this.tags.removeImportBatch(scope.tenantId, batchId, {
          manager: qr.manager,
        });
        let support: { tickets: number };
        try {
          support = await this.support.revertBatch(ctx);
        } catch (error) {
          // Un adjunto llegó a un comentario del lote después del retiro (carrera): bloqueo
          // explícito en vez de un 500; la transacción se revierte entera.
          if (!isRestrictViolation(error)) throw error;
          throw new ConflictException({
            code: 'MIGRATION_REVERT_BLOCKED',
            message: manualAttachmentsMessage(1),
            details: { blockers: [{ motivo: 'TICKET_POSTERIOR', cantidad: 1 }] },
          });
        }
        const billing = await this.billing.revertBatch(ctx);
        if (complements.length > 0) await this.crm.revertComplement(ctx, complements);
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
              adjuntosTickets: attachments.attachments,
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
            adjuntosTicketsRetirados: attachments.attachments,
          },
          keys: [...billing.pdfKeys, ...crm.storageKeys],
          attachmentAssets: attachments.mediaAssetIds,
        };
      },
    );
    await this.purgeAttachmentObjects(scope.schemaName, batchId, attachmentAssets);
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

  /** Objetos de los adjuntos retirados (después del commit; un fallo no deshace la reversión). */
  private async purgeAttachmentObjects(
    schemaName: string,
    batchId: string,
    mediaAssetIds: string[],
  ): Promise<void> {
    if (mediaAssetIds.length === 0) return;
    try {
      const failed = await this.support.purgeImportedAttachmentFiles(schemaName, mediaAssetIds);
      if (failed > 0) {
        this.logger.warn(
          `[migration] Lote ${batchId}: no se borraron ${failed} archivos de adjuntos revertidos.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `[migration] Lote ${batchId}: no se borraron los archivos de adjuntos revertidos (${summarizeErrorForLog(error)}).`,
      );
    }
  }
}
