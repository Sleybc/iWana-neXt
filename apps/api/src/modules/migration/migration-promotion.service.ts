import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { TenantContext, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import { ENCRYPTED_OBJECT_CONTENT_TYPE, STORAGE_PORT, type StoragePort } from '@iwana/storage';
import {
  AuditAction,
  BILLING_PAYMENT_METHODS,
  MIGRATION_IMPORT_PROMOTE_JOB,
  MIGRATION_IMPORT_QUEUE,
  MigrationBatchCountsSchema,
  MigrationPromotionReportSchema,
  type BillingPaymentMethod,
  type MigrationAuthorsRefreshResult,
  type MigrationBatchRejections,
  type MigrationEntity,
  type MigrationMappingAction,
  type MigrationMappingKind,
  type MigrationPromoteAccepted,
  type MigrationPromoteJob,
  type MigrationPromotionReport,
  type MigrationReconciliationDifference,
  type MigrationReconciliationReport,
  type MigrationRejectionReason,
  type MigrationTicketAttachmentsReport,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { SubscriberTagAssignmentPort } from '../crm/ports/subscriber-tag-assignment.port';
import { MigrationCrypto } from './migration-crypto';
import {
  MIGRATION_AUDIT_ENTITY,
  MIGRATION_PURGE_TIME_ZONE,
  migrationObjectKey,
} from './migration.constants';
import type { MigrationTenantScope } from './migration-batches.service';
import {
  MigrationBatchNotVisibleError,
  MigrationPermanentError,
  MigrationSimulationService,
  type ResolvedTenant,
} from './migration-simulation.service';
import {
  MigrationBillingImportPort,
  MigrationCrmImportPort,
  MigrationSupportImportPort,
  type ImportedAuthorChange,
  type ImportedPaymentAuthor,
  type ImportedTicketAuthors,
  type ImportedTicketComment,
  type ImportedTicketCreated,
  type MigrationReadContext,
  type MigrationWriteContext,
} from './ports/migration-import.ports';
import { MigrationTitularLookupPort } from './ports/migration-titular-lookup.port';
import { MigrationUserDirectoryPort } from './ports/migration-user-directory.port';
import { packageEntries } from './uisp/uisp-parser';
import { importedText, titularPersonFields } from './uisp/uisp-titular-required';
import {
  amount,
  cents,
  centsToMoney,
  civilDate,
  contractDates,
  contractStatus,
  documentKind,
  individualPrice,
  instant,
  invoiceLines,
  invoiceServiceId,
  isPdf,
  paymentCovers,
  serviceAddress,
  serviceAlias,
  subscriberContacts,
  suspensionPeriods,
  ticketStatus,
} from './uisp/uisp-promotion-mapping';
import {
  paymentAttribution,
  referencedUserNumbers,
  ticketAttribution,
  type UispUserResolver,
} from './uisp/uisp-user-attribution';
import {
  addTicketAttachmentCount,
  emptyTicketAttachmentsReport,
  findTicketAttachmentFile,
  sumTicketAttachmentReports,
  ticketAttachmentFolder,
  ticketAttachmentPlan,
  type UispTicketAttachmentPlan,
} from './uisp/uisp-ticket-attachments';
import { SafeZipError, readZipEntries } from './zip/safe-zip-reader';

export const MIGRATION_PROMOTE_ATTEMPTS = 3;

/** Carga útil de una intermedia (la escribe `uisp-simulation`). */
interface StagedPayload {
  source: { fileIndex: number; index?: number; pdfPath?: string | null; path?: string };
  raw: Record<string, unknown> | null;
  derived: Record<string, unknown> & { clientExternalId?: string };
}

interface StagedRow {
  id: string;
  entity: MigrationEntity;
  external_id: string;
  status: 'VALIDO' | 'RECHAZADO' | 'PROMOVIDO' | 'REVERTIDO';
  rejection_reason: string | null;
  payload: StagedPayload;
}

interface TitularGroup {
  subscriber: StagedRow;
  rows: StagedRow[];
}

type MappingIndex = Map<
  MigrationMappingKind,
  Map<string, { action: MigrationMappingAction; target: string | null }>
>;

/** Resultado de un registro dentro de la transacción del titular. */
type Outcome =
  | { kind: 'created'; id: string; meta?: Record<string, unknown> }
  | { kind: 'existing'; id: string; meta?: Record<string, unknown> }
  | { kind: 'rejected'; reason: MigrationRejectionReason };

class TitularRejected extends Error {
  constructor(readonly reason: MigrationRejectionReason) {
    super(reason);
  }
}

/** Tipo de entidad de auditoría de cada fila re-atribuida por «Actualizar autores» (S-4). */
const AUTHOR_CHANGE_AUDIT_ENTITY: Record<ImportedAuthorChange['entity'], string> = {
  TICKET: 'SupportTicket',
  TICKET_COMMENT: 'TicketComment',
  TICKET_COMMENT_ATTACHMENT: 'TicketCommentAttachment',
  PAYMENT: 'BillingPayment',
};

function emptyPromotion(): MigrationPromotionReport {
  return {
    procesamiento: 'PENDIENTE',
    promovidos: {},
    existentes: {},
    rechazados: {},
    etiquetasAsignadas: 0,
    periodosSuspension: 0,
    aplicaciones: 0,
    adjuntosTickets: { importados: 0, existentes: 0, noImportados: {} },
    iniciadoEn: null,
    terminadoEn: null,
  };
}

const text = importedText;

/** `promotion_meta.adjuntos` del ticket solo si hubo algún adjunto (las demás filas no cambian). */
function withAttachments(
  meta: Record<string, unknown>,
  report: MigrationTicketAttachmentsReport,
): Record<string, unknown> {
  const touched =
    report.importados + report.existentes + Object.values(report.noImportados).length > 0;
  return touched ? { ...meta, adjuntos: report } : meta;
}

/** Id de UISP del registro (`uisp:<entidad>:<id>`). */
function sourceIdOf(externalId: string): string {
  return externalId.slice(externalId.lastIndexOf(':') + 1);
}

/** Suscriptor existente que este titular complementa (lo fija la simulación), o `null`. */
function complementTarget(row: StagedRow): string | null {
  const value = row.payload.derived['complementSubscriberId'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Fecha civil de hoy en Bogotá (`YYYY-MM-DD`). */
function bogotaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MIGRATION_PURGE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function coordinate(value: unknown): number | null {
  const number = amount(value);
  return number === null ? null : number;
}

/**
 * Promoción idempotente y conciliación de un lote (ADR-110 D3, D5, D6; spec §3.3 pasos 3–4).
 *
 * - `requestPromotion`: lote `SIMULADO` (simulación completa) o `CARGADO` → `CARGADO`, audita y
 *   encola el job en la misma transacción. Payload: solo identificadores (D9).
 * - `promote` (job): una transacción por titular; cada registro busca primero su `external_id`
 *   (índice único parcial) y reutiliza lo existente. Repetir no duplica. Rechazos de negocio
 *   quedan en la intermedia con motivo; un titular rechazado arrastra a sus dependientes.
 * - `reconcile`: compara por titular facturado, pagado y saldo de iWana con los de UISP.
 *   Sin diferencias → `CONCILIADO`; con diferencias el lote queda `PROMOVIDO` con el informe.
 *
 * Nunca escribe datos del titular en logs ni en la cola; el informe solo trae ids y montos.
 */
@Injectable()
export class MigrationPromotionService {
  private readonly logger = new Logger(MigrationPromotionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @InjectQueue(MIGRATION_IMPORT_QUEUE) private readonly queue: Queue,
    private readonly crypto: MigrationCrypto,
    private readonly simulation: MigrationSimulationService,
    private readonly titularLookup: MigrationTitularLookupPort,
    private readonly crm: MigrationCrmImportPort,
    private readonly billing: MigrationBillingImportPort,
    private readonly support: MigrationSupportImportPort,
    private readonly tags: SubscriberTagAssignmentPort,
    private readonly audit: AuditService,
    private readonly users: MigrationUserDirectoryPort,
  ) {}

  // ── Solicitud (HTTP) ────────────────────────────────────────────────────────────────

  async requestPromotion(
    scope: MigrationTenantScope,
    batchId: string,
    actorId: string,
  ): Promise<MigrationPromoteAccepted> {
    return runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const batch = await this.lockBatch(qr, scope.tenantId, batchId);
      if (batch.purged_at) throw this.conflict('MIGRATION_BATCH_PURGED', 'El lote ya fue purgado.');
      const counts = MigrationBatchCountsSchema.safeParse(batch.counts);
      const promotion = MigrationPromotionReportSchema.safeParse(batch.promotion);
      const simulated =
        batch.status === 'SIMULADO' && counts.success && counts.data.procesamiento === 'COMPLETADO';
      const retry =
        batch.status === 'CARGADO' &&
        (!promotion.success || promotion.data.procesamiento !== 'PENDIENTE');
      if (!simulated && !retry) {
        throw this.conflict(
          'MIGRATION_BATCH_NOT_PROMOTABLE',
          'Solo se promueve un lote simulado o una promoción interrumpida.',
        );
      }
      await qr.query(
        `UPDATE migration_batches
            SET status = 'CARGADO', promotion = $3::jsonb, promoted_by = $4, updated_at = now()
          WHERE id = $1 AND tenant_id = $2`,
        [batchId, scope.tenantId, JSON.stringify(emptyPromotion()), actorId],
      );
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: MIGRATION_AUDIT_ENTITY,
          entityId: batchId,
          userId: actorId,
          tenantId: scope.tenantId,
          schemaName: scope.schemaName,
          oldValue: { status: batch.status },
          newValue: { status: 'CARGADO', action: 'PROMOVER' },
        },
        qr.manager,
      );
      const payload: MigrationPromoteJob = {
        version: 1,
        tenantId: scope.tenantId,
        batchId,
        actorId,
      };
      try {
        await this.queue.add(MIGRATION_IMPORT_PROMOTE_JOB, payload, {
          jobId: `migration-promote-${batchId}-${randomUUID()}`,
          attempts: MIGRATION_PROMOTE_ATTEMPTS,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
        });
      } catch (error) {
        this.logger.error(
          `[migration] No se pudo encolar la promoción del lote ${batchId}: ${summarizeErrorForLog(error)}`,
        );
        throw new ServiceUnavailableException({
          code: 'MIGRATION_ENQUEUE_FAILED',
          message: 'No se pudo iniciar la promoción. Intenta de nuevo.',
        });
      }
      return { id: batchId, status: 'CARGADO' as const };
    });
  }

  // ── Job ─────────────────────────────────────────────────────────────────────────────

  async promote(
    tenantId: string,
    batchId: string,
    actorId: string,
  ): Promise<'PROMOVIDO' | 'CONCILIADO' | 'OMITIDO'> {
    const tenant = await this.simulation.resolveTenant(tenantId);
    // El job no hereda el contexto del request: el catálogo comercial (snapshot del plan) lo
    // exige, y sin él todo contrato caía en PLAN_SIN_EQUIVALENCIA.
    return TenantContext.run(
      {
        tenantId: tenant.tenantId,
        schemaName: tenant.schemaName,
        tenantSlug: tenant.tenantSlug ?? '',
      },
      () => this.promoteInContext(tenant, batchId, actorId),
    );
  }

  private async promoteInContext(
    tenant: ResolvedTenant,
    batchId: string,
    actorId: string,
  ): Promise<'PROMOVIDO' | 'CONCILIADO' | 'OMITIDO'> {
    const batch = await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT status, purged_at, source_object_key, counts FROM migration_batches
          WHERE id = $1 AND tenant_id = $2`,
        [batchId, tenant.tenantId],
      )) as Array<{
        status: string;
        purged_at: unknown;
        source_object_key: string | null;
        counts: unknown;
      }>;
      return rows[0] ?? null;
    });
    if (!batch) throw new MigrationBatchNotVisibleError();
    if (batch.status !== 'CARGADO' || batch.purged_at || !batch.source_object_key) {
      return 'OMITIDO';
    }
    const startedAt = new Date().toISOString();
    // Las equivalencias resueltas tras la simulación deben pesar en la promoción (D4).
    await this.simulation.restageForPromotion(tenant, batchId);
    const groups = await this.loadGroups(tenant, batchId);
    const mappings = await this.loadMappings(tenant);
    const resolveUser = await runInTenantSchema(this.dataSource, tenant.schemaName, (qr) =>
      this.userResolver(qr, tenant.tenantId, mappings),
    );
    const prefix = batch.source_object_key;
    if (prefix !== `${tenant.schemaName}/migration/${batchId}/`) {
      throw new MigrationPermanentError('MIGRATION_OBJECT_KEY_MISMATCH');
    }
    const counts = MigrationBatchCountsSchema.safeParse(batch.counts);
    const fileCount = counts.success ? counts.data.archivos.recibidos : 0;

    for (const group of groups) {
      // H3: un ZIP a la vez y solo las entradas que este titular referencia.
      const entries = await this.loadTitularFiles(prefix, fileCount, group);
      const uploaded: string[] = [];
      // Activos de adjuntos de tickets subidos en esta transacción (spec MOD09 adjuntos §2.3).
      const attachmentAssets: string[] = [];
      let continued: boolean;
      try {
        continued = await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
          const state = (await qr.query(
            `SELECT status FROM migration_batches WHERE id = $1 AND tenant_id = $2 FOR SHARE`,
            [batchId, tenant.tenantId],
          )) as Array<{ status: string }>;
          if (state[0]?.status !== 'CARGADO') return false;
          await this.promoteTitular(
            qr,
            tenant,
            batchId,
            actorId,
            group,
            mappings,
            entries,
            uploaded,
            resolveUser,
            attachmentAssets,
          );
          return true;
        });
      } catch (error) {
        // Compensación: la transacción del titular no se confirmó; sus objetos no deben quedar.
        await this.deleteUploaded(uploaded);
        await this.purgeAttachmentObjects(tenant.schemaName, attachmentAssets);
        throw error;
      }
      if (!continued) return 'OMITIDO';
    }

    const report = await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
      const promotion = await this.buildPromotionReport(qr, tenant.tenantId, batchId, startedAt);
      await qr.query(
        `UPDATE migration_batches
            SET status = 'PROMOVIDO', promotion = $3::jsonb, promoted_at = now(), updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND status = 'CARGADO'`,
        [batchId, tenant.tenantId, JSON.stringify(promotion)],
      );
      await this.recordDifferingObservation(qr, tenant.tenantId, batchId);
      await this.recordUnlinkedUsers(
        qr,
        tenant.tenantId,
        batchId,
        await this.attributedRecords(qr, tenant.tenantId, batchId),
        resolveUser,
      );
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: MIGRATION_AUDIT_ENTITY,
          entityId: batchId,
          userId: actorId,
          tenantId: tenant.tenantId,
          schemaName: tenant.schemaName,
          newValue: {
            status: 'PROMOVIDO',
            promovidos: promotion.promovidos,
            existentes: promotion.existentes,
            adjuntosTickets: promotion.adjuntosTickets,
          },
        },
        qr.manager,
      );
      return promotion;
    });
    this.logger.log(
      `[migration] Lote ${batchId} promovido (titulares=${groups.length}, ` +
        `suscriptores=${report.promovidos.SUSCRIPTOR ?? 0}).`,
    );
    const reconciliation = await this.reconcileTenant(tenant, batchId, actorId);
    return reconciliation.resultado === 'CONCILIADO' ? 'CONCILIADO' : 'PROMOVIDO';
  }

  /** Último intento fallido: deja la promoción en `FALLIDO` para que pueda reintentarse. */
  async markFailed(tenantId: string, batchId: string): Promise<void> {
    const tenant = await this.simulation.resolveTenant(tenantId);
    await runInTenantSchema(this.dataSource, tenant.schemaName, (qr) =>
      qr.query(
        `UPDATE migration_batches
            SET promotion = jsonb_set(COALESCE(promotion, '{}'::jsonb), '{procesamiento}', '"FALLIDO"'::jsonb),
                updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND status = 'CARGADO'`,
        [batchId, tenant.tenantId],
      ),
    );
  }

  // ── Conciliación (D6) ───────────────────────────────────────────────────────────────

  async reconcile(
    scope: MigrationTenantScope,
    batchId: string,
    actorId: string,
  ): Promise<MigrationReconciliationReport> {
    const status = await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT status, purged_at FROM migration_batches WHERE id = $1 AND tenant_id = $2`,
        [batchId, scope.tenantId],
      )) as Array<{ status: string; purged_at: unknown }>;
      return rows[0] ?? null;
    });
    if (!status) {
      throw new NotFoundException({
        code: 'MIGRATION_BATCH_NOT_FOUND',
        message: 'El lote no existe.',
      });
    }
    if (status.purged_at) throw this.conflict('MIGRATION_BATCH_PURGED', 'El lote ya fue purgado.');
    if (status.status !== 'PROMOVIDO' && status.status !== 'CONCILIADO') {
      throw this.conflict(
        'MIGRATION_BATCH_NOT_RECONCILABLE',
        'Solo se concilia un lote promovido.',
      );
    }
    return this.reconcileTenant(scope, batchId, actorId);
  }

  private async reconcileTenant(
    tenant: ResolvedTenant,
    batchId: string,
    actorId: string,
  ): Promise<MigrationReconciliationReport> {
    return runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
      const locked = (await qr.query(
        `SELECT status FROM migration_batches WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [batchId, tenant.tenantId],
      )) as Array<{ status: string }>;
      const rows = await this.stagedRows(qr, tenant.tenantId, batchId, [
        'PROMOVIDO',
        'VALIDO',
        'RECHAZADO',
      ]);
      const uisp = new Map<
        string,
        {
          subscriberId: string;
          complement: boolean;
          billed: number;
          paid: number;
          balance: number;
        }
      >();
      for (const row of rows) {
        if (row.entity === 'SUSCRIPTOR' && row.status === 'PROMOVIDO') {
          const promoted = await this.promotedInfo(qr, tenant.tenantId, row.id);
          if (!promoted) continue;
          const accountBalance = amount(row.payload.raw?.['accountBalance']) ?? 0;
          // En UISP el saldo negativo es deuda; en iWana el saldo es facturado − pagado.
          uisp.set(row.external_id, {
            subscriberId: promoted.id,
            complement: promoted.mode === 'COMPLEMENTO',
            billed: 0,
            paid: 0,
            balance: -cents(accountBalance),
          });
        }
      }
      for (const row of rows) {
        const owner = uisp.get(String(row.payload.derived.clientExternalId ?? ''));
        if (!owner) continue;
        if (row.entity === 'DOCUMENTO_COBRO')
          owner.billed += cents(amount(row.payload.raw?.['total']) ?? 0);
        if (row.entity === 'PAGO') owner.paid += cents(amount(row.payload.raw?.['amount']) ?? 0);
      }
      const read = { manager: qr.manager, tenantId: tenant.tenantId };
      const owners = [...uisp.values()];
      // Complementado (§2.5): solo lo importado de UISP; las facturas propias no concilian.
      const totals = new Map([
        ...(await this.billing.totalsBySubscriber(
          read,
          owners.filter((value) => !value.complement).map((value) => value.subscriberId),
        )),
        ...(await this.billing.importedTotalsBySubscriber(
          read,
          owners.filter((value) => value.complement).map((value) => value.subscriberId),
        )),
      ]);
      const differences: MigrationReconciliationDifference[] = [];
      for (const [externalId, value] of uisp) {
        const own = totals.get(value.subscriberId) ?? { billedCents: 0, paidCents: 0 };
        const ownBalance = own.billedCents - own.paidCents;
        if (
          own.billedCents !== value.billed ||
          own.paidCents !== value.paid ||
          ownBalance !== value.balance
        ) {
          differences.push({
            subscriberId: value.subscriberId,
            externalId,
            facturado: { uisp: centsToMoney(value.billed), iwana: centsToMoney(own.billedCents) },
            pagado: { uisp: centsToMoney(value.paid), iwana: centsToMoney(own.paidCents) },
            saldo: { uisp: centsToMoney(value.balance), iwana: centsToMoney(ownBalance) },
          });
        }
      }
      const report: MigrationReconciliationReport = {
        resultado: differences.length === 0 ? 'CONCILIADO' : 'CON_DIFERENCIAS',
        titulares: uisp.size,
        conciliados: uisp.size - differences.length,
        diferencias: differences,
        calculadoEn: new Date().toISOString(),
      };
      const nextStatus = report.resultado === 'CONCILIADO' ? 'CONCILIADO' : 'PROMOVIDO';
      if (locked[0]?.status === 'PROMOVIDO' || locked[0]?.status === 'CONCILIADO') {
        await qr.query(
          `UPDATE migration_batches
              SET reconciliation = $3::jsonb, status = $4,
                  reconciled_at = CASE WHEN $5::boolean THEN now() ELSE NULL END,
                  updated_at = now()
            WHERE id = $1 AND tenant_id = $2`,
          [
            batchId,
            tenant.tenantId,
            JSON.stringify(report),
            nextStatus,
            nextStatus === 'CONCILIADO',
          ],
        );
        await this.audit.logWithin(
          {
            action: AuditAction.UPDATE,
            entityType: MIGRATION_AUDIT_ENTITY,
            entityId: batchId,
            userId: actorId,
            tenantId: tenant.tenantId,
            schemaName: tenant.schemaName,
            newValue: {
              status: nextStatus,
              titulares: report.titulares,
              conDiferencias: differences.length,
            },
          },
          qr.manager,
        );
      }
      return report;
    });
  }

  // ── «Actualizar autores» (spec 2026-11-15 «usuarios» §2.7) ──────────────────────────

  /**
   * Re-atribuye lo ya importado con las equivalencias `USUARIO` vigentes, sin reimportar: recorre
   * las intermedias promovidas del lote (tickets y pagos que este lote creó) y, por los puertos
   * de Soporte y Facturación, cambia asignado, creador, autores y registrador solo donde siguen
   * a nombre de quien importó (creador o promotor del lote). Lo cambiado después se respeta y
   * se cuenta. Idempotente. Recalcula «Usuarios de UISP sin enlazar» y audita en la misma
   * transacción, solo con conteos.
   */
  async refreshAuthors(
    scope: MigrationTenantScope,
    batchId: string,
    actorId: string,
  ): Promise<MigrationAuthorsRefreshResult> {
    return runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT status, purged_at, created_by::text AS created_by, promoted_by::text AS promoted_by
           FROM migration_batches WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [batchId, scope.tenantId],
      )) as Array<{
        status: string;
        purged_at: unknown;
        created_by: string | null;
        promoted_by: string | null;
      }>;
      const batch = rows[0];
      if (!batch) {
        throw new NotFoundException({
          code: 'MIGRATION_BATCH_NOT_FOUND',
          message: 'El lote no existe.',
        });
      }
      if (batch.purged_at) {
        throw this.conflict(
          'MIGRATION_BATCH_PURGED',
          'Las intermedias del lote ya se purgaron: no se pueden actualizar los autores.',
        );
      }
      if (batch.status !== 'PROMOVIDO' && batch.status !== 'CONCILIADO') {
        throw this.conflict(
          'MIGRATION_BATCH_NOT_RECONCILABLE',
          'Solo se actualizan los autores de un lote promovido o conciliado.',
        );
      }
      const mappings = await this.readMappings(qr, scope.tenantId);
      const resolveUser = await this.userResolver(qr, scope.tenantId, mappings);
      const records = await this.attributedRecords(qr, scope.tenantId, batchId);

      const tickets: ImportedTicketAuthors[] = [];
      const payments: ImportedPaymentAuthor[] = [];
      for (const record of records) {
        if (record.entity === 'TICKET') {
          const attribution = ticketAttribution(record.payload.raw, resolveUser);
          if (
            attribution.assignedUserId === null &&
            attribution.createdByUserId === null &&
            attribution.comments.every((comment) => comment.authorUserId === null)
          ) {
            continue;
          }
          tickets.push({
            ticketId: record.promotedId,
            assignedUserId: attribution.assignedUserId,
            createdByUserId: attribution.createdByUserId,
            comments: attribution.comments.map((comment) => ({
              body: comment.body,
              createdAt: comment.createdAt,
              authorUserId: comment.authorUserId,
            })),
          });
        } else {
          const { createdBy } = paymentAttribution(record.payload.raw, resolveUser);
          if (createdBy !== null) payments.push({ paymentId: record.promotedId, createdBy });
        }
      }

      // Quien subió o promovió el lote y quien quedó registrado en cada fila (un reintento de la
      // promoción pudo correr con otro actor).
      const importerIds = [
        ...new Set(
          [
            batch.created_by,
            batch.promoted_by,
            ...records.map((record) => record.importedBy),
          ].filter((id): id is string => !!id),
        ),
      ];
      const ctx = {
        manager: qr.manager,
        tenantId: scope.tenantId,
        schemaName: scope.schemaName,
        batchId,
        actorId,
        importerIds,
      };
      const support = await this.support.refreshImportedAuthors(ctx, tickets);
      const billing = await this.billing.refreshImportedPaymentAuthors(ctx, payments);
      // S-4: cada fila cambiada queda auditada con su valor anterior y nuevo (solo ids).
      for (const change of [...support.changes, ...billing.changes]) {
        await this.audit.logWithin(
          {
            action: AuditAction.UPDATE,
            entityType: AUTHOR_CHANGE_AUDIT_ENTITY[change.entity],
            entityId: change.id,
            userId: actorId,
            tenantId: scope.tenantId,
            schemaName: scope.schemaName,
            oldValue: { [change.field]: change.from },
            newValue: { [change.field]: change.to, origen: 'ACTUALIZAR_AUTORES', batchId },
          },
          qr.manager,
        );
      }
      const sinEnlazar = await this.recordUnlinkedUsers(
        qr,
        scope.tenantId,
        batchId,
        records,
        resolveUser,
      );
      const result: MigrationAuthorsRefreshResult = {
        tickets: support.tickets,
        comentarios: support.comments,
        pagos: billing.payments,
        respetados: support.respected + billing.respected,
        sinEnlazar,
      };
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: MIGRATION_AUDIT_ENTITY,
          entityId: batchId,
          userId: actorId,
          tenantId: scope.tenantId,
          schemaName: scope.schemaName,
          newValue: { action: 'ACTUALIZAR_AUTORES', ...result },
        },
        qr.manager,
      );
      return result;
    });
  }

  /**
   * Traductor número de UISP → usuario de iWana: solo equivalencias `EQUIVALE` cuyo usuario
   * sigue vigente (Usuarios, por puerto). Un usuario borrado cuenta como sin enlazar.
   */
  private async userResolver(
    qr: QueryRunner,
    tenantId: string,
    mappings: MappingIndex,
  ): Promise<UispUserResolver> {
    const byNumber = new Map<string, string>();
    for (const [number, mapping] of mappings.get('USUARIO') ?? []) {
      if (mapping.action === 'EQUIVALE' && mapping.target) {
        byNumber.set(number, mapping.target.toLowerCase());
      }
    }
    const targets = [...new Set(byNumber.values())];
    const existing =
      targets.length === 0
        ? new Set<string>()
        : await this.users.existingUserIds({ manager: qr.manager, tenantId }, targets);
    return (number) => {
      const target = byNumber.get(number);
      return target !== undefined && existing.has(target) ? target : null;
    };
  }

  /**
   * Intermedias de tickets y pagos que este lote creó (promovidas y no `existing`): las únicas
   * cuya atribución decide el lote.
   */
  private async attributedRecords(
    qr: QueryRunner,
    tenantId: string,
    batchId: string,
  ): Promise<Array<StagedRow & { promotedId: string; importedBy: string | null }>> {
    const rows = (await qr.query(
      `SELECT id, entity, external_id, status, rejection_reason, payload_encrypted,
              promoted_entity_id::text AS promoted_id, promotion_meta->>'importedBy' AS imported_by
         FROM migration_staging_records
        WHERE tenant_id = $1 AND batch_id = $2 AND status = 'PROMOVIDO'
          AND entity IN ('TICKET', 'PAGO') AND promoted_entity_id IS NOT NULL
          AND NOT COALESCE((promotion_meta->>'existing')::boolean, false)
        ORDER BY created_at, id`,
      [tenantId, batchId],
    )) as Array<
      Omit<StagedRow, 'payload'> & {
        payload_encrypted: string;
        promoted_id: string;
        imported_by: string | null;
      }
    >;
    return rows.map(({ payload_encrypted, promoted_id, imported_by, ...row }) => ({
      ...row,
      promotedId: promoted_id,
      importedBy: imported_by ?? null,
      payload: this.crypto.decryptPayload<StagedPayload>(payload_encrypted),
    }));
  }

  /**
   * «Usuarios de UISP sin enlazar» (spec §2.6): números distintos referenciados por lo que el
   * lote atribuye y que no resuelven a un usuario vigente. Va en `counts.observaciones` (como
   * `DATO_DISTINTO_EN_UISP`), recalculado desde las intermedias: un reintento no lo duplica y
   * sin pendientes la clave no aparece. Solo el conteo, sin números ni nombres.
   */
  private async recordUnlinkedUsers(
    qr: QueryRunner,
    tenantId: string,
    batchId: string,
    records: StagedRow[],
    resolveUser: UispUserResolver,
  ): Promise<number> {
    const unlinked = new Set<string>();
    for (const record of records) {
      for (const number of referencedUserNumbers(record.entity, record.payload.raw)) {
        if (resolveUser(number) === null) unlinked.add(number);
      }
    }
    await qr.query(
      `UPDATE migration_batches
          SET counts = jsonb_set(
                counts, '{observaciones}',
                CASE WHEN $3::int > 0
                     THEN COALESCE(counts->'observaciones', '{}'::jsonb)
                          || jsonb_build_object('USUARIO_UISP_SIN_ENLAZAR', $3::int)
                     ELSE COALESCE(counts->'observaciones', '{}'::jsonb) - 'USUARIO_UISP_SIN_ENLAZAR'
                END),
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND counts IS NOT NULL`,
      [tenantId, batchId, unlinked.size],
    );
    return unlinked.size;
  }

  // ── Promoción de un titular ─────────────────────────────────────────────────────────

  private async promoteTitular(
    qr: QueryRunner,
    tenant: ResolvedTenant,
    batchId: string,
    actorId: string,
    group: TitularGroup,
    mappings: MappingIndex,
    entries: Map<string, Buffer>,
    uploaded: string[],
    resolveUser: UispUserResolver,
    attachmentAssets: string[] = [],
  ): Promise<void> {
    const ctx: MigrationWriteContext = {
      manager: qr.manager,
      tenantId: tenant.tenantId,
      schemaName: tenant.schemaName,
      batchId,
      actorId,
    };
    await qr.query('SAVEPOINT migration_titular');
    let subscriberId: string;
    try {
      subscriberId = await this.promoteSubscriber(qr, ctx, group.subscriber, mappings);
    } catch (error) {
      if (!(error instanceof TitularRejected)) throw error;
      await qr.query('ROLLBACK TO SAVEPOINT migration_titular');
      await this.reject(qr, group.subscriber, error.reason);
      for (const row of group.rows) {
        if (row.status === 'VALIDO') await this.reject(qr, row, 'DEPENDE_DE_TITULAR_RECHAZADO');
      }
      return;
    }
    await qr.query('RELEASE SAVEPOINT migration_titular');

    const contractsByService = new Map<string, string>();
    const documentsByInvoice = new Map<string, string>();
    const paymentsById = new Map<string, string>();

    const byEntity = (entity: MigrationEntity) => group.rows.filter((row) => row.entity === entity);
    const sourceId = (row: StagedRow) =>
      row.external_id.slice(row.external_id.lastIndexOf(':') + 1);

    // Lo ya promovido (corrida anterior o lote anterior) también resuelve dependencias.
    const known = async (row: StagedRow, find: (ids: string[]) => Promise<Map<string, string>>) =>
      (await find([row.external_id])).get(row.external_id) ?? null;
    const read = { manager: qr.manager, tenantId: tenant.tenantId };

    for (const row of byEntity('CONTRATO')) {
      const outcome = await this.apply(qr, row, async () => {
        const existing = await known(row, (ids) => this.crm.findContracts(read, ids));
        if (existing) return { kind: 'existing', id: existing };
        const raw = row.payload.raw ?? {};
        const plan = this.mapped(mappings, 'PLAN', raw['servicePlanId']);
        if (!plan?.target) return { kind: 'rejected', reason: 'PLAN_SIN_EQUIVALENCIA' };
        const cycleRaw = raw['invoicingPeriodStartDay'];
        let cycleDay: number | null = null;
        if (cycleRaw !== null && cycleRaw !== undefined) {
          const cycle = this.mapped(mappings, 'CICLO', cycleRaw);
          if (!cycle?.target) return { kind: 'rejected', reason: 'CICLO_SIN_EQUIVALENCIA' };
          cycleDay = Number(cycle.target);
        }
        const stratum = group.subscriber.payload.derived['stratum'] as { value: number } | null;
        const dates = contractDates(raw);
        // Titular complementado (§2.3): contrato histórico, siempre terminado; no aprovisiona ni
        // factura. Fin = fecha de fin de UISP o la de promoción (civil Bogotá).
        const historical = complementTarget(group.subscriber) !== null;
        const created = await this.crm.createContract(ctx, {
          externalId: row.external_id,
          subscriberId,
          planId: plan.target,
          billingCycleDay: cycleDay,
          status: historical ? 'TERMINATED' : contractStatus(raw['status']),
          startDate: dates.startDate,
          endDate: historical ? (dates.endDate ?? bogotaToday()) : dates.endDate,
          individualPrice: individualPrice(raw),
          stratum: stratum?.value ?? null,
          personType:
            group.subscriber.payload.derived['documentType'] === 'NIT' ? 'JURIDICA' : 'NATURAL',
          alias: serviceAlias(raw),
          installationAddress: serviceAddress(raw),
        });
        if ('rejected' in created) return { kind: 'rejected', reason: created.rejected };
        const contractId = created.id;
        const suspensionRows = await this.crm.recordSuspensionHistory(ctx, {
          contractId,
          subscriberId,
          periods: suspensionPeriods(raw),
        });
        return { kind: 'created', id: contractId, meta: { suspensionRows } };
      });
      if (outcome) contractsByService.set(sourceId(row), outcome);
    }
    const firstContract = [...contractsByService.values()][0] ?? null;

    for (const row of byEntity('DOCUMENTO_COBRO')) {
      const outcome = await this.apply(qr, row, async () => {
        const existing = await known(row, (ids) => this.billing.findDocuments(read, ids));
        if (existing) return { kind: 'existing', id: existing };
        const raw = row.payload.raw ?? {};
        const serviceId = invoiceServiceId(raw);
        const contractId =
          (serviceId ? contractsByService.get(serviceId) : undefined) ?? firstContract;
        if (!contractId) return { kind: 'rejected', reason: 'SIN_CONTRATO_ASOCIADO' };
        const total = amount(raw['total']);
        const issueDate = civilDate(raw['createdDate']);
        if (total === null || total < 0 || !issueDate) {
          return { kind: 'rejected', reason: 'MONTO_O_FECHA_INVALIDOS' };
        }
        let pdfKey: string | null = null;
        const pdfPath = row.payload.source.pdfPath;
        if (pdfPath) {
          const content = entries.get(pdfPath);
          if (!content || !isPdf(content)) return { kind: 'rejected', reason: 'ARCHIVO_AUSENTE' };
          // Clave dictada por Billing y determinista por external_id; cifrado IWE1 (H1).
          pdfKey = this.billing.importedPdfStorageKey(tenant.schemaName, row.external_id);
          await this.putEncrypted(pdfKey, content, uploaded);
        }
        const id = await this.billing.createImportedDocument(ctx, {
          externalId: row.external_id,
          externalNumber:
            raw['number'] === null || raw['number'] === undefined ? null : String(raw['number']),
          contractId,
          subscriberId,
          issueDate,
          dueDate: civilDate(raw['dueDate']) ?? issueDate,
          total,
          lines: invoiceLines(raw, total),
          pdfKey,
        });
        return { kind: 'created', id };
      });
      if (outcome) documentsByInvoice.set(sourceId(row), outcome);
    }

    for (const row of byEntity('PAGO')) {
      const outcome = await this.apply(qr, row, async () => {
        const existing = await known(row, (ids) => this.billing.findPayments(read, ids));
        if (existing) return { kind: 'existing', id: existing };
        const raw = row.payload.raw ?? {};
        const method = this.mapped(mappings, 'METODO_PAGO', raw['methodId']);
        if (
          !method?.target ||
          !(BILLING_PAYMENT_METHODS as readonly string[]).includes(method.target)
        ) {
          return { kind: 'rejected', reason: 'METODO_PAGO_SIN_EQUIVALENCIA' };
        }
        const value = amount(raw['amount']);
        const paidAt = civilDate(raw['createdDate']);
        if (value === null || value <= 0 || !paidAt) {
          return { kind: 'rejected', reason: 'MONTO_O_FECHA_INVALIDOS' };
        }
        const id = await this.billing.createImportedPayment(ctx, {
          externalId: row.external_id,
          subscriberId,
          method: method.target as BillingPaymentMethod,
          amount: value,
          paidAt,
          createdBy: paymentAttribution(raw, resolveUser).createdBy,
        });
        // Quién importó esta fila: «Actualizar autores» solo cambia lo que sigue a su nombre.
        return { kind: 'created', id, meta: { importedBy: ctx.actorId } };
      });
      if (outcome) paymentsById.set(sourceId(row), outcome);
    }

    // Coberturas → aplicaciones (solo entre pago y documento de este titular).
    for (const row of byEntity('PAGO')) {
      const paymentId = paymentsById.get(sourceId(row));
      if (!paymentId) continue;
      let allocations = 0;
      for (const cover of paymentCovers(row.payload.raw)) {
        const documentId = documentsByInvoice.get(cover.invoiceId);
        if (!documentId) continue;
        if (
          await this.billing.allocateImported(ctx, {
            paymentId,
            documentId,
            amount: cover.amount,
          })
        ) {
          allocations += 1;
        }
      }
      if (allocations > 0) {
        await qr.query(
          `UPDATE migration_staging_records
              SET promotion_meta = COALESCE(promotion_meta, '{}'::jsonb) || jsonb_build_object('allocations', $2::int)
            WHERE id = $1`,
          [row.id, allocations],
        );
      }
    }

    for (const row of byEntity('TICKET')) {
      await this.apply(qr, row, async () => {
        const raw = row.payload.raw ?? {};
        const plan = ticketAttachmentPlan(raw);
        const existing = await known(row, (ids) => this.support.findTickets(read, ids));
        if (existing) {
          const adjuntos = await this.existingTicketAttachments(read, plan);
          return { kind: 'existing', id: existing, meta: withAttachments({}, adjuntos) };
        }
        const attribution = ticketAttribution(raw, resolveUser);
        const created = await this.support.createImportedTicket(ctx, {
          externalId: row.external_id,
          sourceId: sourceId(row),
          subscriberId,
          subject: text(raw['subject'], 200) ?? 'Ticket importado',
          status: ticketStatus(raw['status']),
          createdAt: instant(raw['createdAt']),
          comments: attribution.comments,
          assignedUserId: attribution.assignedUserId,
          createdByUserId: attribution.createdByUserId,
        });
        const adjuntos = await this.importTicketAttachments(ctx, {
          created,
          plan,
          comments: attribution.comments,
          ticketSourceId: sourceId(row),
          entries,
          attachmentAssets,
        });
        return {
          kind: 'created',
          id: created.ticketId,
          meta: withAttachments({ importedBy: ctx.actorId }, adjuntos),
        };
      });
    }

    for (const row of byEntity('SOPORTE_DOCUMENTAL')) {
      await this.apply(qr, row, async () => {
        const existing = await known(row, (ids) => this.crm.findDocuments(read, ids));
        if (existing) return { kind: 'existing', id: existing };
        const path = row.payload.source.path;
        const content = path ? entries.get(path) : undefined;
        if (!content) return { kind: 'rejected', reason: 'ARCHIVO_AUSENTE' };
        // H7: la huella se recalcula sobre lo que de verdad se guarda.
        const sha256 = createHash('sha256').update(content).digest('hex');
        const detected = documentKind(content);
        const storageKey = this.crm.subscriberDocumentStorageKey(
          tenant.schemaName,
          row.external_id,
          detected.extension,
        );
        await this.putEncrypted(storageKey, content, uploaded);
        const id = await this.crm.createSubscriberDocument(ctx, {
          externalId: row.external_id,
          subscriberId,
          kind: detected.kind,
          contentType: detected.contentType,
          sizeBytes: content.length,
          sha256,
          storageKey,
        });
        return { kind: 'created', id };
      });
    }
  }

  private async promoteSubscriber(
    qr: QueryRunner,
    ctx: MigrationWriteContext,
    row: StagedRow,
    mappings: MappingIndex,
  ): Promise<string> {
    const read = { manager: qr.manager, tenantId: ctx.tenantId };
    const existing = (await this.crm.findSubscribers(read, [row.external_id])).get(row.external_id);
    if (existing?.anonymized) throw new TitularRejected('TITULAR_ANONIMIZADO');
    // Una baja conserva su `external_id` en el índice único: no se reutiliza ni se recrea.
    if (existing?.deleted) throw new TitularRejected('TITULAR_EXISTENTE');
    if (existing) {
      // Reimportar a un titular complementado por otro lote: sigue conciliando solo lo de UISP.
      const complemented = await this.complementedBefore(qr, ctx.tenantId, existing.id);
      await this.markPromoted(
        qr,
        row,
        existing.id,
        complemented
          ? {
              existing: true,
              mode: 'COMPLEMENTO',
              subscriberId: existing.id,
              linkedExternalId: null,
              filled: [],
              differing: [],
              contactIds: [],
            }
          : { existing: true },
      );
      return existing.id;
    }
    if (row.status !== 'VALIDO') throw new TitularRejected('DATOS_INVALIDOS');
    const derived = row.payload.derived;
    const raw = row.payload.raw ?? {};
    const complementId = complementTarget(row);
    if (complementId) return this.promoteComplement(qr, ctx, row, mappings, complementId);
    const documentNumber =
      typeof derived['documentNumber'] === 'string' ? derived['documentNumber'] : null;
    if (documentNumber) {
      // Entre la simulación y la promoción pudo darse de alta el mismo titular (D11).
      const facts = await this.titularLookup.lookup(qr, {
        tenantId: ctx.tenantId,
        documentHmacs: [this.crypto.documentHmac(documentNumber)],
        externalIds: [],
      });
      if (facts.existingHmacs.size > 0) throw new TitularRejected('TITULAR_EXISTENTE');
    }
    const tagRefs = Array.isArray(derived['tagRefs']) ? (derived['tagRefs'] as string[]) : [];
    for (const tag of tagRefs) {
      if (!this.mapped(mappings, 'ETIQUETA', tag))
        throw new TitularRejected('ETIQUETA_SIN_EQUIVALENCIA');
    }
    const contacts = subscriberContacts(raw);
    const coordinatesDiscarded = derived['coordinatesDiscarded'] === true;
    const juridica = derived['documentType'] === 'NIT';
    const stratum = (derived['stratum'] as { value: number } | null)?.value ?? null;
    // `chk_subscriber_person_fields` de CRM: la misma regla que anticipa la simulación.
    const { firstName, lastName, businessName, complete } = titularPersonFields(raw, {
      documentType: juridica ? 'NIT' : 'CC',
      documentNumber,
      stratum,
    });
    if (!complete || !documentNumber) throw new TitularRejected('DATOS_OBLIGATORIOS_AUSENTES');
    const created = await this.crm.createSubscriber(ctx, {
      externalId: row.external_id,
      personType: juridica ? 'JURIDICA' : 'NATURAL',
      documentType: juridica ? 'NIT' : 'CC',
      documentNumber,
      stratum: juridica ? null : stratum,
      firstName,
      lastName,
      businessName,
      email: contacts.email,
      phone: contacts.phone,
      altContactName: contacts.altContactName,
      altContactPhone: contacts.altContactPhone,
      additionalContacts: contacts.additionalContacts,
      address: text(raw['fullAddress'], 500) ?? text(raw['street1'], 500),
      city: text(raw['city'], 100),
      latitude: coordinatesDiscarded ? null : coordinate(raw['addressGpsLat']),
      longitude: coordinatesDiscarded ? null : coordinate(raw['addressGpsLon']),
      registeredOn: civilDate(raw['registrationDate']),
    });
    const tagsAssigned = await this.assignTags(qr, ctx, created.subscriberId, tagRefs, mappings);
    await this.markPromoted(qr, row, created.subscriberId, {
      partyId: created.partyId,
      partyCreated: created.partyCreated,
      tags: tagsAssigned,
    });
    return created.subscriberId;
  }

  /**
   * Titular de UISP que complementa un suscriptor existente (spec 2026-11-15 §2.3–§2.4). Dentro
   * del savepoint del titular revalida C2.1–C2.4 (puede haber cambiado desde la simulación),
   * enlaza `external_id` si está vacío, completa solo campos vacíos y asigna las etiquetas
   * equivalentes. Nunca crea suscriptor ni le escribe `import_batch_id`.
   */
  private async promoteComplement(
    qr: QueryRunner,
    ctx: MigrationWriteContext,
    row: StagedRow,
    mappings: MappingIndex,
    subscriberId: string,
  ): Promise<string> {
    const derived = row.payload.derived;
    const raw = row.payload.raw ?? {};
    const clientId = row.external_id.slice(row.external_id.lastIndexOf(':') + 1);
    if (this.mapped(mappings, 'TITULAR', clientId)?.target !== subscriberId) {
      throw new TitularRejected('TITULAR_EXISTENTE');
    }
    const target = await this.titularLookup.titularTarget(qr, ctx.tenantId, subscriberId);
    if (!target || target.restricted) throw new TitularRejected('TITULAR_EXISTENTE');
    if (target.externalId !== null && target.externalId !== row.external_id) {
      throw new TitularRejected('TITULAR_VINCULADO_A_OTRO_CLIENTE');
    }
    const documentNumber =
      typeof derived['documentNumber'] === 'string' ? derived['documentNumber'] : null;
    if (!documentNumber) throw new TitularRejected('TITULAR_EXISTENTE');
    const hmac = this.crypto.documentHmac(documentNumber);
    const facts = await this.titularLookup.lookup(qr, {
      tenantId: ctx.tenantId,
      documentHmacs: [hmac],
      externalIds: [],
    });
    if (facts.subscriberIdByHmac.get(hmac) !== subscriberId) {
      throw new TitularRejected('TITULAR_EXISTENTE');
    }
    const tagRefs = Array.isArray(derived['tagRefs']) ? (derived['tagRefs'] as string[]) : [];
    for (const tag of tagRefs) {
      if (!this.mapped(mappings, 'ETIQUETA', tag))
        throw new TitularRejected('ETIQUETA_SIN_EQUIVALENCIA');
    }

    const linked = await this.crm.linkComplement(ctx, subscriberId, row.external_id);
    const contacts = subscriberContacts(raw);
    const coordinatesDiscarded = derived['coordinatesDiscarded'] === true;
    const fill = await this.crm.fillEmptyFields(ctx, {
      subscriberId,
      email: contacts.email,
      phone: contacts.phone,
      altContactName: contacts.altContactName,
      altContactPhone: contacts.altContactPhone,
      additionalContacts: contacts.additionalContacts,
      address: text(raw['fullAddress'], 500) ?? text(raw['street1'], 500),
      city: text(raw['city'], 100),
      latitude: coordinatesDiscarded ? null : coordinate(raw['addressGpsLat']),
      longitude: coordinatesDiscarded ? null : coordinate(raw['addressGpsLon']),
    });
    const tagsAssigned = await this.assignTags(qr, ctx, subscriberId, tagRefs, mappings);
    // Sin valores: solo nombres de campo, HMAC e ids (D9). `existing` lo cuenta como existente.
    await this.markPromoted(qr, row, subscriberId, {
      mode: 'COMPLEMENTO',
      existing: true,
      subscriberId,
      linkedExternalId: linked ? row.external_id : null,
      filled: fill.filled,
      differing: fill.differing,
      contactIds: fill.contactIds,
      tags: tagsAssigned,
    });
    return subscriberId;
  }

  private async assignTags(
    qr: QueryRunner,
    ctx: MigrationWriteContext,
    subscriberId: string,
    tagRefs: string[],
    mappings: MappingIndex,
  ): Promise<number> {
    let tagsAssigned = 0;
    for (const tag of tagRefs) {
      const mapping = this.mapped(mappings, 'ETIQUETA', tag)!;
      if (mapping.action !== 'EQUIVALE' || !mapping.target) continue;
      try {
        const result = await this.tags.assignForImport(
          {
            tenantId: ctx.tenantId,
            subscriberId,
            tagId: mapping.target,
            tagName: mapping.target,
            importBatchId: ctx.batchId,
            actorId: ctx.actorId,
          },
          { manager: qr.manager },
        );
        if (result.assigned) tagsAssigned += 1;
      } catch (error) {
        if (error instanceof NotFoundException)
          throw new TitularRejected('ETIQUETA_SIN_EQUIVALENCIA');
        throw error;
      }
    }
    return tagsAssigned;
  }

  /**
   * Ejecuta la promoción de un registro con su propio punto de guardado: un rechazo deshace
   * solo ese registro. Devuelve el id creado o existente, o `null` si se rechazó.
   */
  private async apply(
    qr: QueryRunner,
    row: StagedRow,
    run: () => Promise<Outcome>,
  ): Promise<string | null> {
    if (row.status === 'RECHAZADO' || row.status === 'REVERTIDO') return null;
    await qr.query('SAVEPOINT migration_record');
    const outcome = await run();
    if (outcome.kind === 'rejected') {
      await qr.query('ROLLBACK TO SAVEPOINT migration_record');
      await this.reject(qr, row, outcome.reason);
      return null;
    }
    await qr.query('RELEASE SAVEPOINT migration_record');
    await this.markPromoted(
      qr,
      row,
      outcome.id,
      outcome.kind === 'existing'
        ? { existing: true, ...(outcome.meta ?? {}) }
        : (outcome.meta ?? {}),
    );
    return outcome.id;
  }

  /**
   * Adjuntos de los comentarios de un ticket recién creado (spec MOD09 adjuntos §2.3). Cada
   * archivo se busca solo en `tickets/<ticket>/` del ZIP; uno ausente, con nombre inseguro o
   * rechazado por Soporte (firma, tipo, tamaño) se cuenta por motivo y su comentario queda igual.
   */
  private async importTicketAttachments(
    ctx: MigrationWriteContext,
    input: {
      created: ImportedTicketCreated;
      plan: UispTicketAttachmentPlan;
      comments: ReadonlyArray<ImportedTicketComment>;
      ticketSourceId: string;
      entries: ReadonlyMap<string, Buffer>;
      attachmentAssets: string[];
    },
  ): Promise<MigrationTicketAttachmentsReport> {
    const report = emptyTicketAttachmentsReport();
    addTicketAttachmentCount(
      report,
      { status: 'SKIPPED', reason: 'COMENTARIO_NO_IMPORTADO' },
      input.plan.orphaned,
    );
    for (const [index, item] of input.plan.byComment.entries()) {
      addTicketAttachmentCount(
        report,
        { status: 'SKIPPED', reason: 'NOMBRE_INVALIDO' },
        item.invalid,
      );
      const commentId = input.created.commentIds[index] ?? null;
      for (const ref of item.refs) {
        if (!commentId) {
          addTicketAttachmentCount(report, {
            status: 'SKIPPED',
            reason: 'COMENTARIO_NO_IMPORTADO',
          });
          continue;
        }
        const buffer = findTicketAttachmentFile(input.entries, input.ticketSourceId, ref.filename);
        if (!buffer) {
          addTicketAttachmentCount(report, { status: 'SKIPPED', reason: 'ARCHIVO_AUSENTE' });
          continue;
        }
        const result = await this.support.createImportedAttachment(ctx, {
          ticketId: input.created.ticketId,
          commentId,
          externalId: ref.externalId,
          filename: ref.filename,
          declaredContentType: ref.declaredContentType,
          buffer,
          uploadedByUserId: input.comments[index]?.authorUserId ?? null,
        });
        if (result.status === 'CREATED') input.attachmentAssets.push(result.mediaAssetId);
        addTicketAttachmentCount(report, result);
      }
    }
    return report;
  }

  /**
   * Ticket que ya existía (reintento o reimportación): sus adjuntos no se vuelven a subir. Los
   * que existen por `external_id` cuentan como existentes; los demás no tienen comentario de
   * este lote donde colgarse (`COMENTARIO_NO_IMPORTADO`).
   */
  private async existingTicketAttachments(
    read: MigrationReadContext,
    plan: UispTicketAttachmentPlan,
  ): Promise<MigrationTicketAttachmentsReport> {
    const report = emptyTicketAttachmentsReport();
    const refs = plan.byComment.flatMap((item) => item.refs);
    const found =
      refs.length === 0
        ? new Set<string>()
        : await this.support.findAttachments(read, [...new Set(refs.map((ref) => ref.externalId))]);
    for (const ref of refs) {
      addTicketAttachmentCount(
        report,
        found.has(ref.externalId)
          ? { status: 'EXISTING' }
          : { status: 'SKIPPED', reason: 'COMENTARIO_NO_IMPORTADO' },
      );
    }
    addTicketAttachmentCount(
      report,
      { status: 'SKIPPED', reason: 'NOMBRE_INVALIDO' },
      plan.byComment.reduce((sum, item) => sum + item.invalid, 0),
    );
    addTicketAttachmentCount(
      report,
      { status: 'SKIPPED', reason: 'COMENTARIO_NO_IMPORTADO' },
      plan.orphaned,
    );
    return report;
  }

  /** Borra los objetos de adjuntos de una transacción de titular que no se confirmó. */
  private async purgeAttachmentObjects(schemaName: string, mediaAssetIds: string[]): Promise<void> {
    if (mediaAssetIds.length === 0) return;
    try {
      const failed = await this.support.purgeImportedAttachmentFiles(schemaName, mediaAssetIds);
      if (failed > 0) {
        this.logger.warn(
          `[migration] No se pudieron retirar ${failed} archivos de adjuntos de un titular no confirmado.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `[migration] No se pudieron retirar los adjuntos de un titular no confirmado: ${summarizeErrorForLog(error)}`,
      );
    }
  }

  private async markPromoted(
    qr: QueryRunner,
    row: StagedRow,
    entityId: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    if (row.status === 'PROMOVIDO') {
      // Reintento: la fila ya quedó promovida; no se pisa su meta (party creado, etc.).
      return;
    }
    await qr.query(
      `UPDATE migration_staging_records
          SET status = 'PROMOVIDO', rejection_reason = NULL, promoted_entity_id = $2,
              promotion_meta = $3::jsonb, updated_at = now()
        WHERE id = $1`,
      [row.id, entityId, JSON.stringify(meta)],
    );
  }

  private async reject(
    qr: QueryRunner,
    row: StagedRow,
    reason: MigrationRejectionReason,
  ): Promise<void> {
    await qr.query(
      `UPDATE migration_staging_records
          SET status = 'RECHAZADO', rejection_reason = $2,
              promotion_meta = '{"fase":"PROMOCION"}'::jsonb, updated_at = now()
        WHERE id = $1 AND status = 'VALIDO'`,
      [row.id, reason],
    );
  }

  private mapped(
    mappings: MappingIndex,
    kind: MigrationMappingKind,
    value: unknown,
  ): { action: MigrationMappingAction; target: string | null } | null {
    if (value === null || value === undefined) return null;
    return mappings.get(kind)?.get(String(value)) ?? null;
  }

  // ── Lecturas ────────────────────────────────────────────────────────────────────────

  private async lockBatch(qr: QueryRunner, tenantId: string, batchId: string) {
    const rows = (await qr.query(
      `SELECT status, counts, promotion, purged_at FROM migration_batches
        WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [batchId, tenantId],
    )) as Array<{ status: string; counts: unknown; promotion: unknown; purged_at: unknown }>;
    const batch = rows[0];
    if (!batch) {
      throw new NotFoundException({
        code: 'MIGRATION_BATCH_NOT_FOUND',
        message: 'El lote no existe.',
      });
    }
    return batch;
  }

  private async stagedRows(
    qr: QueryRunner,
    tenantId: string,
    batchId: string,
    statuses: string[],
    entity?: MigrationEntity,
  ): Promise<StagedRow[]> {
    const rows = (await qr.query(
      `SELECT id, entity, external_id, status, rejection_reason, payload_encrypted
         FROM migration_staging_records
        WHERE tenant_id = $1 AND batch_id = $2 AND status = ANY($3::varchar[])
          AND ($4::varchar IS NULL OR entity = $4)
        ORDER BY created_at, id`,
      [tenantId, batchId, statuses, entity ?? null],
    )) as Array<Omit<StagedRow, 'payload'> & { payload_encrypted: string }>;
    return rows.map(({ payload_encrypted, ...row }) => ({
      ...row,
      payload: this.crypto.decryptPayload<StagedPayload>(payload_encrypted),
    }));
  }

  /** ¿Algún lote vigente (no revertido) complementó a este suscriptor? */
  private async complementedBefore(
    qr: QueryRunner,
    tenantId: string,
    subscriberId: string,
  ): Promise<boolean> {
    const rows = (await qr.query(
      `SELECT 1 FROM migration_staging_records
        WHERE tenant_id = $1 AND entity = 'SUSCRIPTOR' AND status = 'PROMOVIDO'
          AND promoted_entity_id = $2 AND promotion_meta->>'mode' = 'COMPLEMENTO'
        LIMIT 1`,
      [tenantId, subscriberId],
    )) as unknown[];
    return rows.length > 0;
  }

  private async promotedInfo(
    qr: QueryRunner,
    tenantId: string,
    stagingId: string,
  ): Promise<{ id: string; mode: string | null } | null> {
    const rows = (await qr.query(
      `SELECT promoted_entity_id::text AS id, promotion_meta->>'mode' AS mode
         FROM migration_staging_records WHERE tenant_id = $1 AND id = $2`,
      [tenantId, stagingId],
    )) as Array<{ id: string | null; mode: string | null }>;
    const row = rows[0];
    return row?.id ? { id: row.id, mode: row.mode } : null;
  }

  private async loadGroups(tenant: ResolvedTenant, batchId: string): Promise<TitularGroup[]> {
    return runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
      const rows = await this.stagedRows(qr, tenant.tenantId, batchId, [
        'VALIDO',
        'PROMOVIDO',
        'RECHAZADO',
      ]);
      const groups = new Map<string, TitularGroup>();
      for (const row of rows) {
        if (row.entity === 'SUSCRIPTOR') groups.set(row.external_id, { subscriber: row, rows: [] });
      }
      for (const row of rows) {
        if (row.entity === 'SUSCRIPTOR') continue;
        groups.get(String(row.payload.derived.clientExternalId ?? ''))?.rows.push(row);
      }
      // Titulares rechazados en la simulación no se promueven (conflicto o anonimizado, D11).
      return [...groups.values()]
        .filter((group) => group.subscriber.status !== 'RECHAZADO')
        .sort(
          (a, b) => a.subscriber.payload.source.fileIndex - b.subscriber.payload.source.fileIndex,
        );
    });
  }

  private async loadMappings(tenant: ResolvedTenant): Promise<MappingIndex> {
    return runInTenantSchema(this.dataSource, tenant.schemaName, (qr) =>
      this.readMappings(qr, tenant.tenantId),
    );
  }

  private async readMappings(qr: QueryRunner, tenantId: string): Promise<MappingIndex> {
    const rows = (await qr.query(
      `SELECT kind, external_value, action, target_ref FROM migration_mappings
        WHERE tenant_id = $1 AND source_system = 'UISP'`,
      [tenantId],
    )) as Array<{
      kind: MigrationMappingKind;
      external_value: string;
      action: MigrationMappingAction;
      target_ref: string | null;
    }>;
    const index: MappingIndex = new Map();
    for (const row of rows) {
      const byKind = index.get(row.kind) ?? new Map();
      byKind.set(row.external_value, { action: row.action, target: row.target_ref });
      index.set(row.kind, byKind);
    }
    return index;
  }

  /**
   * Entradas del ZIP del titular (relativas a `client.json`) que sus registros pendientes
   * referencian (PDF de cobro y soportes). Solo se descomprime lo referenciado y el resultado
   * se descarta al terminar el titular (H3).
   */
  private async loadTitularFiles(
    prefix: string,
    fileCount: number,
    group: TitularGroup,
  ): Promise<Map<string, Buffer>> {
    const wanted = new Set<string>();
    // Carpetas `tickets/<id>/` de tickets con adjuntos referenciados (spec MOD09 adjuntos §2.3):
    // se lee la carpeta del ticket, nunca una ruta armada con el nombre del JSON.
    const folders = new Set<string>();
    for (const row of group.rows) {
      if (row.status !== 'VALIDO') continue;
      if (row.entity === 'TICKET') {
        const plan = ticketAttachmentPlan(row.payload.raw);
        const folder = ticketAttachmentFolder(sourceIdOf(row.external_id));
        if (folder && plan.byComment.some((item) => item.refs.length > 0)) folders.add(folder);
      }
      const path =
        row.entity === 'DOCUMENTO_COBRO'
          ? row.payload.source.pdfPath
          : row.entity === 'SOPORTE_DOCUMENTAL'
            ? row.payload.source.path
            : null;
      if (path) wanted.add(path);
    }
    const index = group.subscriber.payload.source.fileIndex;
    if (
      (wanted.size === 0 && folders.size === 0) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= fileCount
    ) {
      return new Map();
    }
    const blob = await this.storage.getObject(migrationObjectKey(prefix, index));
    let plain: Buffer;
    try {
      plain = this.crypto.decryptObject(blob);
    } catch {
      throw new MigrationPermanentError('MIGRATION_OBJECT_UNREADABLE');
    }
    const inFolder = (path: string) => [...folders].some((folder) => path.startsWith(folder));
    const select = (path: string) => {
      const relative = path.slice(path.indexOf('/') + 1);
      return (
        /^(?:[^/]+\/)?client\.json$/u.test(path) ||
        wanted.has(path) ||
        wanted.has(relative) ||
        inFolder(path) ||
        inFolder(relative)
      );
    };
    try {
      return packageEntries(await readZipEntries(plain, undefined, select)) ?? new Map();
    } catch (error) {
      if (!(error instanceof SafeZipError)) throw error;
      return new Map();
    }
  }

  /** Sube cifrado con la clave PII activa (IWE1, como expediente y firma) y registra la clave. */
  private async putEncrypted(key: string, content: Buffer, uploaded: string[]): Promise<void> {
    const encrypted = this.crypto.encryptObject(content);
    await this.storage.putObject(key, encrypted, {
      contentType: ENCRYPTED_OBJECT_CONTENT_TYPE,
      contentLength: encrypted.length,
    });
    uploaded.push(key);
  }

  private async deleteUploaded(keys: string[]): Promise<void> {
    for (const key of new Set(keys)) {
      try {
        await this.storage.deleteObject(key);
      } catch (error) {
        this.logger.warn(
          `[migration] No se pudo retirar un objeto de un titular no confirmado: ${summarizeErrorForLog(error)}`,
        );
      }
    }
  }

  private async buildPromotionReport(
    qr: QueryRunner,
    tenantId: string,
    batchId: string,
    startedAt: string,
  ): Promise<MigrationPromotionReport> {
    const rows = (await qr.query(
      `SELECT entity, status, rejection_reason,
              COALESCE((promotion_meta->>'existing')::boolean, false) AS existing,
              COALESCE(promotion_meta->>'fase', '') = 'PROMOCION' AS promotion_phase,
              COUNT(*)::int AS total,
              COALESCE(SUM((promotion_meta->>'tags')::int), 0)::int AS tags,
              COALESCE(SUM((promotion_meta->>'suspensionRows')::int), 0)::int AS suspension_rows,
              COALESCE(SUM((promotion_meta->>'allocations')::int), 0)::int AS allocations
         FROM migration_staging_records
        WHERE tenant_id = $1 AND batch_id = $2
        GROUP BY 1, 2, 3, 4, 5`,
      [tenantId, batchId],
    )) as Array<{
      entity: MigrationEntity;
      status: string;
      rejection_reason: MigrationRejectionReason | null;
      existing: boolean;
      promotion_phase: boolean;
      total: number;
      tags: number;
      suspension_rows: number;
      allocations: number;
    }>;
    const report = emptyPromotion();
    report.procesamiento = 'COMPLETADO';
    report.iniciadoEn = startedAt;
    report.terminadoEn = new Date().toISOString();
    const rejected: MigrationBatchRejections = {};
    for (const row of rows) {
      report.etiquetasAsignadas += Number(row.tags);
      report.periodosSuspension += Number(row.suspension_rows);
      report.aplicaciones += Number(row.allocations);
      if (row.status === 'PROMOVIDO') {
        const bucket = row.existing ? report.existentes : report.promovidos;
        bucket[row.entity] = (bucket[row.entity] ?? 0) + Number(row.total);
      } else if (row.status === 'RECHAZADO' && row.promotion_phase && row.rejection_reason) {
        const byReason = (rejected[row.entity] ??= {});
        byReason[row.rejection_reason] = (byReason[row.rejection_reason] ?? 0) + Number(row.total);
      }
    }
    report.rechazados = rejected;
    // «Adjuntos de tickets no importados: N» por motivo (spec MOD09 adjuntos §2.3).
    const attachments = (await qr.query(
      `SELECT promotion_meta->'adjuntos' AS adjuntos FROM migration_staging_records
        WHERE tenant_id = $1 AND batch_id = $2 AND entity = 'TICKET' AND status = 'PROMOVIDO'
          AND promotion_meta->'adjuntos' IS NOT NULL`,
      [tenantId, batchId],
    )) as Array<{ adjuntos: unknown }>;
    for (const row of attachments) sumTicketAttachmentReports(report.adjuntosTickets, row.adjuntos);
    return report;
  }

  /**
   * «Dato distinto en UISP» (spec §2.4): el informe de promoción no tiene observaciones, así que
   * se fija en `counts.observaciones` del lote (contrato congelado). Se recalcula desde las
   * intermedias para que un reintento no lo duplique; sin diferencias, la clave no aparece.
   */
  private async recordDifferingObservation(
    qr: QueryRunner,
    tenantId: string,
    batchId: string,
  ): Promise<void> {
    await qr.query(
      `WITH total AS (
         SELECT COALESCE(SUM(jsonb_array_length(promotion_meta->'differing')), 0)::int AS n
           FROM migration_staging_records
          WHERE tenant_id = $1 AND batch_id = $2 AND entity = 'SUSCRIPTOR'
            AND status = 'PROMOVIDO' AND promotion_meta->>'mode' = 'COMPLEMENTO'
            AND jsonb_typeof(promotion_meta->'differing') = 'array')
       UPDATE migration_batches b
          SET counts = jsonb_set(
                b.counts, '{observaciones}',
                CASE WHEN total.n > 0
                     THEN COALESCE(b.counts->'observaciones', '{}'::jsonb)
                          || jsonb_build_object('DATO_DISTINTO_EN_UISP', total.n)
                     ELSE COALESCE(b.counts->'observaciones', '{}'::jsonb) - 'DATO_DISTINTO_EN_UISP'
                END),
              updated_at = now()
         FROM total
        WHERE b.id = $2 AND b.tenant_id = $1 AND b.counts IS NOT NULL`,
      [tenantId, batchId],
    );
  }

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message });
  }
}
