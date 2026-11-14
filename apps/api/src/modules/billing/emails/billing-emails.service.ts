import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import type { DataSource, EntityManager } from 'typeorm';
import { TenantContext, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import {
  AuditAction,
  BILLING_ERROR_CODES,
  BillingEmailLogEntrySchema,
  type BillingStatementLedgerQuery,
  type BillingEmailKind,
  type BillingEmailLogEntry,
  type BillingEmailLogResponse,
  type BillingEmailReasonCode,
  type BillingEmailStatus,
} from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { billingDocumentEmailTemplate } from '../../mailer/templates/billing-document-email.template';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import {
  BillingPaymentsService,
  type PaymentReadAccess,
} from '../payments/billing-payments.service';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import {
  BillingTitularContactReadPort,
  type BillingTitularContact,
} from '../ports/billing-titular-contact-read.port';
import { maskEmailAddress } from './billing-email-mask';
import {
  BILLING_EMAIL_ATTEMPTS,
  BILLING_EMAIL_JOB,
  BILLING_EMAIL_QUEUE,
  billingEmailJobId,
  type BillingEmailJobPayload,
} from './billing-email.constants';

/** Destino de un envío: define la idempotencia (un solo `EN_COLA` por destino). */
export interface BillingEmailTarget {
  kind: BillingEmailKind;
  subscriberId: string;
  documentId: string | null;
  paymentId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  /** Número del documento o del recibo, para el asunto. */
  reference: string | number | null;
}

export type BillingEmailLogRow = {
  id: string;
  subscriber_id: string;
  kind: BillingEmailKind;
  document_id: string | null;
  payment_id: string | null;
  period_from: string | null;
  period_to: string | null;
  recipient_masked: string | null;
  subject: string;
  status: BillingEmailStatus;
  reason_code: BillingEmailReasonCode | null;
  resend: boolean;
  requested_by: string;
  created_at: Date | string;
  processed_at: Date | string | null;
};

export const BILLING_EMAIL_LOG_COLUMNS = `id::text, subscriber_id::text, kind, document_id::text,
  payment_id::text, period_from::text, period_to::text, recipient_masked, subject, status,
  reason_code, resend, requested_by::text, created_at, processed_at`;

const EMAIL_LOG_LIMIT = 200;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toBillingEmailLogEntry(
  row: BillingEmailLogRow,
  options: { hideRecipient?: boolean } = {},
): BillingEmailLogEntry {
  return BillingEmailLogEntrySchema.parse({
    id: row.id,
    subscriberId: row.subscriber_id,
    kind: row.kind,
    documentId: row.document_id,
    paymentId: row.payment_id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    recipientMasked: options.hideRecipient ? null : row.recipient_masked,
    subject: row.subject,
    status: row.status,
    reasonCode: row.reason_code,
    resend: row.resend,
    requestedBy: row.requested_by,
    createdAt: toIso(row.created_at),
    processedAt: row.processed_at == null ? null : toIso(row.processed_at),
  });
}

/**
 * Por qué no se envía al titular (spec 2026-11-13 D10, CA-6): anonimizado o con DATOS_BLOQUEADOS
 * → `TITULAR_RESTRINGIDO`; sin correo → `SIN_CORREO`; null si se puede enviar. Si las marcas de
 * privacidad no se pueden leer, lanza: nunca se envía a ciegas.
 */
export async function titularEmailRestriction(
  titular: BillingTitularContact,
  privacyMarks: IPrivacyMarksReadPort,
): Promise<BillingEmailReasonCode | null> {
  if (titular.anonymized) return 'TITULAR_RESTRINGIDO';
  if (titular.partyId) {
    const marks = await privacyMarks.activeMarks([titular.partyId]);
    if ((marks[titular.partyId] ?? []).includes('DATOS_BLOQUEADOS')) return 'TITULAR_RESTRINGIDO';
  }
  if (!titular.email) return 'SIN_CORREO';
  return null;
}

/** El mismo destino (tipo + documento, pago o periodo) en SQL; cada parámetro con un solo tipo. */
const SAME_TARGET = `tenant_id = $1 AND kind = $2 AND subscriber_id = $3::uuid
  AND document_id IS NOT DISTINCT FROM $4::uuid AND payment_id IS NOT DISTINCT FROM $5::uuid
  AND period_from IS NOT DISTINCT FROM $6::date AND period_to IS NOT DISTINCT FROM $7::date`;

function targetParams(tenantId: string, target: BillingEmailTarget): unknown[] {
  return [
    tenantId,
    target.kind,
    target.subscriberId,
    target.documentId,
    target.paymentId,
    target.periodFrom,
    target.periodTo,
  ];
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string } | null)?.code ??
    (error as { driverError?: { code?: string } } | null)?.driverError?.code;
  return code === '23505';
}

/**
 * Solicitudes de envío por correo y registro de correos (spec MOD05↔MOD14 2026-11-13 D5, D9,
 * D10, D11, R4, CA-4, CA-6).
 *
 * Cada solicitud deja una fila en `billing_email_log`. Si el titular está restringido o no tiene
 * correo, la fila nace `RECHAZADO` con su motivo y no se encola. Si no, nace `EN_COLA` y se encola
 * con `jobId = billing-email-<logId>`; el procesador hace el envío. Idempotencia: si ya hay una fila
 * `EN_COLA` para el mismo destino, se devuelve esa (índice único parcial de la migración 208, que
 * también resuelve la carrera). Reenviar = fila nueva con `resend=true` si hubo un `ENVIADO` previo.
 */
@Injectable()
export class BillingEmailsService {
  private readonly logger = new Logger(BillingEmailsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(BILLING_EMAIL_QUEUE) private readonly queue: Queue,
    private readonly titulars: BillingTitularContactReadPort,
    private readonly privacyMarks: IPrivacyMarksReadPort,
    private readonly documents: BillingDocumentsService,
    private readonly payments: BillingPaymentsService,
    private readonly issuers: BillingIssuerReadPort,
    private readonly audit: AuditService,
  ) {}

  /** Documento de cobro: solo EMITIDO. Un IMPORTADO no tiene PDF de iWana que enviar. */
  async requestDocumentEmail(documentId: string, actorId: string): Promise<BillingEmailLogEntry> {
    const document = await this.documents.findOne(documentId, actorId);
    if (document.status === 'IMPORTADO') {
      throw new ConflictException({
        code: 'BILLING_EMAIL_IMPORTED_NOT_SENDABLE',
        message: 'Un histórico importado no se envía por correo.',
      });
    }
    if (document.status !== 'EMITIDO') {
      throw new ConflictException({
        code: 'BILLING_DOCUMENT_NOT_ISSUED',
        message: 'Solo se envía un documento emitido.',
      });
    }
    return this.request(
      {
        kind: 'FACTURA',
        subscriberId: document.subscriberId,
        documentId: document.id,
        paymentId: null,
        periodFrom: null,
        periodTo: null,
        reference: document.number ?? null,
      },
      actorId,
    );
  }

  /** Recibo de un pago registrado; el de un pago anulado no se envía. */
  async requestReceiptEmail(
    paymentId: string,
    actorId: string,
    readAccess: PaymentReadAccess,
  ): Promise<BillingEmailLogEntry> {
    const payment = await this.payments.getPayment(paymentId, readAccess);
    if (payment.status !== 'REGISTRADO') {
      throw new ConflictException({
        code: 'BILLING_PAYMENT_VOIDED',
        message: 'El recibo de un pago anulado no se envía.',
      });
    }
    // Un pago importado no tiene recibo de iWana (spec 2026-11-13 D8): no hay PDF que enviar.
    if (payment.receiptNumber == null) {
      throw new ConflictException({
        code: BILLING_ERROR_CODES.BILLING_RECEIPT_NOT_AVAILABLE,
        message: 'Este pago no tiene recibo de pago.',
      });
    }
    const receiptNumber = payment.receiptNumber;
    return this.request(
      {
        kind: 'RECIBO',
        subscriberId: payment.subscriberId,
        documentId: null,
        paymentId: payment.id,
        periodFrom: null,
        periodTo: null,
        reference: receiptNumber,
      },
      actorId,
    );
  }

  /** Estado de cuenta del periodo; sin `to`, el procesador lo arma hasta el día del envío. */
  async requestStatementEmail(
    subscriberId: string,
    command: BillingStatementLedgerQuery,
    actorId: string,
  ): Promise<BillingEmailLogEntry> {
    return this.request(
      {
        kind: 'ESTADO_CUENTA',
        subscriberId,
        documentId: null,
        paymentId: null,
        periodFrom: command.from ?? null,
        periodTo: command.to ?? null,
        reference: null,
      },
      actorId,
    );
  }

  /**
   * Registro de correos del titular. Sin `billing.payments.read` no se listan los recibos; con el
   * titular bloqueado (y sin permiso) o anonimizado, el destinatario enmascarado se oculta.
   */
  async emailLog(
    subscriberId: string,
    actorId: string,
    access: { canReadReceipts: boolean; readAccess: PaymentReadAccess },
  ): Promise<BillingEmailLogResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const titular = await this.titulars.findTitularEmail(subscriberId);
    if (!titular.exists) throw this.subscriberNotFound();
    let blocked = false;
    if (titular.partyId) {
      try {
        const marks = await this.privacyMarks.activeMarks([titular.partyId]);
        blocked = (marks[titular.partyId] ?? []).includes('DATOS_BLOQUEADOS');
      } catch {
        throw this.privacyUnavailable();
      }
    }
    const hideRecipient = titular.anonymized || (blocked && !access.readAccess.canSeeBlocked);
    const kinds: BillingEmailKind[] = access.canReadReceipts
      ? ['FACTURA', 'RECIBO', 'ESTADO_CUENTA']
      : ['FACTURA', 'ESTADO_CUENTA'];
    const rows = (await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const found = (await qr.query(
        `SELECT ${BILLING_EMAIL_LOG_COLUMNS}
           FROM billing_email_log
          WHERE tenant_id = $1 AND subscriber_id = $2::uuid AND kind = ANY($3::text[])
          ORDER BY created_at DESC, id DESC
          LIMIT ${EMAIL_LOG_LIMIT}`,
        [tenantId, subscriberId, kinds],
      )) as BillingEmailLogRow[];
      if (blocked && access.readAccess.canSeeBlocked && found.length) {
        // RS-21: lectura de un titular con DATOS_BLOQUEADOS por permiso, auditada.
        await this.audit.logWithin(
          {
            action: AuditAction.LIST_ACCESS,
            entityType: 'BillingEmailLog',
            entityId: subscriberId,
            userId: actorId,
            newValue: { grantedBy: access.readAccess.grantedBy ?? null, count: found.length },
          },
          qr.manager,
        );
      }
      return found;
    })) as BillingEmailLogRow[];
    return {
      subscriberId,
      entries: rows.map((row) => toBillingEmailLogEntry(row, { hideRecipient })),
    };
  }

  // atajo: sin tope de envíos por titular (solo idempotencia EN_COLA y throttler global), subir antes de G7 (SEC-03, P-01).
  private async request(
    target: BillingEmailTarget,
    actorId: string,
  ): Promise<BillingEmailLogEntry> {
    const { tenantId, schemaName, tenantSlug } = TenantContext.getOrThrow();
    const titular = await this.titulars.findTitularEmail(target.subscriberId);
    if (!titular.exists) throw this.subscriberNotFound();
    let restriction: BillingEmailReasonCode | null;
    try {
      restriction = await titularEmailRestriction(titular, this.privacyMarks);
    } catch {
      throw this.privacyUnavailable();
    }
    const { legalName } = await this.issuers.getIssuerIdentity(tenantId);
    const { subject } = billingDocumentEmailTemplate({
      kind: target.kind,
      legalName,
      reference: target.reference,
      periodFrom: target.periodFrom,
      periodTo: target.periodTo,
    });

    let created: { row: BillingEmailLogRow; enqueue: boolean };
    try {
      created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        if (restriction) {
          const row = await this.insert(qr.manager, tenantId, target, actorId, {
            status: 'RECHAZADO',
            reasonCode: restriction,
            recipientMasked: null,
            subject,
            resend: false,
          });
          return { row, enqueue: false };
        }
        const queued = await this.findByTarget(qr.manager, tenantId, target, 'EN_COLA');
        if (queued) return { row: queued, enqueue: false };
        const sent = await this.findByTarget(qr.manager, tenantId, target, 'ENVIADO');
        const row = await this.insert(qr.manager, tenantId, target, actorId, {
          status: 'EN_COLA',
          reasonCode: null,
          recipientMasked: maskEmailAddress(titular.email),
          subject,
          resend: sent != null,
        });
        return { row, enqueue: true };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Carrera con otra solicitud del mismo destino: el índice único parcial dejó pasar una.
      const queued = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
        this.findByTarget(qr.manager, tenantId, target, 'EN_COLA'),
      );
      if (!queued) throw error;
      created = { row: queued, enqueue: false };
    }

    if (created.enqueue) {
      const payload: BillingEmailJobPayload = {
        tenantId,
        tenantSlug,
        schemaName,
        logId: created.row.id,
      };
      try {
        await this.queue.add(BILLING_EMAIL_JOB, payload, {
          jobId: billingEmailJobId(created.row.id),
          attempts: BILLING_EMAIL_ATTEMPTS,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
        });
      } catch (error) {
        this.logger.warn(
          `billing.email.enqueue_failed logId=${created.row.id} ${summarizeErrorForLog(error)}`,
        );
        // Sin trabajo la fila no puede quedar EN_COLA: bloquearía el destino para siempre.
        await runInTenantSchema(this.dataSource, schemaName, (qr) =>
          qr.query(
            `UPDATE billing_email_log
                SET status = 'ERROR', reason_code = 'FALLO_DE_ENVIO', processed_at = now()
              WHERE tenant_id = $1 AND id = $2::uuid AND status = 'EN_COLA'`,
            [tenantId, created.row.id],
          ),
        );
        throw new ServiceUnavailableException({
          code: 'BILLING_EMAIL_QUEUE_UNAVAILABLE',
          message: 'No fue posible programar el envío. Intenta de nuevo.',
        });
      }
    }
    this.logger.log(
      `billing.email.requested logId=${created.row.id} kind=${created.row.kind} status=${created.row.status}`,
    );
    return toBillingEmailLogEntry(created.row);
  }

  private async findByTarget(
    manager: EntityManager,
    tenantId: string,
    target: BillingEmailTarget,
    status: BillingEmailStatus,
  ): Promise<BillingEmailLogRow | null> {
    const rows = (await manager.query(
      `SELECT ${BILLING_EMAIL_LOG_COLUMNS}
         FROM billing_email_log
        WHERE ${SAME_TARGET} AND status = $8
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [...targetParams(tenantId, target), status],
    )) as BillingEmailLogRow[];
    return rows[0] ?? null;
  }

  private async insert(
    manager: EntityManager,
    tenantId: string,
    target: BillingEmailTarget,
    actorId: string,
    values: {
      status: BillingEmailStatus;
      reasonCode: BillingEmailReasonCode | null;
      recipientMasked: string | null;
      subject: string;
      resend: boolean;
    },
  ): Promise<BillingEmailLogRow> {
    const rows = (await manager.query(
      `INSERT INTO billing_email_log
         (tenant_id, kind, subscriber_id, document_id, payment_id, period_from, period_to,
          status, reason_code, recipient_masked, subject, resend, requested_by, processed_at)
       VALUES ($1, $2, $3::uuid, $4::uuid, $5::uuid, $6::date, $7::date, $8, $9, $10, $11, $12,
               $13::uuid, CASE WHEN $14::boolean THEN now() END)
       RETURNING ${BILLING_EMAIL_LOG_COLUMNS}`,
      [
        ...targetParams(tenantId, target),
        values.status,
        values.reasonCode,
        values.recipientMasked,
        values.subject,
        values.resend,
        actorId,
        values.status !== 'EN_COLA',
      ],
    )) as BillingEmailLogRow[];
    const row = rows[0];
    if (!row) throw new Error('El registro de correo no se creó.');
    await this.audit.logWithin(
      {
        action: AuditAction.CREATE,
        entityType: 'BillingEmail',
        entityId: row.id,
        userId: actorId,
        newValue: {
          kind: row.kind,
          status: row.status,
          reasonCode: row.reason_code,
          documentId: row.document_id,
          paymentId: row.payment_id,
          resend: row.resend,
        },
      },
      manager,
    );
    return row;
  }

  private subscriberNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'BILLING_SUBSCRIBER_NOT_FOUND',
      message: 'No se encontró el suscriptor.',
    });
  }

  private privacyUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'BILLING_PRIVACY_UNAVAILABLE',
      message: 'No fue posible verificar la privacidad del titular.',
    });
  }
}
