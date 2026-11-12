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
import { runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import { ENCRYPTED_OBJECT_CONTENT_TYPE, STORAGE_PORT, type StoragePort } from '@iwana/storage';
import {
  AuditAction,
  BILLING_PAYMENT_METHODS,
  MIGRATION_IMPORT_PROMOTE_JOB,
  MIGRATION_IMPORT_QUEUE,
  MigrationBatchCountsSchema,
  MigrationPromotionReportSchema,
  type BillingPaymentMethod,
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
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { SubscriberTagAssignmentPort } from '../crm/ports/subscriber-tag-assignment.port';
import { MigrationCrypto } from './migration-crypto';
import { MIGRATION_AUDIT_ENTITY, migrationObjectKey } from './migration.constants';
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
  type MigrationWriteContext,
} from './ports/migration-import.ports';
import { MigrationTitularLookupPort } from './ports/migration-titular-lookup.port';
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
  suspensionPeriods,
  ticketComments,
  ticketStatus,
} from './uisp/uisp-promotion-mapping';
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
  | { kind: 'existing'; id: string }
  | { kind: 'rejected'; reason: MigrationRejectionReason };

class TitularRejected extends Error {
  constructor(readonly reason: MigrationRejectionReason) {
    super(reason);
  }
}

function emptyPromotion(): MigrationPromotionReport {
  return {
    procesamiento: 'PENDIENTE',
    promovidos: {},
    existentes: {},
    rechazados: {},
    etiquetasAsignadas: 0,
    periodosSuspension: 0,
    aplicaciones: 0,
    iniciadoEn: null,
    terminadoEn: null,
  };
}

const text = importedText;

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
          );
          return true;
        });
      } catch (error) {
        // Compensación: la transacción del titular no se confirmó; sus objetos no deben quedar.
        await this.deleteUploaded(uploaded);
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
        { subscriberId: string; billed: number; paid: number; balance: number }
      >();
      for (const row of rows) {
        if (row.entity === 'SUSCRIPTOR' && row.status === 'PROMOVIDO') {
          const subscriberId = await this.promotedId(qr, row.id);
          if (!subscriberId) continue;
          const accountBalance = amount(row.payload.raw?.['accountBalance']) ?? 0;
          // En UISP el saldo negativo es deuda; en iWana el saldo es facturado − pagado.
          uisp.set(row.external_id, {
            subscriberId,
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
      const totals = await this.billing.totalsBySubscriber(
        { manager: qr.manager, tenantId: tenant.tenantId },
        [...uisp.values()].map((value) => value.subscriberId),
      );
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
        const created = await this.crm.createContract(ctx, {
          externalId: row.external_id,
          subscriberId,
          planId: plan.target,
          billingCycleDay: cycleDay,
          status: contractStatus(raw['status']),
          startDate: dates.startDate,
          endDate: dates.endDate,
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
        });
        return { kind: 'created', id };
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
        const existing = await known(row, (ids) => this.support.findTickets(read, ids));
        if (existing) return { kind: 'existing', id: existing };
        const raw = row.payload.raw ?? {};
        const id = await this.support.createImportedTicket(ctx, {
          externalId: row.external_id,
          sourceId: sourceId(row),
          subscriberId,
          subject: text(raw['subject'], 200) ?? 'Ticket importado',
          status: ticketStatus(raw['status']),
          createdAt: instant(raw['createdAt']),
          comments: ticketComments(raw),
        });
        return { kind: 'created', id };
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
      await this.markPromoted(qr, row, existing.id, { existing: true });
      return existing.id;
    }
    if (row.status !== 'VALIDO') throw new TitularRejected('DATOS_INVALIDOS');
    const derived = row.payload.derived;
    const raw = row.payload.raw ?? {};
    const documentNumber =
      typeof derived['documentNumber'] === 'string' ? derived['documentNumber'] : null;
    if (documentNumber) {
      // Entre la simulación y la promoción pudo darse de alta el mismo titular (D11).
      const facts = await this.titularLookup.lookup(qr, {
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
    const contacts = Array.isArray(raw['contacts'])
      ? (raw['contacts'] as Array<Record<string, unknown>>)
      : [];
    const contact = contacts.find((item) => item['isContact'] === true) ?? contacts[0];
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
      email: text(contact?.['email'], 254),
      phone: text(contact?.['phone'], 30),
      address: text(raw['fullAddress'], 500) ?? text(raw['street1'], 500),
      city: text(raw['city'], 100),
      latitude: coordinatesDiscarded ? null : coordinate(raw['addressGpsLat']),
      longitude: coordinatesDiscarded ? null : coordinate(raw['addressGpsLon']),
      registeredOn: civilDate(raw['registrationDate']),
    });
    let tagsAssigned = 0;
    for (const tag of tagRefs) {
      const mapping = this.mapped(mappings, 'ETIQUETA', tag)!;
      if (mapping.action !== 'EQUIVALE' || !mapping.target) continue;
      try {
        const result = await this.tags.assignForImport(
          {
            tenantId: ctx.tenantId,
            subscriberId: created.subscriberId,
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
    await this.markPromoted(qr, row, created.subscriberId, {
      partyId: created.partyId,
      partyCreated: created.partyCreated,
      tags: tagsAssigned,
    });
    return created.subscriberId;
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
      outcome.kind === 'existing' ? { existing: true } : (outcome.meta ?? {}),
    );
    return outcome.id;
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

  private async promotedId(qr: QueryRunner, stagingId: string): Promise<string | null> {
    const rows = (await qr.query(
      `SELECT promoted_entity_id::text AS id FROM migration_staging_records WHERE id = $1`,
      [stagingId],
    )) as Array<{ id: string | null }>;
    return rows[0]?.id ?? null;
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
    const rows = (await runInTenantSchema(this.dataSource, tenant.schemaName, (qr) =>
      qr.query(
        `SELECT kind, external_value, action, target_ref FROM migration_mappings
          WHERE tenant_id = $1 AND source_system = 'UISP'`,
        [tenant.tenantId],
      ),
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
    for (const row of group.rows) {
      if (row.status !== 'VALIDO') continue;
      const path =
        row.entity === 'DOCUMENTO_COBRO'
          ? row.payload.source.pdfPath
          : row.entity === 'SOPORTE_DOCUMENTAL'
            ? row.payload.source.path
            : null;
      if (path) wanted.add(path);
    }
    const index = group.subscriber.payload.source.fileIndex;
    if (wanted.size === 0 || !Number.isInteger(index) || index < 0 || index >= fileCount) {
      return new Map();
    }
    const blob = await this.storage.getObject(migrationObjectKey(prefix, index));
    let plain: Buffer;
    try {
      plain = this.crypto.decryptObject(blob);
    } catch {
      throw new MigrationPermanentError('MIGRATION_OBJECT_UNREADABLE');
    }
    const select = (path: string) =>
      /^(?:[^/]+\/)?client\.json$/u.test(path) ||
      wanted.has(path) ||
      wanted.has(path.slice(path.indexOf('/') + 1));
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
    return report;
  }

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message });
  }
}
