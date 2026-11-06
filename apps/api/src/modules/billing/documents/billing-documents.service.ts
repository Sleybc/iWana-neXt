import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AccessPermissionKey,
  AuditAction,
  BILLING_ERROR_CODES,
  BillingDocumentResponseSchema,
  redactedBillingBuyer,
  type BillingDocumentResponse,
  type BillingDocumentVoidReason,
  type BillingPeriodPaymentState,
} from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource, EntityManager } from 'typeorm';
import { computeDueAndCutoff } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import type { PeriodEvent } from '../payments/billing-payments.service';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../../../common/crypto/aes-gcm.util';

interface DocumentRow {
  id: string;
  tenant_id: string;
  period_id: string;
  contract_id: string;
  subscriber_id: string;
  status: 'BORRADOR' | 'EMITIDO' | 'ANULADO';
  number: string | null;
  issue_date: string | null;
  due_date: string;
  period_start: string;
  period_end: string;
  covered_start: string;
  subtotal: string;
  tax_total: string;
  total: string;
  unbilled_additional_count: number;
  blocking_reason: BillingDocumentResponse['blockingReason'];
  buyer_snapshot: Record<string, unknown> | null;
  buyer_document_encrypted: string | null;
  issuer_snapshot: Record<string, unknown> | null;
  void_reason_code: BillingDocumentVoidReason | null;
  void_note: string | null;
  voided_at: Date | string | null;
  voided_by: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  paid_amount: string;
  pending_amount: string;
}

interface DocumentLineRow {
  id: string;
  document_id: string;
  kind: 'PLAN' | 'ADICIONAL' | 'PRORRATEO';
  description: string;
  quantity: string;
  unit_price: string;
  base_amount: string;
  tax_amount: string;
  total: string;
  vat_treatment: string;
  vat_rate: string;
  vat_legal_basis: string | null;
  position: number;
}

const SELECT_DOCUMENTS = `SELECT d.id::text, d.tenant_id::text, d.period_id::text,
       d.contract_id::text, d.subscriber_id::text, d.status, d.number, d.issue_date::text,
       d.due_date::text, p.period_start::text AS period_start, p.period_end::text AS period_end,
       p.covered_start::text AS covered_start,
       d.subtotal::text, d.tax_total::text, d.total::text,
       d.unbilled_additional_count, d.blocking_reason, d.buyer_snapshot,
       d.buyer_document_encrypted, d.issuer_snapshot, d.void_reason_code, d.void_note,
       d.voided_at, d.voided_by::text, d.created_by::text, d.created_at, d.updated_at,
       COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a
                  JOIN billing_payments p2 ON p2.id = a.payment_id
                 WHERE a.document_id = d.id AND a.reversed_at IS NULL AND p2.status = 'REGISTRADO'), 0)::text AS paid_amount,
       GREATEST(d.total - COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a
                  JOIN billing_payments p2 ON p2.id = a.payment_id
                 WHERE a.document_id = d.id AND a.reversed_at IS NULL AND p2.status = 'REGISTRADO'), 0), 0)::text AS pending_amount
  FROM billing_documents d
  JOIN billing_periods p ON p.id = d.period_id`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function moneyToCents(value: string | number): number {
  const decimal = typeof value === 'number' ? value.toFixed(2) : value;
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/u.exec(decimal);
  if (!match) throw new RangeError('El monto no tiene un formato monetario válido.');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

@Injectable()
export class BillingDocumentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly contracts: BillingContractReadPort,
    private readonly issuers: BillingIssuerReadPort,
    private readonly config: ConfigService,
    private readonly permissions: EffectivePermissionsService,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
    @Inject(IPrivacyMarksReadPort) private readonly privacyMarks: IPrivacyMarksReadPort,
    private readonly payments: BillingPaymentsService,
  ) {}

  async list(
    input: {
      page: number;
      limit: number;
      status?: string;
      paymentState?: BillingPeriodPaymentState;
      cycleDay?: number;
      subscriberId?: string;
      from?: string;
      to?: string;
    },
    actorId: string,
  ): Promise<{
    data: BillingDocumentResponse[];
    meta: {
      nextCursor: null;
      total: number;
      totalIsEstimate: false;
      page: number;
      limit: number;
      totalPages: number;
      hasMore: boolean;
      mode: 'page';
      capabilities: { randomAccess: true; sortableFields: string[] };
      sort: null;
    };
    page: number;
    total: number;
    limit: number;
  }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    // SIN_DOCUMENTO nunca tiene fila en billing_documents: el filtro devuelve vacío.
    if (input.paymentState === 'SIN_DOCUMENTO') {
      const total = 0;
      return {
        data: [],
        meta: {
          nextCursor: null,
          total,
          totalIsEstimate: false as const,
          page: input.page,
          limit: input.limit,
          totalPages: 0,
          hasMore: false,
          mode: 'page' as const,
          capabilities: { randomAccess: true as const, sortableFields: [] },
          sort: null,
        },
        page: input.page,
        total,
        limit: input.limit,
      };
    }
    const { timezone } = await this.tenantSettings.getSnapshot({ tenantId });
    const localDate = this.localDate(new Date(), timezone);
    const params: unknown[] = [tenantId];
    const conditions = ['d.tenant_id = $1'];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (input.status) add('d.status = ?', input.status);
    if (input.subscriberId) add('d.subscriber_id = ?::uuid', input.subscriberId);
    if (input.from) add('d.issue_date >= ?::date', input.from);
    if (input.to) add('d.issue_date <= ?::date', input.to);
    if (input.cycleDay !== undefined)
      add('EXTRACT(DAY FROM p.period_start)::int = ?', input.cycleDay);
    if (input.paymentState) {
      params.push(localDate);
      const dateParam = `$${params.length}`;
      const paidExpr = `COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a JOIN billing_payments p2 ON p2.id = a.payment_id WHERE a.document_id = d.id AND a.reversed_at IS NULL AND p2.status = 'REGISTRADO'), 0)`;
      const stateCase = `CASE WHEN d.status <> 'EMITIDO' THEN 'NO_EMITIDO' WHEN ${paidExpr} >= d.total THEN 'PAGADO' WHEN ${dateParam} > d.due_date::text THEN 'VENCIDO' WHEN ${paidExpr} > 0 THEN 'PARCIAL' ELSE 'PENDIENTE' END`;
      params.push(input.paymentState);
      conditions.push(`${stateCase} = $${params.length}`);
    }
    const where = conditions.join(' AND ');
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const counts = (await qr.query(
        `SELECT count(*)::int AS total FROM billing_documents d JOIN billing_periods p ON p.id = d.period_id WHERE ${where}`,
        params,
      )) as Array<{ total: number }>;
      const total = counts[0]?.total ?? 0;
      const offset = (input.page - 1) * input.limit;
      const rows = (await qr.query(
        `${SELECT_DOCUMENTS} WHERE ${where} ORDER BY d.created_at DESC, d.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, input.limit, offset],
      )) as DocumentRow[];

      return {
        data: rows,
        meta: {
          nextCursor: null,
          total,
          totalIsEstimate: false as const,
          page: input.page,
          limit: input.limit,
          totalPages: Math.ceil(total / input.limit),
          hasMore: offset + rows.length < total,
          mode: 'page' as const,
          capabilities: { randomAccess: true as const, sortableFields: [] },
          sort: null,
        },
        page: input.page,
        total,
        limit: input.limit,
      };
    });
    return {
      ...result,
      data: await this.hydrate(result.data, 'list', actorId, undefined, localDate),
    };
  }

  async findOne(documentId: string, actorId: string): Promise<BillingDocumentResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(`${SELECT_DOCUMENTS} WHERE d.tenant_id=$1 AND d.id=$2`, [tenantId, documentId]),
    )) as DocumentRow[];
    if (!rows[0])
      throw new NotFoundException({
        code: 'BILLING_DOCUMENT_NOT_FOUND',
        message: 'No se encontró el documento.',
      });
    const [result] = await this.hydrate(rows, 'detail', actorId);
    if (!result) throw new NotFoundException();
    return result;
  }

  /**
   * Resuelve fuera de la transacción lo que la emisión necesita de los puertos.
   * El documento del adquirente no se descifra por defecto: la emisión lo
   * descifra (`buyer.revealDocumentNumber`) solo para el documento que de verdad emite.
   */
  async prepareIssue(contractId: string, options: { revealDocument?: boolean } = {}) {
    const { tenantId } = TenantContext.getOrThrow();
    const [contract, cycle, issuer, settings] = await Promise.all([
      this.contracts.findByContractId(contractId, {
        revealDocument: options.revealDocument ?? false,
      }),
      this.contracts.findBillingCycleByContractId(contractId),
      this.issuers.getIssuerIdentity(tenantId),
      this.tenantSettings.getSnapshot({ tenantId }),
    ]);
    return { contract, cycle, issuer, issueDate: this.localDate(new Date(), settings.timezone) };
  }
  async pdfDocument(documentId: string, actorId: string) {
    const document = await this.findOne(documentId, actorId);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        'SELECT period_start::text AS "periodStart",period_end::text AS "periodEnd",covered_start::text AS "coveredStart" FROM billing_periods WHERE tenant_id=$1 AND id=$2',
        [tenantId, document.periodId],
      ),
    )) as Array<{ periodStart: string; periodEnd: string; coveredStart: string }>;
    return { ...document, ...rows[0] };
  }

  async publishEvents(events: PeriodEvent[]): Promise<void> {
    await this.payments.emitEvents(events);
  }

  async issue(documentIds: string[], actorId: string): Promise<BillingDocumentResponse[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        'SELECT id, contract_id FROM billing_documents WHERE tenant_id=$1 AND id=ANY($2::uuid[])',
        [tenantId, documentIds],
      ),
    )) as Array<{ id: string; contract_id: string }>;
    const prepared = new Map<
      string,
      Awaited<ReturnType<BillingDocumentsService['prepareIssue']>>
    >();
    for (const row of rows)
      prepared.set(row.id, await this.prepareIssue(row.contract_id, { revealDocument: false }));
    const events: PeriodEvent[] = [];
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      for (const id of documentIds)
        await this.issueWithinManager(
          qr.manager,
          tenantId,
          [id],
          actorId,
          prepared.get(id),
          events,
        );
    });
    await this.payments.emitEvents(events);
    return Promise.all(documentIds.map((id) => this.findOne(id, actorId)));
  }

  async issueWithinManager(
    manager: EntityManager,
    tenantId: string,
    documentIds: string[],
    actorId: string | null,
    prepared: Awaited<ReturnType<BillingDocumentsService['prepareIssue']>> | undefined,
    events: PeriodEvent[],
  ): Promise<BillingDocumentResponse[]> {
    if (!prepared)
      throw new NotFoundException({
        code: 'BILLING_DOCUMENT_NOT_FOUND',
        message: 'No se encontró el documento.',
      });
    const { issueDate, contract, cycle, issuer } = prepared;
    const issued: BillingDocumentResponse[] = [];
    const { activeKey } = loadPiiAesGcmKeyPair(this.config);
    let buyerDocumentNumber: string | null | undefined;
    for (const documentId of documentIds) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `billing-number:${tenantId}`,
      ]);
      if (contract) await this.payments.lockSubscriber(manager, contract.subscriberId);
      const rows = (await manager.query(
        `${SELECT_DOCUMENTS} WHERE d.tenant_id = $1 AND d.id = $2 FOR UPDATE OF d`,
        [tenantId, documentId],
      )) as DocumentRow[];
      const document = rows[0];
      if (!document)
        throw new NotFoundException({
          code: 'BILLING_DOCUMENT_NOT_FOUND',
          message: 'No se encontró el borrador.',
        });
      if (document.status !== 'BORRADOR') {
        throw new ConflictException({
          code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_DRAFT,
          message: 'Solo se pueden emitir borradores.',
        });
      }
      if (document.blocking_reason) {
        throw new UnprocessableEntityException({
          code: BILLING_ERROR_CODES.BILLING_DOCUMENT_BLOCKED,
          message: 'El borrador tiene datos pendientes.',
        });
      }

      if (!contract)
        throw new NotFoundException({
          code: 'BILLING_CONTRACT_NOT_FOUND',
          message: 'No se encontró el contrato.',
        });
      const ref = await this.contracts.lockTitularForBillingWrite(document.subscriber_id, {
        manager,
      });
      if (!ref.exists || ref.anonymized) {
        throw new ConflictException({
          code: BILLING_ERROR_CODES.PRIVACY_TITULAR_ANONYMIZED,
          message: 'No se puede emitir para un titular anonimizado.',
        });
      }
      buyerDocumentNumber ??=
        contract.buyer.documentNumber ?? contract.buyer.revealDocumentNumber?.() ?? null;
      if (!buyerDocumentNumber) {
        throw new UnprocessableEntityException({
          code: BILLING_ERROR_CODES.BILLING_DOCUMENT_BLOCKED,
          message: 'Faltan datos fiscales del adquirente.',
        });
      }

      if (!issuer.legalName || !issuer.nit) {
        throw new UnprocessableEntityException({
          code: BILLING_ERROR_CODES.BILLING_ISSUER_INCOMPLETE,
          message: 'Configura la razón social y el NIT antes de emitir.',
        });
      }
      const policyRows = (await manager.query(
        'SELECT document_prefix FROM billing_policy WHERE tenant_id = $1',
        [tenantId],
      )) as Array<{ document_prefix: string }>;
      const prefix = policyRows[0]?.document_prefix;
      if (!prefix) throw new Error('No se encontró el prefijo de facturación.');
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `billing-number:${tenantId}`,
      ]);

      const periodRows = await manager.query(
        'SELECT period_start::text, period_end::text, effective_policy FROM billing_periods WHERE tenant_id = $1 AND id = $2',
        [tenantId, document.period_id],
      );
      const period = (
        periodRows as Array<{
          period_start: string;
          period_end: string;
          effective_policy: Record<string, unknown>;
        }>
      )[0];
      if (!cycle?.cycleDay || !period)
        throw new Error('No se pudo resolver el ciclo del periodo para emitir.');
      const effective = period.effective_policy as Record<string, unknown>;
      const dates = computeDueAndCutoff(
        { periodStart: period.period_start, periodEnd: period.period_end },
        {
          cutoffMode: effective['cutoff_mode'] as 'DIA_FIJO_CICLO' | 'VENCIMIENTO_MAS_GRACIA',
          paymentTermDays: Number(effective['payment_term_days']),
          graceDays: Number(effective['grace_days']),
          cutoffEnabled: Boolean(effective['cutoff_enabled']),
        },
        issueDate,
        cycle.cutoffDay,
      );
      await manager.query(
        'UPDATE billing_periods SET due_date = $1::date, cutoff_date = $2::date WHERE tenant_id = $3 AND id = $4',
        [dates.dueDate, dates.cutoffDate, tenantId, document.period_id],
      );
      let nextNumber = await this.nextNumber(manager, tenantId, prefix);
      let saved: DocumentRow | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await manager.query('SAVEPOINT billing_document_number_attempt');
        try {
          const number = `${prefix}-${String(nextNumber).padStart(6, '0')}`;
          const [updatedRows] = (await manager.query(
            `UPDATE billing_documents
                SET status = 'EMITIDO', number = $1, issue_date = $5::date,
                    buyer_snapshot = $2::jsonb, buyer_document_encrypted = $3,
                    issuer_snapshot = $4::jsonb, due_date = $6::date, updated_at = now()
              WHERE id = $7 AND tenant_id = $8
              RETURNING id::text, tenant_id::text, period_id::text, contract_id::text,
                        subscriber_id::text, status, number, issue_date::text, due_date::text,
                        subtotal::text, tax_total::text, total::text, unbilled_additional_count,
                        blocking_reason, buyer_snapshot, buyer_document_encrypted, issuer_snapshot,
                        void_reason_code, void_note, voided_at, voided_by::text, created_by::text,
                        created_at::text AS created_at, updated_at::text AS updated_at,
                        '0'::text AS paid_amount, total::text AS pending_amount`,
            [
              number,
              JSON.stringify({
                ...document.buyer_snapshot,
                displayName: contract.buyer.displayName,
                documentType: contract.buyer.documentType,
                address: contract.buyer.address,
                rutResponsibilities: contract.buyer.rutResponsibilities,
              }),
              encryptAes256Gcm(buyerDocumentNumber, activeKey),
              JSON.stringify({
                legalName: issuer.legalName,
                nit: issuer.nit,
                verificationDigit: issuer.verificationDigit,
              }),
              issueDate,
              dates.dueDate,
              documentId,
              tenantId,
            ],
          )) as [DocumentRow[], number];
          saved = updatedRows[0];
          await manager.query('RELEASE SAVEPOINT billing_document_number_attempt');
          break;
        } catch (error) {
          if (!this.isNumberConflict(error)) throw error;
          await manager.query('ROLLBACK TO SAVEPOINT billing_document_number_attempt');
          nextNumber = await this.nextNumber(manager, tenantId, prefix);
          if (attempt === 2)
            throw new ConflictException('No fue posible asignar un consecutivo único.');
        }
      }
      if (!saved) throw new Error('No se pudo emitir el documento.');
      if (effective['auto_apply_credit'] === true) {
        events.push(
          ...(await this.payments.applyCreditWithin(
            manager,
            tenantId,
            documentId,
            document.subscriber_id,
            actorId,
          )),
        );
      }
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'BillingDocument',
          entityId: documentId,
          userId: actorId,
          oldValue: { status: 'BORRADOR' },
          newValue: { status: 'EMITIDO', number: saved.number },
        },
        manager,
      );
      // La respuesta se hidrata después del commit; no se abren conexiones bajo el lock.
    }
    return issued;
  }

  async void(
    documentId: string,
    reasonCode: BillingDocumentVoidReason,
    note: string | undefined,
    actorId: string,
  ): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const events = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        'SELECT id::text, period_id::text, status FROM billing_documents WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
        [tenantId, documentId],
      )) as Array<{ id: string; period_id: string; status: string }>;
      if (!rows[0])
        throw new NotFoundException({
          code: 'BILLING_DOCUMENT_NOT_FOUND',
          message: 'No se encontró el documento.',
        });
      if (rows[0].status !== 'EMITIDO')
        throw new ConflictException({
          code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_ISSUED,
          message: 'Solo se pueden anular documentos emitidos.',
        });
      await qr.query(
        `UPDATE billing_documents SET status='ANULADO', void_reason_code=$1, void_note=$2, voided_at=now(), voided_by=$3, updated_at=now() WHERE id=$4 AND tenant_id=$5`,
        [reasonCode, note ?? null, actorId, documentId, tenantId],
      );
      await qr.query(
        `UPDATE billing_payment_allocations SET reversed_at=now(), reversed_by=$1 WHERE document_id=$2 AND tenant_id=$3 AND reversed_at IS NULL`,
        [actorId, documentId, tenantId],
      );
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'BillingDocument',
          entityId: documentId,
          userId: actorId,
          oldValue: { status: 'EMITIDO' },
          newValue: { status: 'ANULADO', reasonCode },
        },
        qr.manager,
      );
      return this.payments.recalculateSignals(qr.manager, tenantId, [rows[0].period_id]);
    });
    await this.payments.emitEvents(events);
  }

  async discard(documentId: string, actorId: string): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        'SELECT status FROM billing_documents WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
        [tenantId, documentId],
      )) as Array<{ status: string }>;
      if (!rows[0])
        throw new NotFoundException({
          code: 'BILLING_DOCUMENT_NOT_FOUND',
          message: 'No se encontró el documento.',
        });
      if (rows[0].status !== 'BORRADOR')
        throw new ConflictException({
          code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_DRAFT,
          message: 'Solo se pueden borrar borradores.',
        });
      await qr.query('DELETE FROM billing_documents WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        documentId,
      ]);
      await this.audit.logWithin(
        {
          action: AuditAction.DELETE,
          entityType: 'BillingDocument',
          entityId: documentId,
          userId: actorId,
          oldValue: { status: 'BORRADOR' },
        },
        qr.manager,
      );
    });
  }

  private async nextNumber(
    manager: EntityManager,
    tenantId: string,
    prefix: string,
  ): Promise<number> {
    const rows = (await manager.query(
      `SELECT COALESCE(MAX(regexp_replace(number, '^.*-', '')::bigint), 0)::bigint + 1 AS next
         FROM billing_documents WHERE tenant_id = $1 AND number LIKE $2 AND status <> 'BORRADOR'`,
      [tenantId, `${prefix}-%`],
    )) as Array<{ next: string | number }>;
    return Number(rows[0]?.next ?? 1);
  }

  private isNumberConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('driverError' in error)) return false;
    const driver = (error as { driverError?: { code?: string; constraint?: string } }).driverError;
    return (
      driver?.code === '23505' && driver.constraint === 'billing_documents_tenant_id_number_key'
    );
  }

  private async hydrate(
    rows: DocumentRow[],
    purpose: 'list' | 'detail',
    actorId: string,
    suppliedLines?: DocumentLineRow[],
    localDateOverride?: string,
  ): Promise<BillingDocumentResponse[]> {
    if (!rows.length) return [];
    const context = TenantContext.getOrThrow();
    const localDate =
      localDateOverride ??
      this.localDate(
        new Date(),
        (await this.tenantSettings.getSnapshot({ tenantId: context.tenantId })).timezone,
      );
    const query = <T>(sql: string, parameters: unknown[]) =>
      runInTenantSchema(
        this.dataSource,
        context.schemaName,
        (qr) => qr.query(sql, parameters) as Promise<T>,
      );
    const refs = await this.contracts.findTitularRefs([
      ...new Set(rows.map(({ subscriber_id }) => subscriber_id)),
    ]);
    const refsBySubscriber = new Map(refs.map((ref) => [ref.subscriberId, ref]));
    const partyIds = [
      ...new Set(refs.map(({ partyId }) => partyId).filter((id): id is string => !!id)),
    ];
    const marks = partyIds.length ? await this.privacyMarks.activeMarks(partyIds) : {};
    const blockedRows = rows.filter((row) => {
      const partyId = refsBySubscriber.get(row.subscriber_id)?.partyId;
      return !!partyId && marks[partyId]?.includes('DATOS_BLOQUEADOS');
    });
    let mayReadBlocked = false;
    if (blockedRows.length) {
      const granted = new Set(await this.permissions.getEffectivePermissionsForUser(actorId));
      mayReadBlocked =
        granted.has(AccessPermissionKey.CRM_BLOCKED_DATA_READ) ||
        granted.has(AccessPermissionKey.PRIVACY_READ);
      if (mayReadBlocked) {
        // RS-21: una sola auditoría LIST_ACCESS por listado con el conteo de bloqueados,
        // como logListAccess de subscribers.controller.ts; el detalle usa RECORD_ACCESS.
        try {
          await runInTenantSchema(this.dataSource, context.schemaName, (qr) =>
            this.audit.logWithin(
              {
                action: purpose === 'list' ? AuditAction.LIST_ACCESS : AuditAction.RECORD_ACCESS,
                entityType: 'BillingDocument',
                entityId: purpose === 'list' ? 'N/A' : blockedRows[0]!.id,
                userId: actorId,
                newValue:
                  purpose === 'list'
                    ? {
                        purpose,
                        totalServed: rows.length,
                        blockedServed: blockedRows.length,
                      }
                    : { purpose },
              },
              qr.manager,
            ),
          );
        } catch {
          throw new ServiceUnavailableException({
            code: 'PRIVACY_AUDIT_UNAVAILABLE',
            message: 'No fue posible auditar el acceso a los datos.',
          });
        }
      }
      for (const row of blockedRows) {
        if (!mayReadBlocked) row.buyer_snapshot = { ...redactedBillingBuyer() };
      }
    }
    const linesByDocument = new Map<string, DocumentLineRow[]>();
    let lineRows = suppliedLines;
    if (!lineRows) {
      lineRows = (await query<DocumentLineRow[]>(
        'SELECT * FROM billing_document_lines WHERE tenant_id = $1 AND document_id = ANY($2::uuid[]) ORDER BY position',
        [context.tenantId, rows.map(({ id }) => id)],
      )) as DocumentLineRow[];
    }
    for (const line of lineRows) {
      const grouped = linesByDocument.get(line.document_id) ?? [];
      grouped.push(line);
      linesByDocument.set(line.document_id, grouped);
    }
    const piiKeys =
      purpose === 'detail' && (blockedRows.length === 0 || mayReadBlocked)
        ? loadPiiAesGcmKeyPair(this.config)
        : null;
    return rows.map((row) => {
      const isBlocked = blockedRows.some(({ id }) => id === row.id);
      const buyerProtected = isBlocked && !mayReadBlocked;
      const buyer = row.buyer_snapshot ? { ...row.buyer_snapshot } : null;
      if (buyer && (purpose === 'list' || buyerProtected)) buyer['documentNumber'] = null;
      else if (buyer && row.buyer_document_encrypted) {
        if (piiKeys)
          buyer['documentNumber'] = decryptAes256Gcm(
            row.buyer_document_encrypted,
            piiKeys.activeKey,
            piiKeys.previousKey,
          );
        else buyer['documentNumber'] = null;
      }
      if (buyer && !('documentNumber' in buyer)) buyer['documentNumber'] = null;
      const lines = (linesByDocument.get(row.id) ?? []).map((line) => ({
        id: line.id,
        documentId: line.document_id,
        kind: line.kind,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        baseAmount: line.base_amount,
        taxAmount: line.tax_amount,
        total: line.total,
        vatTreatment: line.vat_treatment,
        vatRate: line.vat_rate,
        vatLegalBasis: line.vat_legal_basis,
        position: line.position,
      }));
      return BillingDocumentResponseSchema.parse({
        id: row.id,
        tenantId: row.tenant_id,
        periodId: row.period_id,
        contractId: row.contract_id,
        subscriberId: row.subscriber_id,
        status: row.status,
        number: row.number,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        coveredStart: row.covered_start,
        paymentState: this.documentPaymentState(row, localDate),
        buyerProtected,
        subtotal: row.subtotal,
        taxTotal: row.tax_total,
        total: row.total,
        unbilledAdditionalCount: row.unbilled_additional_count,
        blockingReason: row.blocking_reason,
        buyerSnapshot: buyer,
        issuerSnapshot: row.issuer_snapshot,
        voidReasonCode: row.void_reason_code,
        voidNote: row.void_note,
        voidedAt: row.voided_at ? iso(row.voided_at) : null,
        voidedBy: row.voided_by,
        createdBy: row.created_by,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        lines,
        paidAmount: row.paid_amount,
        pendingAmount: row.pending_amount,
      });
    });
  }

  private documentPaymentState(
    row: Pick<DocumentRow, 'status' | 'total' | 'paid_amount' | 'due_date'>,
    localDate: string,
  ): BillingPeriodPaymentState | null {
    // RS-22: nulo si no está EMITIDO, con el orden de ADR-103 D3 y la fecha civil del tenant.
    if (row.status !== 'EMITIDO') return null;
    const paid = moneyToCents(row.paid_amount);
    const total = moneyToCents(row.total);
    if (paid >= total) return 'PAGADO';
    if (localDate > row.due_date) return 'VENCIDO';
    if (paid > 0) return 'PARCIAL';
    return 'PENDIENTE';
  }

  private localDate(date: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (key: string) => parts.find((value) => value.type === key)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    if (!year || !month || !day) throw new RangeError('No se resolvió la fecha civil del tenant.');
    return `${year}-${month}-${day}`;
  }
}
