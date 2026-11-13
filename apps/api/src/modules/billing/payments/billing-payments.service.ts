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
  type BillingPaymentWithholdingResponse,
  type BillingWithholdingTaxCode,
  type PaymentWithholdingInput,
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
import { attributeWithholdings, WithholdingNotAttributableError } from './withholding-attribution';
import {
  BillingWithholdingOptionsService,
  rateTenThousandths,
  type WithholdingRateCeiling,
} from './billing-withholding-options.service';
import {
  activeCourtesySum,
  appliedCourtesyCents,
  courtesyLineSum,
} from '../courtesies/billing-courtesy.sql';
import {
  COURTESY_COLUMNS,
  redactCourtesyNotes,
  toCourtesyResponse,
  type CourtesyRow,
} from '../courtesies/billing-courtesy.mapper';

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
  /** Retenciones vigentes del pago (spec MOD14 2026-11-13 R6). */
  withholding_amount: string;
};

type WithholdingRow = {
  id: string;
  payment_id: string;
  document_id: string;
  tax_code: BillingPaymentWithholdingResponse['taxCode'];
  base: string;
  rate: string;
  amount: string;
  certificate_number: string | null;
  voided_at: Date | string | null;
  created_by: string;
  created_at: Date | string;
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

/**
 * Acceso del lector a los datos de un titular con DATOS_BLOQUEADOS (H-2). Sin permiso, o sin
 * indicarlo, el texto libre del pago se redacta: número de certificado, referencia y notas.
 */
export type PaymentReadAccess = BlockedDataReadAccess & { actorId?: string };

/** Opciones del registro de pago que dependen del lector (H-1 c, H-2). */
export type RegisterPaymentOptions = {
  readAccess?: PaymentReadAccess;
  /** El actor tiene `BILLING_COURTESIES_MANAGE`: puede superar el tope de tarifa (H-1 c). */
  canExceedWithholdingRate?: boolean;
};

type InsertedWithholding = PaymentWithholdingInput & {
  documentId: string;
  rate: string;
  /** Tope vigente cuando la tarifa lo superó con permiso (auditoría, H-1 c). */
  rateCeiling?: string | null;
};

type StatementDocumentRow = {
  id: string;
  tenant_id: string;
  /** `null` solo en un documento `IMPORTADO` (ADR-110 D5). */
  period_id: string | null;
  contract_id: string;
  subscriber_id: string;
  status: 'BORRADOR' | 'EMITIDO' | 'ANULADO' | 'IMPORTADO';
  number: string | null;
  external_number: string | null;
  issue_date: string | null;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  covered_start: string | null;
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
  courtesy_amount?: string;
  courtesy_line_amount?: string;
  withholding_amount?: string;
};

/**
 * Retenciones vigentes de un pago (spec MOD14 2026-11-13 R6): suman a `amount` (valor recibido)
 * en la capacidad del pago para saldar documentos.
 */
const ACTIVE_WITHHOLDING_SUM_SQL = `COALESCE((SELECT SUM(w.amount) FROM billing_payment_withholdings w
    WHERE w.payment_id = p.id AND w.tenant_id = p.tenant_id AND w.voided_at IS NULL), 0)`;

const PAYMENT_COLUMNS = `p.id::text, p.tenant_id::text, p.subscriber_id::text, p.method,
  p.amount::text, p.paid_at::text, p.reference, p.note, p.idempotency_key, p.status,
  p.allocations_fingerprint,
  p.void_reason_code, p.void_note, p.voided_at, p.voided_by::text, p.created_by::text,
  p.created_at, COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a
    WHERE a.payment_id = p.id AND a.tenant_id = p.tenant_id AND a.reversed_at IS NULL), 0)::numeric(14,2)::text
    AS allocated_amount,
  ${ACTIVE_WITHHOLDING_SUM_SQL}::numeric(14,2)::text AS withholding_amount`;

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

function moneyString(value: string | number): string {
  return centsMoney(moneyCents(value));
}

/** Clave canónica de una retención para comparar reintentos idempotentes. */
function withholdingKey(line: {
  taxCode: string;
  base: string | number;
  rate: string | number;
  amount: string | number;
  certificateNumber: string | null;
}): string {
  const rate = typeof line.rate === 'number' ? line.rate.toFixed(4) : Number(line.rate).toFixed(4);
  return [
    line.taxCode,
    moneyString(line.base),
    rate,
    moneyString(line.amount),
    line.certificateNumber ?? '',
  ].join('|');
}

function mapWithholding(row: WithholdingRow): BillingPaymentWithholdingResponse {
  return {
    id: row.id,
    paymentId: row.payment_id,
    documentId: row.document_id,
    taxCode: row.tax_code,
    base: row.base,
    rate: row.rate,
    amount: row.amount,
    certificateNumber: row.certificate_number,
    voidedAt: row.voided_at == null ? null : toIso(row.voided_at),
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

/**
 * H-2: texto libre del pago ligado al titular: número de certificado de cada retención,
 * referencia, nota y nota de anulación. Montos e IDs se conservan. El participante de supresión
 * vacía referencia y notas; el número de certificado se conserva en la base como soporte contable
 * y tributario (decisión D5 de la spec MOD14 2026-11-13), así que este ocultamiento es lo único que
 * lo protege en lecturas de titulares anonimizados o con DATOS_BLOQUEADOS.
 */
export function redactPaymentFreeText(payment: BillingPaymentResponse): BillingPaymentResponse {
  return {
    ...payment,
    ...(payment.reference !== undefined ? { reference: null } : {}),
    ...(payment.note !== undefined ? { note: null } : {}),
    ...(payment.voidNote !== undefined ? { voidNote: null } : {}),
    ...(payment.withholdings
      ? {
          withholdings: payment.withholdings.map((line) => ({ ...line, certificateNumber: null })),
        }
      : {}),
  };
}

/** TypeORM devuelve `[filas, conteo]` en un UPDATE ... RETURNING; un mock puede dar solo filas. */
export function returningRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
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
    /**
     * Topes de tarifa de retención (H-1 c). Nest siempre lo inyecta; las pruebas que no registran
     * retenciones pueden omitirlo. Sin él, un pago con retenciones se rechaza (fail closed).
     */
    private readonly withholdingRates?: BillingWithholdingOptionsService,
  ) {
    super();
  }

  async registerPayment(
    body: unknown,
    idempotencyKey: string | undefined,
    actorId: string,
    options: RegisterPaymentOptions = {},
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
    // H-1 (c): el catálogo de Tributación usa su propia conexión; se lee antes de la transacción.
    const rateCeilings = await this.resolveRateCeilings(command.withholdings ?? []);
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

      const withholdingLines = command.withholdings ?? [];
      // Spec MOD14 2026-11-13 R7 (decisión D3): solo el agente de retención (O-23) practica retenciones.
      if (withholdingLines.length > 0 && !titular.withholdingAgent) {
        throw this.withholdingNotAllowed();
      }
      const rateOverrides = this.assertRatesWithinCeiling(
        withholdingLines,
        rateCeilings,
        options.canExceedWithholdingRate === true,
      );

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
      const withholdingCents = withholdingLines.reduce(
        (sum, line) => sum + moneyCents(line.amount),
        0,
      );
      // R6: valor recibido + retenciones es lo que se aplica contra el saldo.
      const allocations = command.allocations
        ? command.allocations.map(({ documentId, amount }) => ({
            documentId,
            amount: typeof amount === 'number' ? amount.toFixed(2) : amount,
          }))
        : await this.suggestAllocations(
            qr.manager,
            tenantId,
            command.subscriberId,
            centsMoney(moneyCents(command.amount) + withholdingCents),
          );
      const withholdings = await this.insertWithholdings(
        qr.manager,
        tenantId,
        paymentId,
        command.subscriberId,
        allocations,
        withholdingLines,
        actorId,
        rateOverrides,
      );
      // H-4: las retenciones ya están insertadas en esta misma transacción. Si aplicar falla
      // (saldo excedido, documento no emitido…), la excepción revierte también las retenciones:
      // nunca quedan confirmadas sin las aplicaciones que las respaldan.
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
            // Sin número de certificado: es texto libre del titular.
            ...(withholdings.length > 0
              ? {
                  withholdingAmount: centsMoney(withholdingCents),
                  withholdings: withholdings.map((line) => ({
                    taxCode: line.taxCode,
                    base: moneyString(line.base),
                    rate: line.rate,
                    amount: moneyString(line.amount),
                    documentId: line.documentId,
                    // H-1 (c): tarifa por encima del tope, admitida con BILLING_COURTESIES_MANAGE.
                    ...(line.rateCeiling !== undefined
                      ? { rateAboveCeiling: true, rateCeiling: line.rateCeiling }
                      : {}),
                  })),
                }
              : {}),
          },
        },
        qr.manager,
      );
      const payment = await this.findPaymentById(qr.manager, tenantId, paymentId);
      if (!payment) throw new Error('El pago no quedó disponible después del registro.');
      return { payment: await this.toPaymentResponse(qr.manager, payment), events };
    });

    await this.emitEvents(committed.events);
    return this.protectPaymentForReader(committed.payment, options.readAccess, 'write');
  }

  async allocateCredit(
    paymentId: string,
    body: unknown,
    actorId: string,
    readAccess?: PaymentReadAccess,
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
    return this.protectPaymentForReader(committed.payment, readAccess, 'write');
  }

  async voidPayment(
    paymentId: string,
    body: unknown,
    actorId: string,
    readAccess?: PaymentReadAccess,
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

      const titular = await this.contractReadPort.lockTitularForBillingWrite(
        payment.subscriber_id,
        {
          manager: qr.manager,
        },
      );
      if (!titular.exists || titular.anonymized) throw this.anonymizedConflict();

      const allocations = (await qr.manager.query(
        `SELECT DISTINCT d.period_id::text AS period_id
           FROM billing_payment_allocations a
           JOIN billing_documents d ON d.id = a.document_id AND d.tenant_id = a.tenant_id
          WHERE a.payment_id = $1::uuid AND a.tenant_id = $2 AND a.reversed_at IS NULL
            AND d.status <> 'IMPORTADO' AND d.period_id IS NOT NULL`,
        [paymentId, tenantId],
      )) as Array<{ period_id: string }>;
      await qr.manager.query(
        `UPDATE billing_payment_allocations
            SET reversed_at = now(), reversed_by = $1::uuid
          WHERE payment_id = $2::uuid AND tenant_id = $3 AND reversed_at IS NULL`,
        [actorId, paymentId, tenantId],
      );
      // Spec MOD14 2026-11-13 R8: anular el pago anula sus retenciones y reabre el saldo.
      const voidedWithholdings = (await qr.manager.query(
        `UPDATE billing_payment_withholdings
            SET voided_at = now(), voided_by = $1::uuid
          WHERE payment_id = $2::uuid AND tenant_id = $3 AND voided_at IS NULL
          RETURNING amount::text`,
        [actorId, paymentId, tenantId],
      )) as unknown;
      const voidedWithholdingRows = returningRows<{ amount: string }>(voidedWithholdings);
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
          newValue: {
            status: 'ANULADO',
            reasonCode: parsed.data.reasonCode,
            ...(voidedWithholdingRows.length > 0
              ? {
                  voidedWithholdingCount: voidedWithholdingRows.length,
                  voidedWithholdingAmount: centsMoney(
                    voidedWithholdingRows.reduce((sum, row) => sum + moneyCents(row.amount), 0),
                  ),
                }
              : {}),
          },
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
    return this.protectPaymentForReader(committed.payment, readAccess, 'write');
  }

  async getPayment(
    paymentId: string,
    readAccess?: PaymentReadAccess,
  ): Promise<BillingPaymentResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const payment = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const row = await this.findPaymentById(qr.manager, tenantId, paymentId);
      if (!row)
        throw new NotFoundException(
          errorResponse('BILLING_PAYMENT_NOT_FOUND', 'No se encontró el pago.'),
        );
      return this.toPaymentResponse(qr.manager, row);
    });
    return this.protectPaymentForReader(payment, readAccess, 'read');
  }

  /**
   * H-2: aplica al pago de un solo titular la misma regla del listado. Anonimizado, o con
   * DATOS_BLOQUEADOS y sin permiso: se redacta el texto libre (certificado, referencia, notas).
   * Con permiso sobre un bloqueado: se audita el acceso (RECORD_ACCESS).
   *
   * Se resuelve después del commit: los puertos usan su propia conexión del pool. En lectura
   * (`read`), si no se pueden verificar las marcas o auditar el acceso, responde 503 como el
   * listado. En escritura (`write`) el pago ya quedó confirmado: en esos casos redacta (fail
   * closed) en lugar de fallar; el reintento idempotente devuelve el mismo pago.
   */
  private async protectPaymentForReader(
    payment: BillingPaymentResponse,
    readAccess: PaymentReadAccess | undefined,
    mode: 'read' | 'write',
  ): Promise<BillingPaymentResponse> {
    const access: PaymentReadAccess = readAccess ?? { canSeeBlocked: false };
    const redacted = (): BillingPaymentResponse => ({
      ...redactPaymentFreeText(payment),
      subscriberProtected: true,
    });
    const fail = (): BillingPaymentResponse => {
      if (mode === 'read') throw this.privacyUnavailable();
      return redacted();
    };
    let ref: { partyId: string | null; anonymized: boolean } | undefined;
    try {
      [ref] = await this.contractReadPort.findTitularRefs([payment.subscriberId]);
    } catch {
      return fail();
    }
    if (!ref || ref.anonymized) return redacted();
    let blocked = false;
    if (ref.partyId) {
      try {
        const marks = await this.privacyMarksReadPort.activeMarks([ref.partyId]);
        blocked = (marks[ref.partyId] ?? []).includes('DATOS_BLOQUEADOS');
      } catch {
        return fail();
      }
    }
    if (!blocked) return { ...payment, subscriberProtected: false };
    if (!access.canSeeBlocked) return redacted();
    const { actorId, grantedBy } = access;
    if (!actorId || !grantedBy) return fail();
    const { schemaName } = TenantContext.getOrThrow();
    try {
      await runInTenantSchema(this.dataSource, schemaName, (qr) =>
        this.audit.logWithin(
          {
            action: AuditAction.RECORD_ACCESS,
            entityType: 'BillingPayment',
            entityId: payment.id,
            userId: actorId,
            newValue: { privacyMark: 'DATOS_BLOQUEADOS', grantedBy },
          },
          qr.manager,
        ),
      );
    } catch {
      return fail();
    }
    return { ...payment, subscriberProtected: false };
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
        ...(anonymized || redact ? redactPaymentFreeText(payment) : payment),
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
                AS paid_amount,
              ${activeCourtesySum('d')}::numeric(14,2)::text AS courtesy_amount
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
      courtesy_amount?: string;
    }>;
    for (const row of rows) {
      if (!row.document_id || row.total == null) continue;
      // Spec MOD14 2026-11-12 R4: `paidAmount` del periodo es lo saldado (pagos + cortesías).
      const paid = moneyCents(row.paid_amount) + moneyCents(row.courtesy_amount ?? '0.00');
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
    // Spec 2026-11-11 R1: contratos ACTIVE del titular (CRM) para señalar los que no tienen
    // ningún periodo; los periodos se cruzan dentro de la transacción de Billing.
    const activeContractIds = await this.contractReadPort.findActiveContractIds(subscriberId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // RS-22: misma condición de omisión por suplantación del paso 2b de §6.1.
      const impersonationHold =
        (titular.partyId != null &&
          (impersonationMarks[titular.partyId] ?? []).includes('VICTIMA_FALSEDAD_PERSONAL')) ||
        suspendedByImpersonation;
      const documentRows = (await qr.manager.query(
        `SELECT d.id::text, d.tenant_id::text, d.period_id::text, d.contract_id::text,
                d.subscriber_id::text, d.status, d.number, d.external_number,
                d.issue_date::text, d.due_date::text,
                p.period_start::text AS period_start, p.period_end::text AS period_end,
                p.covered_start::text AS covered_start,
                d.subtotal::text, d.tax_total::text, d.total::text,
                d.unbilled_additional_count, d.blocking_reason, d.buyer_snapshot,
                d.issuer_snapshot, d.void_reason_code, d.void_note, d.voided_at,
                d.voided_by::text, d.created_by::text, d.created_at, d.updated_at,
                COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a
                           WHERE a.document_id = d.id AND a.tenant_id = d.tenant_id
                             AND a.reversed_at IS NULL), 0)::numeric(14,2)::text AS paid_amount,
                ${activeCourtesySum('d')}::numeric(14,2)::text AS courtesy_amount,
                ${courtesyLineSum('d')}::numeric(14,2)::text AS courtesy_line_amount,
                COALESCE((SELECT SUM(w.amount) FROM billing_payment_withholdings w
                           WHERE w.document_id = d.id AND w.tenant_id = d.tenant_id
                             AND w.voided_at IS NULL), 0)::numeric(14,2)::text AS withholding_amount
           FROM billing_documents d
            -- ADR-110 D5: un IMPORTADO no tiene periodo y sí cuenta en el estado de cuenta.
            LEFT JOIN billing_periods p ON p.id = d.period_id AND p.tenant_id = d.tenant_id
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
                  AS allocated_amount,
                COALESCE((SELECT SUM(w.amount)
                            FROM billing_payment_withholdings w
                            JOIN billing_payments p ON p.id = w.payment_id AND p.tenant_id = w.tenant_id
                           WHERE p.tenant_id = $1 AND p.subscriber_id = $2::uuid
                             AND p.status = 'REGISTRADO' AND w.voided_at IS NULL), 0)::numeric(14,2)::text
                  AS withholding_amount`,
        [tenantId, subscriberId],
      )) as Array<{
        registered_amount: string;
        allocated_amount: string;
        withholding_amount: string;
      }>;
      const payments = (await qr.manager.query(
        `SELECT ${PAYMENT_COLUMNS}
           FROM billing_payments p
          WHERE p.tenant_id = $1 AND p.subscriber_id = $2::uuid
          ORDER BY p.paid_at DESC, p.created_at DESC, p.id DESC`,
        [tenantId, subscriberId],
      )) as PaymentRow[];
      const paymentResponses = await Promise.all(
        payments.map((payment) => this.toPaymentResponse(qr.manager, payment, buyerProtected)),
      );

      const courtesyRows = (await qr.manager.query(
        `SELECT ${COURTESY_COLUMNS} FROM billing_courtesies c
          WHERE c.tenant_id = $1 AND c.subscriber_id = $2::uuid
          ORDER BY c.created_at DESC, c.id DESC`,
        [tenantId, subscriberId],
      )) as CourtesyRow[] | undefined;

      let totalInvoicedCents = 0;
      let totalPaidCents = 0;
      let totalCourtesyCents = 0;
      let totalPendingCents = 0;
      let totalWithholdingCents = 0;
      const summaryByContract = new Map<
        string,
        { totalInvoiced: number; totalPaid: number; totalCourtesy: number; totalPending: number }
      >();
      const documents = documentRows.map((row) => {
        // Cartera: emitidos de iWana e históricos importados (ADR-110 D5).
        const isIssued = row.status === 'EMITIDO' || row.status === 'IMPORTADO';
        const totalCents = moneyCents(row.total);
        const paidCents = isIssued ? Math.min(totalCents, moneyCents(row.paid_amount)) : 0;
        // Spec MOD14 2026-11-12 R4/R5: la cortesía baja el saldo sin ser pago ni superarlo.
        const courtesyCents = appliedCourtesyCents({
          status: row.status,
          totalCents,
          paidCents,
          adjustmentCents: moneyCents(row.courtesy_amount ?? '0.00'),
        });
        const pendingCents = isIssued ? Math.max(0, totalCents - paidCents - courtesyCents) : 0;
        // «Cortesías otorgadas»: ajustes activos más las líneas CORTESIA ya emitidas.
        const grantedCents = isIssued
          ? courtesyCents + moneyCents(row.courtesy_line_amount ?? '0.00')
          : 0;
        // R8: retenciones vigentes del documento; ya son parte de lo pagado.
        const withholdingCents = isIssued
          ? Math.min(paidCents, moneyCents(row.withholding_amount ?? '0.00'))
          : 0;
        if (isIssued) {
          totalWithholdingCents += withholdingCents;
          totalInvoicedCents += totalCents;
          totalPaidCents += paidCents;
          totalCourtesyCents += grantedCents;
          totalPendingCents += pendingCents;
          const summary = summaryByContract.get(row.contract_id) ?? {
            totalInvoiced: 0,
            totalPaid: 0,
            totalCourtesy: 0,
            totalPending: 0,
          };
          summary.totalInvoiced += totalCents;
          summary.totalPaid += paidCents;
          summary.totalCourtesy += grantedCents;
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
          externalNumber: row.external_number,
          issueDate: row.issue_date,
          dueDate: row.due_date,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          coveredStart: row.covered_start,
          paymentState: isIssued ? this.statementDocumentState(row, localDate) : null,
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
          courtesyAmount: centsMoney(courtesyCents),
          pendingAmount: centsMoney(pendingCents),
          withholdingAmount: centsMoney(withholdingCents),
        };
      });
      const periodStates = await this.periodStatesWithin(
        qr.manager,
        tenantId,
        [...summaryByContract.keys()],
        localDate,
      );
      // R1 (ampliada 2026-11-11): un contrato ACTIVE sigue «sin cobros» mientras no tenga
      // ningún documento emitido; los borradores no cuentan en cartera.
      // ADR-110 D5 (bloque C): un IMPORTADO tampoco es un cobro emitido de iWana. El contrato
      // importado no tiene periodos propios y la facturación solo arranca con «Generar primer
      // cobro» (ancla del ciclo, ADR-109); si el historial apagara la bandera, el contrato no
      // se facturaría nunca. Su historial sí suma en totales y en el resumen del contrato.
      const withIssued = activeContractIds.length
        ? new Set(
            (
              (await qr.manager.query(
                `SELECT DISTINCT contract_id::text AS contract_id
                   FROM billing_documents
                  WHERE tenant_id = $1 AND contract_id = ANY($2::uuid[])
                    AND status IN ('EMITIDO', 'ANULADO')`,
                [tenantId, activeContractIds],
              )) as Array<{ contract_id: string }>
            ).map(({ contract_id }) => contract_id),
          )
        : new Set<string>();
      const activeIds = new Set(activeContractIds);
      const notStartedIn = (contractId: string) =>
        activeIds.has(contractId) && !withIssued.has(contractId);
      const notStarted = activeContractIds.filter(
        (contractId) => !withIssued.has(contractId) && !summaryByContract.has(contractId),
      );
      const paymentsRegisteredCents = moneyCents(paymentCountRows[0]?.registered_amount ?? '0.00');
      const allocatedCents = moneyCents(paymentCountRows[0]?.allocated_amount ?? '0.00');
      const registeredWithholdingCents = moneyCents(
        paymentCountRows[0]?.withholding_amount ?? '0.00',
      );
      const statement = BillingAccountStatementSchema.parse({
        subscriberId,
        buyerProtected,
        impersonationHold,
        totalInvoiced: centsMoney(totalInvoicedCents),
        totalPaid: centsMoney(totalPaidCents),
        totalCourtesy: centsMoney(totalCourtesyCents),
        totalPending: centsMoney(totalPendingCents),
        totalWithholding: centsMoney(totalWithholdingCents),
        creditBalance: centsMoney(
          Math.max(0, paymentsRegisteredCents + registeredWithholdingCents - allocatedCents),
        ),
        documents,
        payments: paymentResponses,
        // Las notas son texto libre del titular: con DATOS_BLOQUEADOS sin permiso, null.
        courtesies: (courtesyRows ?? [])
          .map(toCourtesyResponse)
          .map((courtesy) => (buyerProtected ? redactCourtesyNotes(courtesy) : courtesy)),
        contractSummaries: [...summaryByContract.entries()]
          .map(([contractId, summary]) => ({
            contractId,
            totalInvoiced: centsMoney(summary.totalInvoiced),
            totalPaid: centsMoney(summary.totalPaid),
            totalCourtesy: centsMoney(summary.totalCourtesy),
            totalPending: centsMoney(summary.totalPending),
            periodState: periodStates[contractId]?.state ?? WITHOUT_DOCUMENT_STATE,
            billingNotStarted: notStartedIn(contractId),
          }))
          .concat(
            notStarted.map((contractId) => ({
              contractId,
              totalInvoiced: '0.00',
              totalPaid: '0.00',
              totalCourtesy: '0.00',
              totalPending: '0.00',
              periodState: WITHOUT_DOCUMENT_STATE,
              billingNotStarted: true,
            })),
          ),
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
    row: Pick<StatementDocumentRow, 'total' | 'paid_amount' | 'courtesy_amount' | 'due_date'>,
    localDate: string,
  ): BillingPeriodPaymentState {
    const paid = moneyCents(row.paid_amount) + moneyCents(row.courtesy_amount ?? '0.00');
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
      // ADR-110 D14: la deuda importada también es cobrable.
      `SELECT id FROM billing_documents WHERE tenant_id=$1 AND subscriber_id=$2 AND status IN ('EMITIDO','IMPORTADO') ORDER BY due_date,id FOR UPDATE`,
      [tenantId, subscriberId],
    )) as Array<{ id: string }>;
    const rows = (await manager.query(
      `SELECT d.id::text, d.due_date::text, (d.total-COALESCE(SUM(a.amount) FILTER(WHERE a.reversed_at IS NULL),0)-${activeCourtesySum('d')})::numeric(14,2)::text AS pending_amount
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
    // Spec MOD14 2026-11-13 R6: la capacidad del pago es valor recibido + retenciones vigentes.
    const withholdingRows = (await manager.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text AS withholding_amount
         FROM billing_payment_withholdings
        WHERE payment_id = $1::uuid AND tenant_id = $2 AND voided_at IS NULL`,
      [paymentId, tenantId],
    )) as Array<{ withholding_amount: string }> | undefined;
    let paymentRemaining =
      moneyCents(payment.amount) +
      moneyCents(withholdingRows?.[0]?.withholding_amount ?? '0.00') -
      moneyCents(usedRows[0]?.allocated_amount ?? '0.00');
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
        period_id: string | null;
        status: string;
        total: string;
      }>;
      const document = docs[0];
      if (!document || document.subscriber_id !== subscriberId) {
        throw new NotFoundException(
          errorResponse('BILLING_DOCUMENT_NOT_FOUND', 'No se encontró el documento.'),
        );
      }
      if (document.status !== 'EMITIDO' && document.status !== 'IMPORTADO') {
        throw new ConflictException(
          errorResponse('BILLING_DOCUMENT_NOT_ISSUED', 'El documento no está emitido.'),
        );
      }
      const paidRows = (await manager.query(
        `SELECT COALESCE((SELECT SUM(amount) FROM billing_payment_allocations
                           WHERE document_id = d.id AND tenant_id = d.tenant_id
                             AND reversed_at IS NULL), 0)::numeric(14,2)::text AS paid_amount,
                ${activeCourtesySum('d')}::numeric(14,2)::text AS courtesy_amount
           FROM billing_documents d
          WHERE d.id = $1::uuid AND d.tenant_id = $2`,
        [document.id, tenantId],
      )) as Array<{ paid_amount: string; courtesy_amount: string }>;
      // Spec MOD14 2026-11-12 R4: la cortesía activa ya saldó parte del documento.
      const pending =
        moneyCents(document.total) -
        moneyCents(paidRows[0]?.paid_amount ?? '0.00') -
        moneyCents(paidRows[0]?.courtesy_amount ?? '0.00');
      if (item.cents > pending) throw this.allocationExceeded();

      await manager.query(
        `INSERT INTO billing_payment_allocations (
           tenant_id, payment_id, document_id, amount, created_by
         ) VALUES ($1, $2::uuid, $3::uuid, $4::numeric, $5::uuid)`,
        [tenantId, paymentId, document.id, item.amount, actorId],
      );
      paymentRemaining -= item.cents;
      // Un IMPORTADO no tiene periodo (D5): no hay señal de periodo que recalcular.
      if (document.period_id) periods.add(document.period_id);
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
      // Spec MOD14 2026-11-13 R6: el remanente incluye las retenciones vigentes del pago.
      `SELECT p.id::text, (p.amount + ${ACTIVE_WITHHOLDING_SUM_SQL})::numeric(14,2)::text AS amount FROM billing_payments p WHERE p.tenant_id=$1 AND p.subscriber_id=$2 AND p.status='REGISTRADO' ORDER BY p.paid_at,p.created_at,p.id FOR UPDATE OF p`,
      [tenantId, subscriberId],
    )) as Array<{ id: string; amount: string }>;
    const periods = new Set<string>();
    let count = 0;
    for (const payment of payments) {
      const [balance] = (await manager.query(
        `SELECT (d.total-COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a WHERE a.tenant_id=$1 AND a.document_id=d.id AND a.reversed_at IS NULL),0)-${activeCourtesySum('d')})::numeric(14,2)::text AS pending FROM billing_documents d WHERE d.tenant_id=$1 AND d.id=$2`,
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
                    ), 0) + ${activeCourtesySum('d')}
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

  /** `redactFreeText` (estado de cuenta con titular protegido): ver `redactPaymentFreeText`. */
  private async toPaymentResponse(
    manager: Queryable,
    row: PaymentRow,
    redactFreeText = false,
  ): Promise<BillingPaymentResponse> {
    const allocationRows = (await manager.query(
      `SELECT id::text, tenant_id::text, payment_id::text, document_id::text,
              amount::text, reversed_at, reversed_by::text, created_by::text, created_at
         FROM billing_payment_allocations WHERE payment_id = $1::uuid
         ORDER BY created_at ASC, id ASC`,
      [row.id],
    )) as AllocationRow[];
    const withholdingRows = (await manager.query(
      `SELECT id::text, payment_id::text, document_id::text, tax_code, base::text,
              rate::text, amount::text, certificate_number, voided_at, created_by::text, created_at
         FROM billing_payment_withholdings WHERE payment_id = $1::uuid AND tenant_id = $2
         ORDER BY created_at ASC, tax_code ASC, id ASC`,
      [row.id, row.tenant_id],
    )) as WithholdingRow[] | undefined;
    const allocated = moneyCents(row.allocated_amount);
    const withholding = moneyCents(row.withholding_amount ?? '0.00');
    // R6: lo que el pago puede saldar es valor recibido + retenciones vigentes.
    const amount = moneyCents(row.amount) + withholding;
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
      withholdingAmount: centsMoney(withholding),
      withholdings: (withholdingRows ?? []).map(mapWithholding),
    };
    const parsed = BillingPaymentResponseSchema.parse(candidate);
    return redactFreeText ? redactPaymentFreeText(parsed) : parsed;
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
    await this.assertSameWithholdings(
      manager,
      existing.tenant_id,
      existing.id,
      command.withholdings ?? [],
    );
  }

  /**
   * Spec MOD14 2026-11-13 R6: el reintento con la misma clave debe traer las mismas retenciones.
   * Un `documentId` explícito debe coincidir con la atribución guardada; sin él, se compara el
   * resto de la línea. Un pago sin retenciones conserva el comportamiento anterior.
   */
  private async assertSameWithholdings(
    manager: Queryable,
    tenantId: string,
    paymentId: string,
    lines: PaymentWithholdingInput[],
  ): Promise<void> {
    const stored = ((await manager.query(
      `SELECT tax_code, base::text, rate::text, amount::text, certificate_number,
              document_id::text
         FROM billing_payment_withholdings WHERE payment_id = $1::uuid AND tenant_id = $2`,
      [paymentId, tenantId],
    )) ?? []) as Array<{
      tax_code: string;
      base: string;
      rate: string;
      amount: string;
      certificate_number: string | null;
      document_id: string;
    }>;
    if (stored.length !== lines.length) throw this.idempotencyConflict();
    const remaining = stored.map((row) => ({
      key: withholdingKey({
        taxCode: row.tax_code,
        base: row.base,
        rate: row.rate,
        amount: row.amount,
        certificateNumber: row.certificate_number,
      }),
      documentId: row.document_id,
    }));
    const ordered = [...lines].sort(
      (left, right) => Number(!left.documentId) - Number(!right.documentId),
    );
    for (const line of ordered) {
      const key = withholdingKey({ ...line, certificateNumber: line.certificateNumber });
      const index = remaining.findIndex(
        (row) => row.key === key && (!line.documentId || row.documentId === line.documentId),
      );
      if (index < 0) throw this.idempotencyConflict();
      remaining.splice(index, 1);
    }
  }

  /**
   * Inserta las retenciones atribuidas a los documentos del pago (spec MOD14 2026-11-13 R6, R8).
   * Va antes de aplicar: la capacidad del pago que valida `applyAllocations` las incluye.
   */
  private async insertWithholdings(
    manager: Queryable,
    tenantId: string,
    paymentId: string,
    subscriberId: string,
    allocations: Array<{ documentId: string; amount: string }>,
    lines: PaymentWithholdingInput[],
    actorId: string,
    rateOverrides: ReadonlyMap<PaymentWithholdingInput, string | null> = new Map(),
  ): Promise<InsertedWithholding[]> {
    if (lines.length === 0) return [];
    let attributed: Array<PaymentWithholdingInput & { amountCents: number; documentId: string }>;
    try {
      attributed = attributeWithholdings(
        allocations.map(({ documentId, amount }) => ({
          documentId,
          amountCents: moneyCents(amount),
        })),
        lines.map((line) => ({ ...line, amountCents: moneyCents(line.amount) })),
      );
    } catch (error) {
      if (error instanceof WithholdingNotAttributableError) throw this.withholdingNotAttributable();
      throw error;
    }
    await this.assertWithholdingCaps(manager, tenantId, attributed);
    const inserted: InsertedWithholding[] = [];
    for (const [index, line] of attributed.entries()) {
      const rate =
        typeof line.rate === 'number' ? line.rate.toFixed(4) : Number(line.rate).toFixed(4);
      await manager.query(
        `INSERT INTO billing_payment_withholdings (
           tenant_id, payment_id, document_id, subscriber_id, tax_code, base, rate, amount,
           certificate_number, created_by
         ) VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6::numeric, $7::numeric, $8::numeric,
                   $9, $10::uuid)`,
        [
          tenantId,
          paymentId,
          line.documentId,
          subscriberId,
          line.taxCode,
          moneyString(line.base),
          rate,
          moneyString(line.amount),
          line.certificateNumber,
          actorId,
        ],
      );
      const original = lines[index];
      inserted.push({
        ...line,
        rate,
        ...(original && rateOverrides.has(original)
          ? { rateCeiling: rateOverrides.get(original) ?? null }
          : {}),
      });
    }
    return inserted;
  }

  /**
   * H-1 (c): topes de tarifa por tipo, resueltos fuera de la transacción. Sin retenciones no lee
   * el catálogo. Sin el servicio de topes (composición incompleta) rechaza: nunca omite el tope.
   */
  private async resolveRateCeilings(
    lines: readonly PaymentWithholdingInput[],
  ): Promise<Map<BillingWithholdingTaxCode, WithholdingRateCeiling>> {
    if (lines.length === 0) return new Map();
    if (!this.withholdingRates) {
      throw new ServiceUnavailableException(
        errorResponse(
          'BILLING_WITHHOLDING_RATES_UNAVAILABLE',
          'No fue posible verificar las tarifas de retención.',
        ),
      );
    }
    return this.withholdingRates.rateCeilings(lines.map((line) => line.taxCode));
  }

  /**
   * H-1 (c): la tarifa no puede superar la sugerida de Tributación más la tolerancia
   * configurada (`BILLING_WITHHOLDING_RATE_TOLERANCE_PP`). Sin tarifa sugerida, cualquier tarifa
   * supera el tope. Por encima, solo con `BILLING_COURTESIES_MANAGE` (una retención inflada es una
   * condonación); si no, 422 `BILLING_WITHHOLDING_RATE_ABOVE_CEILING`. Devuelve las líneas
   * admitidas por encima del tope, con su tope, para auditarlas.
   */
  private assertRatesWithinCeiling(
    lines: readonly PaymentWithholdingInput[],
    ceilings: ReadonlyMap<BillingWithholdingTaxCode, WithholdingRateCeiling>,
    canExceed: boolean,
  ): Map<PaymentWithholdingInput, string | null> {
    const overrides = new Map<PaymentWithholdingInput, string | null>();
    for (const line of lines) {
      const ceiling = ceilings.get(line.taxCode)?.ceiling ?? null;
      const within =
        ceiling !== null && rateTenThousandths(line.rate) <= rateTenThousandths(ceiling);
      if (within) continue;
      if (!canExceed) throw this.withholdingRateAboveCeiling();
      overrides.set(line, ceiling);
    }
    return overrides;
  }

  /**
   * H-1 (a, b), con cada documento bloqueado `FOR UPDATE` (en orden de id, como
   * `applyAllocations`): una sola retención vigente por (documento, tipo) — también entre pagos;
   * el índice único parcial de la 206 lo respalda — y la base acumulada del tipo sobre el documento
   * no supera su subtotal antes de IVA.
   */
  private async assertWithholdingCaps(
    manager: Queryable,
    tenantId: string,
    lines: ReadonlyArray<{ documentId: string; taxCode: string; base: string | number }>,
  ): Promise<void> {
    const byDocument = new Map<string, Map<string, { count: number; baseCents: number }>>();
    for (const line of lines) {
      const perTax = byDocument.get(line.documentId) ?? new Map();
      const current = perTax.get(line.taxCode) ?? { count: 0, baseCents: 0 };
      perTax.set(line.taxCode, {
        count: current.count + 1,
        baseCents: current.baseCents + moneyCents(line.base),
      });
      byDocument.set(line.documentId, perTax);
    }
    for (const documentId of [...byDocument.keys()].sort()) {
      const perTax = byDocument.get(documentId) ?? new Map();
      const [document] = (await manager.query(
        `SELECT subtotal::text FROM billing_documents
          WHERE id = $1::uuid AND tenant_id = $2
          FOR UPDATE`,
        [documentId, tenantId],
      )) as Array<{ subtotal: string }>;
      // Sin documento lo rechaza `applyAllocations` (404) y la transacción se revierte.
      if (!document) continue;
      const existing = (await manager.query(
        `SELECT tax_code, COUNT(*)::int AS total,
                COALESCE(SUM(base), 0)::numeric(14,2)::text AS base
           FROM billing_payment_withholdings
          WHERE document_id = $1::uuid AND tenant_id = $2 AND voided_at IS NULL
          GROUP BY tax_code`,
        [documentId, tenantId],
      )) as Array<{ tax_code: string; total: number; base: string }>;
      const existingByTax = new Map(existing.map((row) => [row.tax_code, row]));
      const subtotalCents = moneyCents(document.subtotal);
      for (const [taxCode, incoming] of perTax) {
        const stored = existingByTax.get(taxCode);
        if (incoming.count > 1 || (stored?.total ?? 0) > 0) throw this.withholdingDuplicate();
        const cumulative = incoming.baseCents + moneyCents(stored?.base ?? '0.00');
        if (cumulative > subtotalCents) throw this.withholdingBaseExceedsSubtotal();
      }
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

  private withholdingNotAllowed(): UnprocessableEntityException {
    return new UnprocessableEntityException(
      errorResponse(
        BILLING_ERROR_CODES.BILLING_WITHHOLDING_NOT_ALLOWED,
        'Solo un titular agente de retención (O-23 en su RUT) puede registrar retenciones.',
      ),
    );
  }

  private withholdingNotAttributable(): UnprocessableEntityException {
    return new UnprocessableEntityException(
      errorResponse(
        BILLING_ERROR_CODES.BILLING_WITHHOLDING_NOT_ATTRIBUTABLE,
        'Cada retención debe corresponder a un documento que este pago salda.',
      ),
    );
  }

  private withholdingDuplicate(): UnprocessableEntityException {
    return new UnprocessableEntityException(
      errorResponse(
        BILLING_ERROR_CODES.BILLING_WITHHOLDING_DUPLICATE,
        'El documento ya tiene una retención vigente de ese tipo.',
      ),
    );
  }

  private withholdingBaseExceedsSubtotal(): UnprocessableEntityException {
    return new UnprocessableEntityException(
      errorResponse(
        BILLING_ERROR_CODES.BILLING_WITHHOLDING_BASE_EXCEEDS_SUBTOTAL,
        'La base de la retención supera el valor antes de IVA del documento.',
      ),
    );
  }

  private withholdingRateAboveCeiling(): UnprocessableEntityException {
    return new UnprocessableEntityException(
      errorResponse(
        BILLING_ERROR_CODES.BILLING_WITHHOLDING_RATE_ABOVE_CEILING,
        'La tarifa supera la sugerida por Tributación más la tolerancia permitida.',
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
