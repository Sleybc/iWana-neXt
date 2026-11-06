import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditAction,
  BILLING_ERROR_CODES,
  BillingAccountStatementSchema,
  AllocateCreditCommandSchema,
  BillingPaymentResponseSchema,
  RegisterPaymentCommandSchema,
  VoidPaymentCommandSchema,
  redactedBillingBuyer,
  type BillingAccountStatement,
  type BillingPeriodPaymentState,
  type BillingPaymentResponse,
  type ListResponse,
} from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingAccountReadPort } from '../ports/billing-account-read.port';
import { buildPageMeta, clampPage } from '../../../common/pagination';
import { suggestFifoAllocations } from './allocation';

type Queryable = Pick<EntityManager, 'query'>;

type PaymentRow = {
  id: string;
  tenant_id: string;
  subscriber_id: string;
  method: string;
  amount: string;
  paid_at: string;
  reference: string | null;
  note: string | null;
  idempotency_key: string;
  allocations_fingerprint: string | null;
  status: string;
  void_reason_code: string | null;
  void_note: string | null;
  voided_at: Date | string | null;
  voided_by: string | null;
  created_by: string;
  created_at: Date | string;
  allocated_amount: string;
};

type AllocationRow = {
  id: string;
  tenant_id: string;
  payment_id: string;
  document_id: string;
  amount: string;
  reversed_at: Date | string | null;
  reversed_by: string | null;
  created_by: string | null;
  created_at: Date | string;
};

type PendingDocumentRow = {
  id: string;
  due_date: string;
  pending_amount: string;
};

export type PeriodEvent = {
  name: 'billing.contract-period.paid' | 'billing.contract-period.reopened';
  payload: {
    tenantId: string;
    contractId: string;
    periodId: string;
    periodStart: string;
    occurredAt: string;
  };
};

type BlockedDataReadAccess = {
  canSeeBlocked: boolean;
  grantedBy?: 'PRIVACY_READ' | 'CRM_BLOCKED_DATA_READ';
};

type StatementDocumentRow = {
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
  blocking_reason: string | null;
  buyer_snapshot: Record<string, unknown> | null;
  issuer_snapshot: Record<string, unknown> | null;
  void_reason_code: string | null;
  void_note: string | null;
  voided_at: Date | string | null;
  voided_by: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  paid_amount: string;
};

const PAYMENT_COLUMNS = `p.id::text, p.tenant_id::text, p.subscriber_id::text, p.method,
  p.amount::text, p.paid_at::text, p.reference, p.note, p.idempotency_key, p.status,
  p.allocations_fingerprint,
  p.void_reason_code, p.void_note, p.voided_at, p.voided_by::text, p.created_by::text,
  p.created_at, COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a
    WHERE a.payment_id = p.id AND a.tenant_id = p.tenant_id AND a.reversed_at IS NULL), 0)::numeric(14,2)::text
    AS allocated_amount`;

function errorResponse(code: string, message: string): { code: string; message: string } {
  return { code, message };
}

const WITHOUT_DOCUMENT_STATE: BillingPeriodPaymentState = 'SIN_DOCUMENTO';

function tenantLocalDate(date: Date, timezone: string): string {
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

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function moneyCents(value: string | number): number {
  const decimal = typeof value === 'number' ? value.toFixed(2) : value;
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/u.exec(decimal);
  if (!match) throw new RangeError('El monto no tiene un formato monetario válido.');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function centsMoney(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

function allocationsFingerprint(
  allocations: Array<{ documentId: string; amount: string | number }> | undefined,
): string | null {
  if (allocations === undefined) return null;
  const canonical = allocations
    .map(({ documentId, amount }) => ({
      documentId,
      amount: centsMoney(moneyCents(amount)),
    }))
    .sort(
      (left, right) =>
        left.documentId.localeCompare(right.documentId) || left.amount.localeCompare(right.amount),
    );
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function mapAllocation(row: AllocationRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    paymentId: row.payment_id,
    documentId: row.document_id,
    amount: row.amount,
    reversedAt: row.reversed_at == null ? null : toIso(row.reversed_at),
    reversedBy: row.reversed_by,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

@Injectable()
export class BillingPaymentsService extends BillingAccountReadPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly contractReadPort: BillingContractReadPort,
    private readonly audit: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly privacyMarksReadPort: IPrivacyMarksReadPort,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
  ) {
    super();
  }

  async registerPayment(
    body: unknown,
    idempotencyKey: string | undefined,
    actorId: string,
  ): Promise<BillingPaymentResponse> {
    const parsed = RegisterPaymentCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        errorResponse('VALIDATION_ERROR', 'Revisa los datos enviados.'),
      );
    }
    if (!idempotencyKey || idempotencyKey.trim().length === 0 || idempotencyKey.length > 80) {
      throw new UnprocessableEntityException(
        errorResponse(
          'IDEMPOTENCY_KEY_REQUIRED',
          'La clave de idempotencia es obligatoria y admite hasta 80 caracteres.',
        ),
      );
    }

    const command = parsed.data;
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const committed = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const titular = await this.contractReadPort.lockTitularForBillingWrite(command.subscriberId, {
        manager: qr.manager,
      });
      if (!titular.exists) throw this.subscriberNotFound();
      if (titular.anonymized) throw this.anonymizedConflict();

      await this.lockSubscriber(qr.manager, command.subscriberId);

      const existing = await this.findPaymentByKey(qr.manager, tenantId, idempotencyKey);
      if (existing) {
        await this.assertSameIdempotentRequest(qr.manager, existing, command);
        return {
          payment: await this.toPaymentResponse(qr.manager, existing),
          events: [] as PeriodEvent[],
        };
      }

      const rows = (await qr.manager.query(
        `INSERT INTO billing_payments (
           tenant_id, subscriber_id, method, amount, paid_at, reference, note,
           idempotency_key, allocations_fingerprint, created_by
         ) VALUES ($1, $2::uuid, $3, $4::numeric, $5::date, $6, $7, $8, $9, $10::uuid)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING id::text`,
        [
          tenantId,
          command.subscriberId,
          command.method,
          typeof command.amount === 'number' ? command.amount.toFixed(2) : command.amount,
          command.paidAt,
          command.reference ?? null,
          command.note ?? null,
          idempotencyKey,
          allocationsFingerprint(command.allocations),
          actorId,
        ],
      )) as Array<{ id: string }>;

      if (!rows[0]) {
        const concurrent = await this.findPaymentByKey(qr.manager, tenantId, idempotencyKey);
        if (!concurrent) throw new Error('No se pudo releer el pago idempotente.');
        await this.assertSameIdempotentRequest(qr.manager, concurrent, command);
        return {
          payment: await this.toPaymentResponse(qr.manager, concurrent),
          events: [] as PeriodEvent[],
        };
      }

      const paymentId = rows[0].id;
      const allocations = command.allocations
        ? command.allocations.map(({ documentId, amount }) => ({
            documentId,
            amount: typeof amount === 'number' ? amount.toFixed(2) : amount,
          }))
        : await this.suggestAllocations(qr.manager, tenantId, command.subscriberId, command.amount);
      const periods = await this.applyAllocations(
        qr.manager,
        tenantId,
        paymentId,
        command.subscriberId,
        allocations,
        actorId,
      );
      const events = await this.recalculateSignals(qr.manager, tenantId, periods);
      await this.audit.logWithin(
        {
          action: AuditAction.CREATE,
          entityType: 'BillingPayment',
          entityId: paymentId,
          userId: actorId,
          newValue: {
            method: command.method,
            amount: typeof command.amount === 'number' ? command.amount.toFixed(2) : command.amount,
            paidAt: command.paidAt,
            allocationCount: allocations.length,
          },
        },
        qr.manager,
      );
      const payment = await this.findPaymentById(qr.manager, tenantId, paymentId);
      if (!payment) throw new Error('El pago no quedó disponible después del registro.');
      return { payment: await this.toPaymentResponse(qr.manager, payment), events };
    });

    await this.emitEvents(committed.events);
    return committed.payment;
  }

  async allocateCredit(
    paymentId: string,
    body: unknown,
    actorId: string,
  ): Promise<BillingPaymentResponse> {
    const parsed = AllocateCreditCommandSchema.safeParse(body);
    if (!parsed.success || parsed.data.allocations.some((item) => item.paymentId !== paymentId)) {
      throw new UnprocessableEntityException(
        errorResponse('VALIDATION_ERROR', 'Revisa las asignaciones enviadas.'),
      );
    }
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const command = parsed.data;
    const committed = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const titular = await this.contractReadPort.lockTitularForBillingWrite(command.subscriberId, {
        manager: qr.manager,
      });
      if (!titular.exists) throw this.subscriberNotFound();
      if (titular.anonymized) throw this.anonymizedConflict();

      await this.lockSubscriber(qr.manager, command.subscriberId);

      const payment = await this.findPaymentById(qr.manager, tenantId, paymentId, true);
      if (!payment)
        throw new NotFoundException(
          errorResponse('BILLING_PAYMENT_NOT_FOUND', 'No se encontró el pago.'),
        );
      if (payment.status !== 'REGISTRADO') throw this.paymentVoidedConflict();
      if (payment.subscriber_id !== command.subscriberId) {
        throw new UnprocessableEntityException(
          errorResponse('VALIDATION_ERROR', 'El titular del pago no coincide.'),
        );
      }
      const allocations = command.allocations.map(({ documentId, amount }) => ({
        documentId,
        amount: typeof amount === 'number' ? amount.toFixed(2) : amount,
      }));
      const periods = await this.applyAllocations(
        qr.manager,
        tenantId,
        paymentId,
        command.subscriberId,
        allocations,
        actorId,
      );
      const events = await this.recalculateSignals(qr.manager, tenantId, periods);
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'BillingPayment',
          entityId: paymentId,
          userId: actorId,
          newValue: { action: 'ALLOCATION', allocationCount: allocations.length },
        },
        qr.manager,
      );
      const after = await this.findPaymentById(qr.manager, tenantId, paymentId);
      if (!after) throw new Error('El pago dejó de estar disponible durante la asignación.');
      return { payment: await this.toPaymentResponse(qr.manager, after), events };
    });
    await this.emitEvents(committed.events);
    return committed.payment;
  }

  async voidPayment(
    paymentId: string,
    body: unknown,
    actorId: string,
  ): Promise<BillingPaymentResponse> {
    const parsed = VoidPaymentCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        errorResponse('VALIDATION_ERROR', 'Revisa los datos enviados.'),
      );
    }
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const committed = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const payment = await this.findPaymentById(qr.manager, tenantId, paymentId, true);
      if (!payment)
        throw new NotFoundException(
          errorResponse('BILLING_PAYMENT_NOT_FOUND', 'No se encontró el pago.'),
        );
      if (payment.status !== 'REGISTRADO') throw this.paymentVoidedConflict();

      const allocations = (await qr.manager.query(
        `SELECT DISTINCT d.period_id::text AS period_id
           FROM billing_payment_allocations a
           JOIN billing_documents d ON d.id = a.document_id AND d.tenant_id = a.tenant_id
          WHERE a.payment_id = $1::uuid AND a.tenant_id = $2 AND a.reversed_at IS NULL`,
        [paymentId, tenantId],
      )) as Array<{ period_id: string }>;
      await qr.manager.query(
        `UPDATE billing_payment_allocations
            SET reversed_at = now(), reversed_by = $1::uuid
          WHERE payment_id = $2::uuid AND tenant_id = $3 AND reversed_at IS NULL`,
        [actorId, paymentId, tenantId],
      );
      await qr.manager.query(
        `UPDATE billing_payments
            SET status = 'ANULADO', void_reason_code = $1, void_note = $2,
                voided_at = now(), voided_by = $3::uuid
          WHERE id = $4::uuid AND tenant_id = $5`,
        [parsed.data.reasonCode, parsed.data.note ?? null, actorId, paymentId, tenantId],
      );
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'BillingPayment',
          entityId: paymentId,
          userId: actorId,
          oldValue: { status: 'REGISTRADO' },
          newValue: { status: 'ANULADO', reasonCode: parsed.data.reasonCode },
        },
        qr.manager,
      );
      const events = await this.recalculateSignals(
        qr.manager,
        tenantId,
        allocations.map(({ period_id }) => period_id),
      );
      const after = await this.findPaymentById(qr.manager, tenantId, paymentId);
      if (!after) throw new Error('El pago dejó de estar disponible durante la anulación.');
      return { payment: await this.toPaymentResponse(qr.manager, after), events };
    });
    await this.emitEvents(committed.events);
    return committed.payment;
  }

  async getPayment(paymentId: string): Promise<BillingPaymentResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const payment = await this.findPaymentById(qr.manager, tenantId, paymentId);
      if (!payment)
        throw new NotFoundException(
          errorResponse('BILLING_PAYMENT_NOT_FOUND', 'No se encontró el pago.'),
        );
      return this.toPaymentResponse(qr.manager, payment);
    });
  }

  async listPayments(
    query: { page?: number; limit?: number } = {},
    readAccess: {
      actorId?: string;
      canSeeBlocked?: boolean;
      grantedBy?: 'PRIVACY_READ' | 'CRM_BLOCKED_DATA_READ';
    } = {},
  ): Promise<ListResponse<BillingPaymentResponse>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { page, limit } = clampPage(
      query.page ?? 1,
      Math.max(1, Math.min(100, Math.trunc(query.limit ?? 20))),
    );
    const { payments, total } = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const countRows = (await qr.manager.query(
        `SELECT COUNT(*)::int AS total FROM billing_payments WHERE tenant_id = $1`,
        [tenantId],
      )) as Array<{ total: number }>;
      const rows = (await qr.manager.query(
        `SELECT ${PAYMENT_COLUMNS}
           FROM billing_payments p
          WHERE p.tenant_id = $1
          ORDER BY p.paid_at DESC, p.created_at DESC, p.id DESC
          LIMIT $2 OFFSET $3`,
        [tenantId, limit, (page - 1) * limit],
      )) as PaymentRow[];
      const payments = await Promise.all(
        rows.map((row) => this.toPaymentResponse(qr.manager, row)),
      );
      return { payments, total: countRows[0]?.total ?? 0 };
    });

    const meta = buildPageMeta({ total, page, limit });
    if (payments.length === 0) return { data: payments, meta };

    // Los puertos usan el mismo pool. Resuélvelos después de liberar la conexión de Billing.
    const subscriberIds = [...new Set(payments.map((payment) => payment.subscriberId))];
    const [refs, names] = await Promise.all([
      this.contractReadPort.findTitularRefs(subscriberIds),
      this.contractReadPort.findTitularDisplayNames(subscriberIds),
    ]);
    const refBySubscriber = new Map(refs.map((ref) => [ref.subscriberId, ref]));
    const nameBySubscriber = new Map(names.map((item) => [item.subscriberId, item.displayName]));
    const partyIds = [
      ...new Set(refs.map((ref) => ref.partyId).filter((id): id is string => !!id)),
    ];
    const marks = partyIds.length ? await this.privacyMarksReadPort.activeMarks(partyIds) : {};
    const isBlocked = (subscriberId: string) => {
      const partyId = refBySubscriber.get(subscriberId)?.partyId;
      return !!partyId && (marks[partyId] ?? []).includes('DATOS_BLOQUEADOS');
    };
    const blockedServed = payments.filter((payment) => isBlocked(payment.subscriberId)).length;
    const { actorId, canSeeBlocked, grantedBy } = readAccess;
    if (blockedServed > 0 && canSeeBlocked) {
      if (!actorId || !grantedBy) throw this.privacyUnavailable();
      try {
        await runInTenantSchema(this.dataSource, schemaName, (qr) =>
          this.audit.logWithin(
            {
              action: AuditAction.LIST_ACCESS,
              entityType: 'BillingPayment',
              entityId: 'N/A',
              userId: actorId,
              newValue: { totalServed: payments.length, blockedServed, grantedBy },
            },
            qr.manager,
          ),
        );
      } catch {
        throw this.privacyUnavailable();
      }
    }

    const data = payments.map((payment) => {
      const ref = refBySubscriber.get(payment.subscriberId);
      const anonymized = !ref || ref.anonymized;
      const redact = !anonymized && isBlocked(payment.subscriberId) && !canSeeBlocked;
      return {
        ...payment,
        subscriberDisplayName: anonymized
          ? null
          : redact
            ? '[Dato protegido por custodia legal]'
            : (nameBySubscriber.get(payment.subscriberId) ?? null),
        subscriberProtected: anonymized || redact,
      };
    });
    return { data, meta };
  }

  async periodStates(
    contractIds: string[],
    localDate: string,
  ): Promise<
    Record<
      string,
      { state: BillingPeriodPaymentState; paidAmount: string | null; totalAmount: string | null }
    >
  > {
    if (contractIds.length === 0) return {};
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, (qr) =>
      this.periodStatesWithin(qr.manager, tenantId, contractIds, localDate),
    );
  }

  /**
   * RS-19: el estado de un contrato es el de su periodo más reciente con
   * `generation_date <= localDate`; sin periodo, o sin documento emitido y vigente,
   * es `SIN_DOCUMENTO` (ADR-103 D3). No depende de `cutoff_date`, que puede ser nula
   * o no coincidir con la fecha de la agenda.
   * RS-22: devuelve importes nulos en `SIN_DOCUMENTO`.
   */
  private async periodStatesWithin(
    manager: Queryable,
    tenantId: string,
    contractIds: string[],
    localDate: string,
  ): Promise<
    Record<
      string,
      { state: BillingPeriodPaymentState; paidAmount: string | null; totalAmount: string | null }
    >
  > {
    const result: Record<
      string,
      { state: BillingPeriodPaymentState; paidAmount: string | null; totalAmount: string | null }
    > = {};
    for (const contractId of contractIds)
      result[contractId] = { state: WITHOUT_DOCUMENT_STATE, paidAmount: null, totalAmount: null };
    if (contractIds.length === 0) return result;

    const rows = (await manager.query(
      `WITH latest AS (
         SELECT DISTINCT ON (p.contract_id)
                p.id, p.contract_id, p.due_date
           FROM billing_periods p
          WHERE p.tenant_id = $1 AND p.contract_id = ANY($2::uuid[])
            AND p.generation_date <= $3::date
          ORDER BY p.contract_id, p.period_start DESC
       )
       SELECT l.contract_id::text AS contract_id, l.due_date::text AS due_date,
              d.id::text AS document_id, d.total::text AS total,
              COALESCE(SUM(a.amount) FILTER (WHERE a.reversed_at IS NULL), 0)::numeric(14,2)::text
                AS paid_amount
         FROM latest l
         LEFT JOIN billing_documents d
           ON d.period_id = l.id AND d.tenant_id = $1 AND d.status = 'EMITIDO'
         LEFT JOIN billing_payment_allocations a
           ON a.document_id = d.id AND a.tenant_id = d.tenant_id
        GROUP BY l.contract_id, l.due_date, d.id`,
      [tenantId, contractIds, localDate],
    )) as Array<{
      contract_id: string;
      due_date: string;
      document_id: string | null;
      total: string | null;
      paid_amount: string;
    }>;
    for (const row of rows) {
      if (!row.document_id || row.total == null) continue;
      const paid = moneyCents(row.paid_amount);
      const total = moneyCents(row.total);
      const state: BillingPeriodPaymentState =
        paid >= total
          ? 'PAGADO'
          : localDate > row.due_date
            ? 'VENCIDO'
            : paid > 0
              ? 'PARCIAL'
              : 'PENDIENTE';
      result[row.contract_id] = {
        state,
        paidAmount: centsMoney(paid),
        totalAmount: centsMoney(total),
      };
    }
    return result;
  }

  async statementForSubscriber(
    subscriberId: string,
    actorId?: string,
    readAccess: BlockedDataReadAccess = { canSeeBlocked: false },
  ): Promise<BillingAccountStatement> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const [titular] = await this.contractReadPort.findTitularRefs([subscriberId]);
    if (!titular || titular.anonymized) throw this.subscriberNotFound();

    // Fecha civil del tenant fuera de la transacción: el puerto de ajustes no usa su conexión.
    const { timezone } = await this.tenantSettings.getSnapshot({ tenantId });
    const localDate = tenantLocalDate(new Date(), timezone);

    let blocked = false;
    let impersonationMarks: Record<string, string[]> = {};
    if (titular.partyId) {
      try {
        impersonationMarks = await this.privacyMarksReadPort.activeMarks([titular.partyId]);
        blocked = (impersonationMarks[titular.partyId] ?? []).includes('DATOS_BLOQUEADOS');
      } catch {
        throw this.privacyUnavailable();
      }
    }
    const buyerProtected = blocked && !readAccess.canSeeBlocked;

    // RS-22: la señal de suspensión por suplantación vive en CRM; se resuelve por el
    // puerto ANTES de la transacción (un puerto dentro abriría otra conexión).
    const suspendedByImpersonation =
      await this.contractReadPort.hasImpersonationSuspension(subscriberId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // RS-22: misma condición de omisión por suplantación del paso 2b de §6.1.
      const impersonationHold =
        (titular.partyId != null &&
          (impersonationMarks[titular.partyId] ?? []).includes('VICTIMA_FALSEDAD_PERSONAL')) ||
        suspendedByImpersonation;
      const documentRows = (await qr.manager.query(
        `SELECT d.id::text, d.tenant_id::text, d.period_id::text, d.contract_id::text,
                d.subscriber_id::text, d.status, d.number, d.issue_date::text, d.due_date::text,
                p.period_start::text AS period_start, p.period_end::text AS period_end,
                p.covered_start::text AS covered_start,
                d.subtotal::text, d.tax_total::text, d.total::text,
                d.unbilled_additional_count, d.blocking_reason, d.buyer_snapshot,
                d.issuer_snapshot, d.void_reason_code, d.void_note, d.voided_at,
                d.voided_by::text, d.created_by::text, d.created_at, d.updated_at,
                COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a
                           WHERE a.document_id = d.id AND a.tenant_id = d.tenant_id
                             AND a.reversed_at IS NULL), 0)::numeric(14,2)::text AS paid_amount
           FROM billing_documents d
            JOIN billing_periods p ON p.id = d.period_id AND p.tenant_id = d.tenant_id
          WHERE d.tenant_id = $1 AND d.subscriber_id = $2::uuid
          ORDER BY d.issue_date DESC NULLS LAST, d.created_at DESC, d.id DESC`,
        [tenantId, subscriberId],
      )) as StatementDocumentRow[];

      const paymentCountRows = (await qr.manager.query(
        `SELECT COALESCE((SELECT SUM(p.amount) FROM billing_payments p
                           WHERE p.tenant_id = $1 AND p.subscriber_id = $2::uuid
                             AND p.status = 'REGISTRADO'), 0)::numeric(14,2)::text
                  AS registered_amount,
                COALESCE((SELECT SUM(a.amount)
                            FROM billing_payment_allocations a
                            JOIN billing_payments p ON p.id = a.payment_id AND p.tenant_id = a.tenant_id
                           WHERE p.tenant_id = $1 AND p.subscriber_id = $2::uuid
                             AND a.reversed_at IS NULL), 0)::numeric(14,2)::text
                  AS allocated_amount`,
        [tenantId, subscriberId],
      )) as Array<{ registered_amount: string; allocated_amount: string }>;
      const payments = (await qr.manager.query(
        `SELECT ${PAYMENT_COLUMNS}
           FROM billing_payments p
          WHERE p.tenant_id = $1 AND p.subscriber_id = $2::uuid
          ORDER BY p.paid_at DESC, p.created_at DESC, p.id DESC`,
        [tenantId, subscriberId],
      )) as PaymentRow[];
      const paymentResponses = await Promise.all(
        payments.map((payment) => this.toPaymentResponse(qr.manager, payment)),
      );

      let totalInvoicedCents = 0;
      let totalPaidCents = 0;
      let totalPendingCents = 0;
      const summaryByContract = new Map<
        string,
        { totalInvoiced: number; totalPaid: number; totalPending: number }
      >();
      const documents = documentRows.map((row) => {
        const isIssued = row.status === 'EMITIDO';
        const totalCents = moneyCents(row.total);
        const paidCents = isIssued ? Math.min(totalCents, moneyCents(row.paid_amount)) : 0;
        const pendingCents = isIssued ? Math.max(0, totalCents - paidCents) : 0;
        if (isIssued) {
          totalInvoicedCents += totalCents;
          totalPaidCents += paidCents;
          totalPendingCents += pendingCents;
          const summary = summaryByContract.get(row.contract_id) ?? {
            totalInvoiced: 0,
            totalPaid: 0,
            totalPending: 0,
          };
          summary.totalInvoiced += totalCents;
          summary.totalPaid += paidCents;
          summary.totalPending += pendingCents;
          summaryByContract.set(row.contract_id, summary);
        }
        return {
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
          paymentState:
            row.status !== 'EMITIDO' ? null : this.statementDocumentState(row, localDate),
          buyerProtected,
          subtotal: row.subtotal,
          taxTotal: row.tax_total,
          total: row.total,
          unbilledAdditionalCount: row.unbilled_additional_count,
          blockingReason: row.blocking_reason,
          buyerSnapshot: buyerProtected ? { ...redactedBillingBuyer() } : row.buyer_snapshot,
          issuerSnapshot: row.issuer_snapshot,
          voidReasonCode: row.void_reason_code,
          voidNote: row.void_note,
          ...(row.voided_at == null ? {} : { voidedAt: toIso(row.voided_at) }),
          voidedBy: row.voided_by,
          createdBy: row.created_by,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
          paidAmount: centsMoney(paidCents),
          pendingAmount: centsMoney(pendingCents),
        };
      });
      const periodStates = await this.periodStatesWithin(
        qr.manager,
        tenantId,
        [...summaryByContract.keys()],
        localDate,
      );
      const paymentsRegisteredCents = moneyCents(paymentCountRows[0]?.registered_amount ?? '0.00');
      const allocatedCents = moneyCents(paymentCountRows[0]?.allocated_amount ?? '0.00');
      const statement = BillingAccountStatementSchema.parse({
        subscriberId,
        buyerProtected,
        impersonationHold,
        totalInvoiced: centsMoney(totalInvoicedCents),
        totalPaid: centsMoney(totalPaidCents),
        totalPending: centsMoney(totalPendingCents),
        creditBalance: centsMoney(Math.max(0, paymentsRegisteredCents - allocatedCents)),
        documents,
        payments: paymentResponses,
        contractSummaries: [...summaryByContract.entries()].map(([contractId, summary]) => ({
          contractId,
          totalInvoiced: centsMoney(summary.totalInvoiced),
          totalPaid: centsMoney(summary.totalPaid),
          totalPending: centsMoney(summary.totalPending),
          periodState: periodStates[contractId]?.state ?? WITHOUT_DOCUMENT_STATE,
        })),
      });

      if (blocked && readAccess.canSeeBlocked) {
        if (!readAccess.grantedBy || !actorId) throw this.privacyUnavailable();
        try {
          await this.audit.logWithin(
            {
              action: AuditAction.RECORD_ACCESS,
              entityType: 'BillingSubscriberStatement',
              entityId: subscriberId,
              userId: actorId,
              newValue: { privacyMark: 'DATOS_BLOQUEADOS', grantedBy: readAccess.grantedBy },
            },
            qr.manager,
          );
        } catch {
          throw this.privacyUnavailable();
        }
      }
      return statement;
    });
  }
  private statementDocumentState(
    row: Pick<StatementDocumentRow, 'total' | 'paid_amount' | 'due_date'>,
    localDate: string,
  ): BillingPeriodPaymentState {
    const paid = moneyCents(row.paid_amount);
    const total = moneyCents(row.total);
    if (paid >= total) return 'PAGADO';
    if (localDate > row.due_date) return 'VENCIDO';
    if (paid > 0) return 'PARCIAL';
    return 'PENDIENTE';
  }
  private async suggestAllocations(
    manager: Queryable,
    tenantId: string,
    subscriberId: string,
    amount: string | number,
  ) {
    // Primero bloqueamos; la segunda sentencia obtiene una foto posterior al bloqueo.
    const locked = (await manager.query(
      `SELECT id FROM billing_documents WHERE tenant_id=$1 AND subscriber_id=$2 AND status='EMITIDO' ORDER BY due_date,id FOR UPDATE`,
      [tenantId, subscriberId],
    )) as Array<{ id: string }>;
    const rows = (await manager.query(
      `SELECT d.id::text, d.due_date::text, (d.total-COALESCE(SUM(a.amount) FILTER(WHERE a.reversed_at IS NULL),0))::numeric(14,2)::text AS pending_amount
       FROM billing_documents d LEFT JOIN billing_payment_allocations a ON a.document_id=d.id AND a.tenant_id=d.tenant_id
       WHERE d.tenant_id=$1 AND d.id=ANY($2::uuid[]) GROUP BY d.id ORDER BY d.due_date,d.id`,
      [tenantId, locked.map((x) => x.id)],
    )) as PendingDocumentRow[];
    return suggestFifoAllocations(
      amount,
      rows.map(({ id, due_date, pending_amount }) => ({
        documentId: id,
        dueDate: due_date,
        pendingAmount: pending_amount,
      })),
    );
  }

  private async applyAllocations(
    manager: Queryable,
    tenantId: string,
    paymentId: string,
    subscriberId: string,
    allocations: Array<{ documentId: string; amount: string }>,
    actorId: string | null,
  ): Promise<string[]> {
    if (allocations.length === 0) return [];
    const paymentRows = (await manager.query(
      `SELECT amount::text FROM billing_payments
        WHERE id = $1::uuid AND tenant_id = $2 AND subscriber_id = $3::uuid
          AND status = 'REGISTRADO'
        FOR UPDATE`,
      [paymentId, tenantId, subscriberId],
    )) as Array<{ amount: string }>;
    const payment = paymentRows[0];
    if (!payment)
      throw new NotFoundException(
        errorResponse('BILLING_PAYMENT_NOT_FOUND', 'No se encontró el pago.'),
      );

    const usedRows = (await manager.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text AS allocated_amount
         FROM billing_payment_allocations
        WHERE payment_id = $1::uuid AND tenant_id = $2 AND reversed_at IS NULL`,
      [paymentId, tenantId],
    )) as Array<{ allocated_amount: string }>;
    let paymentRemaining =
      moneyCents(payment.amount) - moneyCents(usedRows[0]?.allocated_amount ?? '0.00');
    const ordered = allocations
      .map((item) => ({ ...item, cents: moneyCents(item.amount) }))
      .sort((left, right) => left.documentId.localeCompare(right.documentId));
    const periods = new Set<string>();
    for (const item of ordered) {
      if (item.cents <= 0 || item.cents > paymentRemaining) throw this.allocationExceeded();
      const docs = (await manager.query(
        `SELECT d.id::text, d.subscriber_id::text, d.period_id::text,
                d.status, d.total::text
           FROM billing_documents d
          WHERE d.id = $1::uuid AND d.tenant_id = $2
          FOR UPDATE`,
        [item.documentId, tenantId],
      )) as Array<{
        id: string;
        subscriber_id: string;
        period_id: string;
        status: string;
        total: string;
      }>;
      const document = docs[0];
      if (!document || document.subscriber_id !== subscriberId) {
        throw new NotFoundException(
          errorResponse('BILLING_DOCUMENT_NOT_FOUND', 'No se encontró el documento.'),
        );
      }
      if (document.status !== 'EMITIDO') {
        throw new ConflictException(
          errorResponse('BILLING_DOCUMENT_NOT_ISSUED', 'El documento no está emitido.'),
        );
      }
      const paidRows = (await manager.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text AS paid_amount
           FROM billing_payment_allocations
          WHERE document_id = $1::uuid AND tenant_id = $2 AND reversed_at IS NULL`,
        [document.id, tenantId],
      )) as Array<{ paid_amount: string }>;
      const pending = moneyCents(document.total) - moneyCents(paidRows[0]?.paid_amount ?? '0.00');
      if (item.cents > pending) throw this.allocationExceeded();

      await manager.query(
        `INSERT INTO billing_payment_allocations (
           tenant_id, payment_id, document_id, amount, created_by
         ) VALUES ($1, $2::uuid, $3::uuid, $4::numeric, $5::uuid)`,
        [tenantId, paymentId, document.id, item.amount, actorId],
      );
      paymentRemaining -= item.cents;
      periods.add(document.period_id);
    }
    return [...periods];
  }

  async lockSubscriber(manager: Queryable, subscriberId: string): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `billing-credit:${subscriberId}`,
    ]);
  }

  /** RS-17: remanentes de pagos registrados, del más antiguo al más nuevo. */
  async applyCreditWithin(
    manager: EntityManager,
    tenantId: string,
    documentId: string,
    subscriberId: string,
    actorId: string | null,
  ): Promise<PeriodEvent[]> {
    const payments = (await manager.query(
      `SELECT id::text, amount::text FROM billing_payments WHERE tenant_id=$1 AND subscriber_id=$2 AND status='REGISTRADO' ORDER BY paid_at,created_at,id FOR UPDATE`,
      [tenantId, subscriberId],
    )) as Array<{ id: string; amount: string }>;
    const periods = new Set<string>();
    let count = 0;
    for (const payment of payments) {
      const [balance] = (await manager.query(
        `SELECT (d.total-COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a WHERE a.tenant_id=$1 AND a.document_id=d.id AND a.reversed_at IS NULL),0))::numeric(14,2)::text AS pending FROM billing_documents d WHERE d.tenant_id=$1 AND d.id=$2`,
        [tenantId, documentId],
      )) as Array<{ pending: string }>;
      const [used] = (await manager.query(
        `SELECT COALESCE(SUM(amount),0)::numeric(14,2)::text AS allocated FROM billing_payment_allocations WHERE tenant_id=$1 AND payment_id=$2 AND reversed_at IS NULL`,
        [tenantId, payment.id],
      )) as Array<{ allocated: string }>;
      const amount = Math.min(
        moneyCents(balance?.pending ?? '0.00'),
        moneyCents(payment.amount) - moneyCents(used?.allocated ?? '0.00'),
      );
      if (amount <= 0) continue;
      const affected = await this.applyAllocations(
        manager,
        tenantId,
        payment.id,
        subscriberId,
        [{ documentId, amount: centsMoney(amount) }],
        actorId,
      );
      for (const period of affected) periods.add(period);
      count += 1;
    }
    if (count)
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'BillingDocument',
          entityId: documentId,
          userId: actorId,
          newValue: { action: 'AUTO_APPLY_CREDIT', allocationCount: count },
        },
        manager,
      );
    return this.recalculateSignals(manager, tenantId, [...periods]);
  }

  async recalculateSignals(
    manager: Queryable,
    tenantId: string,
    periodIds: string[],
  ): Promise<PeriodEvent[]> {
    const events: PeriodEvent[] = [];
    for (const periodId of [...new Set(periodIds)].sort()) {
      const periodRows = (await manager.query(
        `SELECT id::text, contract_id::text, period_start::text
           FROM billing_periods WHERE id = $1::uuid AND tenant_id = $2 FOR UPDATE`,
        [periodId, tenantId],
      )) as Array<{ id: string; contract_id: string; period_start: string }>;
      const period = periodRows[0];
      if (!period) continue;
      const signalRows = (await manager.query(
        `SELECT paid FROM billing_period_signals
          WHERE period_id = $1::uuid AND tenant_id = $2 FOR UPDATE`,
        [periodId, tenantId],
      )) as Array<{ paid: boolean }>;
      const before = signalRows[0]?.paid ?? false;
      const stateRows = (await manager.query(
        `SELECT EXISTS (
                  SELECT 1 FROM billing_documents d
                   WHERE d.period_id = $1::uuid AND d.tenant_id = $2 AND d.status = 'EMITIDO'
                ) AS has_document,
                NOT EXISTS (
                  SELECT 1 FROM billing_documents d
                  WHERE d.period_id = $1::uuid AND d.tenant_id = $2 AND d.status = 'EMITIDO'
                    AND d.total > COALESCE((
                      SELECT SUM(a.amount) FROM billing_payment_allocations a
                       WHERE a.document_id = d.id AND a.tenant_id = d.tenant_id
                         AND a.reversed_at IS NULL
                    ), 0)
                ) AS all_paid`,
        [periodId, tenantId],
      )) as Array<{ has_document: boolean; all_paid: boolean }>;
      const state = stateRows[0];
      const paid = Boolean(state?.has_document && state.all_paid);
      await manager.query(
        `INSERT INTO billing_period_signals (period_id, tenant_id, paid)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT (period_id) DO UPDATE
           SET paid = EXCLUDED.paid, changed_at = now()
         WHERE billing_period_signals.paid IS DISTINCT FROM EXCLUDED.paid`,
        [periodId, tenantId, paid],
      );
      if (before !== paid) {
        events.push({
          name: paid ? 'billing.contract-period.paid' : 'billing.contract-period.reopened',
          payload: {
            tenantId,
            contractId: period.contract_id,
            periodId: period.id,
            periodStart: period.period_start,
            occurredAt: new Date().toISOString(),
          },
        });
      }
    }
    return events;
  }

  private async findPaymentByKey(
    manager: Queryable,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<PaymentRow | null> {
    const rows = (await manager.query(
      `SELECT ${PAYMENT_COLUMNS}
         FROM billing_payments p
        WHERE p.tenant_id = $1 AND p.idempotency_key = $2
        FOR UPDATE OF p`,
      [tenantId, idempotencyKey],
    )) as PaymentRow[];
    return rows[0] ?? null;
  }

  private async findPaymentById(
    manager: Queryable,
    tenantId: string,
    paymentId: string,
    lock = false,
  ): Promise<PaymentRow | null> {
    const rows = (await manager.query(
      `SELECT ${PAYMENT_COLUMNS}
         FROM billing_payments p
        WHERE p.tenant_id = $1 AND p.id = $2::uuid
        ${lock ? 'FOR UPDATE OF p' : ''}`,
      [tenantId, paymentId],
    )) as PaymentRow[];
    return rows[0] ?? null;
  }

  private async toPaymentResponse(
    manager: Queryable,
    row: PaymentRow,
  ): Promise<BillingPaymentResponse> {
    const allocationRows = (await manager.query(
      `SELECT id::text, tenant_id::text, payment_id::text, document_id::text,
              amount::text, reversed_at, reversed_by::text, created_by::text, created_at
         FROM billing_payment_allocations WHERE payment_id = $1::uuid
         ORDER BY created_at ASC, id ASC`,
      [row.id],
    )) as AllocationRow[];
    const allocated = moneyCents(row.allocated_amount);
    const amount = moneyCents(row.amount);
    const candidate = {
      id: row.id,
      tenantId: row.tenant_id,
      subscriberId: row.subscriber_id,
      method: row.method,
      amount: row.amount,
      paidAt: row.paid_at,
      reference: row.reference,
      note: row.note,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      voidReasonCode: row.void_reason_code,
      voidNote: row.void_note,
      ...(row.voided_at == null ? {} : { voidedAt: toIso(row.voided_at) }),
      voidedBy: row.voided_by,
      createdBy: row.created_by,
      createdAt: toIso(row.created_at),
      allocatedAmount: centsMoney(allocated),
      unallocatedAmount: centsMoney(amount - allocated),
      allocations: allocationRows.map(mapAllocation),
    };
    return BillingPaymentResponseSchema.parse(candidate);
  }

  private async assertSameIdempotentRequest(
    manager: Queryable,
    existing: PaymentRow,
    command: ReturnType<typeof RegisterPaymentCommandSchema.parse>,
  ): Promise<void> {
    const amount = typeof command.amount === 'number' ? command.amount.toFixed(2) : command.amount;
    const sameFields =
      existing.subscriber_id === command.subscriberId &&
      existing.method === command.method &&
      existing.amount === amount &&
      existing.paid_at.slice(0, 10) === command.paidAt &&
      existing.reference === (command.reference ?? null) &&
      existing.note === (command.note ?? null);
    if (!sameFields) throw this.idempotencyConflict();
    if (existing.allocations_fingerprint !== allocationsFingerprint(command.allocations)) {
      throw this.idempotencyConflict();
    }
  }

  async emitEvents(events: PeriodEvent[]): Promise<void> {
    for (const event of events) await this.eventEmitter.emitAsync(event.name, event.payload);
  }

  private anonymizedConflict(): ConflictException {
    return new ConflictException(
      errorResponse(BILLING_ERROR_CODES.PRIVACY_TITULAR_ANONYMIZED, 'El titular está anonimizado.'),
    );
  }

  private subscriberNotFound(): NotFoundException {
    return new NotFoundException(
      errorResponse(
        BILLING_ERROR_CODES.BILLING_SUBSCRIBER_NOT_FOUND,
        'No se encontró el suscriptor.',
      ),
    );
  }

  private idempotencyConflict(): ConflictException {
    return new ConflictException(
      errorResponse(
        BILLING_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        'La clave de idempotencia ya se usó con otro contenido.',
      ),
    );
  }

  private paymentVoidedConflict(): ConflictException {
    return new ConflictException(
      errorResponse(BILLING_ERROR_CODES.BILLING_PAYMENT_VOIDED, 'El pago está anulado.'),
    );
  }

  private allocationExceeded(): UnprocessableEntityException {
    return new UnprocessableEntityException(
      errorResponse(
        BILLING_ERROR_CODES.BILLING_ALLOCATION_EXCEEDS_BALANCE,
        'La asignación supera el saldo pendiente.',
      ),
    );
  }

  private privacyUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      errorResponse(
        'PRIVACY_AUDIT_UNAVAILABLE',
        'No fue posible auditar el acceso a los datos restringidos.',
      ),
    );
  }
}
