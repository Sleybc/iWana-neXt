import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import type { DataSource } from 'typeorm';
import {
  TenantContext,
  isValidSchemaName,
  runInTenantSchema,
  summarizeErrorForLog,
} from '@iwana/db';
import { AuditAction, type BillingEmailReasonCode, type BillingEmailStatus } from '@iwana/shared';
import { SanitizeFailedReason } from '../../../common/sanitize-failed-reason.decorator';
import { AuditService } from '../../audit/audit.service';
import { MailerService } from '../../mailer/mailer.service';
import { billingDocumentEmailTemplate } from '../../mailer/templates/billing-document-email.template';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { resolveRegisteredTenant } from '../../tenant/ports/resolve-registered-tenant';
import { TenantLifecycleReadPort } from '../../tenant/ports/tenant-lifecycle-read.port';
import { renderBillingDocumentPdf } from '../documents/billing-documents.pdf';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import { BillingTitularContactReadPort } from '../ports/billing-titular-contact-read.port';
import { BillingStatementLedgerService } from '../statement/billing-statement-ledger.service';
import { maskEmailAddress } from './billing-email-mask';
import {
  BILLING_EMAIL_ATTEMPTS,
  BILLING_EMAIL_JOB,
  BILLING_EMAIL_QUEUE,
  type BillingEmailJobPayload,
} from './billing-email.constants';
import { BillingReceiptPdfSource } from './billing-receipt-pdf.source';
import {
  BILLING_EMAIL_LOG_COLUMNS,
  titularEmailRestriction,
  type BillingEmailLogRow,
} from './billing-emails.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function parseBillingEmailPayload(value: unknown): BillingEmailJobPayload {
  const invalid = () =>
    new UnrecoverableError('Los datos del envío del correo de facturación no son válidos.');
  if (!value || typeof value !== 'object') throw invalid();
  const payload = value as Partial<BillingEmailJobPayload>;
  if (
    typeof payload.tenantId !== 'string' ||
    !UUID_PATTERN.test(payload.tenantId) ||
    typeof payload.tenantSlug !== 'string' ||
    !TENANT_SLUG_PATTERN.test(payload.tenantSlug) ||
    typeof payload.schemaName !== 'string' ||
    !isValidSchemaName(payload.schemaName) ||
    typeof payload.logId !== 'string' ||
    !UUID_PATTERN.test(payload.logId)
  ) {
    throw invalid();
  }
  return {
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    schemaName: payload.schemaName,
    logId: payload.logId,
  };
}

/** El documento o el pago dejó de poder enviarse entre la solicitud y el envío. */
class NotSendableError extends Error {}

/** `filename` nulo: se usa el nombre saneado de la plantilla. */
type Attachment = { filename: string | null; content: Buffer; reference: string | number | null };

/**
 * Envío de documento de cobro, recibo o estado de cuenta al titular (spec MOD05↔MOD14
 * 2026-11-13 D5, D9, D10, R4, CA-4, CA-6). Patrón `contract-signed-copy`.
 *
 * Idempotente por fila de `billing_email_log`: si la fila ya es terminal no hace nada, y el envío
 * se hace con la fila bloqueada (FOR UPDATE), que se marca `ENVIADO` en la misma transacción. Las
 * lecturas de otros servicios (correo, marcas, PDF) van antes, fuera de esa transacción, para no
 * abrir conexiones anidadas. Titular anonimizado o con DATOS_BLOQUEADOS → `RECHAZADO` /
 * `TITULAR_RESTRINGIDO`; sin correo → `RECHAZADO` / `SIN_CORREO`. Si el envío falla, la
 * transacción revierte y BullMQ reintenta; al agotar los intentos la fila pasa a `ERROR` /
 * `FALLO_DE_ENVIO`. Nunca se guarda el mensaje del servidor de correo; los logs solo llevan ids.
 */
@Injectable()
@Processor(BILLING_EMAIL_QUEUE)
export class BillingEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingEmailProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly titulars: BillingTitularContactReadPort,
    private readonly privacyMarks: IPrivacyMarksReadPort,
    private readonly documents: BillingDocumentsService,
    private readonly receipts: BillingReceiptPdfSource,
    private readonly payments: BillingPaymentsService,
    private readonly ledgers: BillingStatementLedgerService,
    private readonly issuers: BillingIssuerReadPort,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    @Inject(TenantLifecycleReadPort) private readonly tenants: TenantLifecycleReadPort,
  ) {
    super();
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== BILLING_EMAIL_JOB) {
      this.logger.warn(`[billing-email] Job no reconocido omitido: ${job.name}`);
      return;
    }
    await this.send(parseBillingEmailPayload(job.data));
  }

  /** Al agotar los reintentos (o con un error definitivo), la fila queda `ERROR` / `FALLO_DE_ENVIO`. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<unknown> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const attempts = job.opts.attempts ?? BILLING_EMAIL_ATTEMPTS;
    if ((job.attemptsMade ?? 0) < attempts && !(error instanceof UnrecoverableError)) return;
    let payload: BillingEmailJobPayload;
    try {
      payload = parseBillingEmailPayload(job.data);
    } catch {
      return;
    }
    try {
      const tenant = await resolveRegisteredTenant(this.tenants, payload);
      await TenantContext.run(
        { tenantId: tenant.id, schemaName: tenant.schemaName, tenantSlug: tenant.slug },
        () => this.finalize(tenant.id, tenant.schemaName, payload.logId, 'ERROR', 'FALLO_DE_ENVIO'),
      );
    } catch (failure) {
      this.logger.warn(
        `billing.email.fail_mark_failed logId=${payload.logId} ${summarizeErrorForLog(failure)}`,
      );
    }
  }

  /** Expuesto para pruebas. Devuelve el estado resultante o null si la fila no existe. */
  async send(untrusted: BillingEmailJobPayload): Promise<BillingEmailStatus | null> {
    // SEC-7: schema y slug salen del registro de tenants; el payload solo se contrasta.
    const tenant = await resolveRegisteredTenant(this.tenants, untrusted);
    const tenantId = tenant.id;
    const schemaName = tenant.schemaName;
    return TenantContext.run(
      { tenantId, schemaName, tenantSlug: tenant.slug },
      async (): Promise<BillingEmailStatus | null> => {
        const row = await this.readRow(tenantId, schemaName, untrusted.logId);
        if (!row) {
          this.logger.warn(`[billing-email] Registro inexistente logId=${untrusted.logId}`);
          return null;
        }
        if (row.status !== 'EN_COLA') return row.status;

        const titular = await this.titulars.findTitularEmail(row.subscriber_id);
        if (!titular.exists) {
          return this.finalize(tenantId, schemaName, row.id, 'ERROR', 'FALLO_DE_ENVIO');
        }
        const restriction = await titularEmailRestriction(titular, this.privacyMarks);
        if (restriction || !titular.email) {
          return this.finalize(
            tenantId,
            schemaName,
            row.id,
            'RECHAZADO',
            restriction ?? 'SIN_CORREO',
          );
        }

        let attachment: Attachment;
        try {
          attachment = await this.attachment(row);
        } catch (error) {
          if (error instanceof NotSendableError) {
            return this.finalize(tenantId, schemaName, row.id, 'ERROR', 'FALLO_DE_ENVIO');
          }
          throw error;
        }
        const { legalName } = await this.issuers.getIssuerIdentity(tenantId);
        const template = billingDocumentEmailTemplate({
          kind: row.kind,
          legalName,
          reference: attachment.reference,
          periodFrom: row.period_from,
          periodTo: row.period_to,
        });

        return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
          const locked = (await qr.query(
            `SELECT status, recipient_masked FROM billing_email_log
              WHERE tenant_id = $1 AND id = $2::uuid
              FOR UPDATE`,
            [tenantId, row.id],
          )) as Array<{ status: BillingEmailStatus; recipient_masked: string | null }>;
          const current = locked[0];
          if (!current) return null;
          if (current.status !== 'EN_COLA') return current.status;

          // SEC-01: cerrar sin enviar en esta misma transacción (finalize() abriría otra conexión
          // y esperaría por el bloqueo que ya tenemos).
          const closeLocked = async (
            status: Extract<BillingEmailStatus, 'RECHAZADO' | 'ERROR'>,
            reasonCode: BillingEmailReasonCode,
          ): Promise<BillingEmailStatus> => {
            await qr.query(
              `UPDATE billing_email_log
                  SET status = $3, reason_code = $4, processed_at = now(),
                      recipient_masked = CASE WHEN $5::boolean THEN NULL ELSE recipient_masked END
                WHERE tenant_id = $1 AND id = $2::uuid`,
              [tenantId, row.id, status, reasonCode, status === 'RECHAZADO'],
            );
            await this.audit.logWithin(
              {
                action: AuditAction.UPDATE,
                entityType: 'BillingEmail',
                entityId: row.id,
                newValue: { kind: row.kind, status, reasonCode },
              },
              qr.manager,
            );
            this.logger.log(
              `billing.email.${status.toLowerCase()} logId=${row.id} reason=${reasonCode}`,
            );
            return status;
          };

          // (a) La supresión del titular vació el destinatario mientras se armaba el adjunto.
          if (row.recipient_masked != null && current.recipient_masked == null) {
            return closeLocked('RECHAZADO', 'TITULAR_RESTRINGIDO');
          }
          // (b) Con la fila bloqueada se relee el titular y sus marcas; si el puerto de
          // privacidad falla, lanza y la transacción revierte sin enviar (BullMQ reintenta).
          const currentTitular = await this.titulars.findTitularEmail(row.subscriber_id);
          if (!currentTitular.exists) return closeLocked('ERROR', 'FALLO_DE_ENVIO');
          const restrictionNow = await titularEmailRestriction(currentTitular, this.privacyMarks);
          if (restrictionNow || !currentTitular.email) {
            return closeLocked('RECHAZADO', restrictionNow ?? 'SIN_CORREO');
          }
          const to = currentTitular.email;

          await this.mailer.sendMail({
            to,
            subject: template.subject,
            html: template.html,
            text: template.text,
            attachments: [
              {
                filename: attachment.filename ?? template.filename,
                content: attachment.content,
                contentType: 'application/pdf',
              },
            ],
          });
          // (c) Nunca reescribe un destinatario que la supresión ya vació.
          await qr.query(
            `UPDATE billing_email_log
                SET status = 'ENVIADO', reason_code = NULL, processed_at = now(),
                    recipient_masked = CASE WHEN recipient_masked IS NULL THEN NULL ELSE $3 END,
                    subject = $4
              WHERE tenant_id = $1 AND id = $2::uuid`,
            [tenantId, row.id, maskEmailAddress(to), template.subject],
          );
          await this.audit.logWithin(
            {
              action: AuditAction.UPDATE,
              entityType: 'BillingEmail',
              entityId: row.id,
              newValue: { kind: row.kind, status: 'ENVIADO' },
            },
            qr.manager,
          );
          this.logger.log(`billing.email.sent logId=${row.id} kind=${row.kind}`);
          return 'ENVIADO' as const;
        });
      },
    );
  }

  private async attachment(row: BillingEmailLogRow): Promise<Attachment> {
    try {
      switch (row.kind) {
        case 'FACTURA': {
          if (!row.document_id) throw new NotSendableError();
          const document = await this.documents.pdfDocument(row.document_id, row.requested_by);
          if (document.status !== 'EMITIDO') throw new NotSendableError();
          return {
            filename: null,
            content: await renderBillingDocumentPdf(document),
            reference: document.number ?? null,
          };
        }
        case 'RECIBO': {
          if (!row.payment_id) throw new NotSendableError();
          // SEC-04: un pago anulado después de encolar ya no se envía.
          const payment = await this.payments.getPayment(row.payment_id, {
            canSeeBlocked: false,
            actorId: row.requested_by,
          });
          if (payment.status !== 'REGISTRADO') throw new NotSendableError();
          const receipt = await this.receipts.receiptPdf(row.payment_id, {
            canSeeBlocked: false,
            actorId: row.requested_by,
          });
          return {
            filename: receipt.filename,
            content: receipt.content,
            reference: receipt.receiptNumber,
          };
        }
        case 'ESTADO_CUENTA': {
          const pdf = await this.ledgers.ledgerPdf(
            row.subscriber_id,
            {
              ...(row.period_from ? { from: row.period_from } : {}),
              ...(row.period_to ? { to: row.period_to } : {}),
            },
            row.requested_by,
            { canSeeBlocked: false },
          );
          return { filename: pdf.filename, content: pdf.content, reference: null };
        }
      }
    } catch (error) {
      // Documento o pago borrado, o ya no enviable (anulado, sin emitir): no se reintenta.
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw new NotSendableError();
      }
      throw error;
    }
  }

  private async readRow(
    tenantId: string,
    schemaName: string,
    logId: string,
  ): Promise<BillingEmailLogRow | null> {
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT ${BILLING_EMAIL_LOG_COLUMNS} FROM billing_email_log
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenantId, logId],
      ),
    )) as BillingEmailLogRow[];
    return rows[0] ?? null;
  }

  /** Cierra una fila `EN_COLA` sin enviar; si ya es terminal, devuelve su estado sin tocarla. */
  private async finalize(
    tenantId: string,
    schemaName: string,
    logId: string,
    status: Extract<BillingEmailStatus, 'RECHAZADO' | 'ERROR'>,
    reasonCode: BillingEmailReasonCode,
  ): Promise<BillingEmailStatus | null> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const locked = (await qr.query(
        `SELECT status, kind FROM billing_email_log
          WHERE tenant_id = $1 AND id = $2::uuid
          FOR UPDATE`,
        [tenantId, logId],
      )) as Array<{ status: BillingEmailStatus; kind: string }>;
      const current = locked[0];
      if (!current) return null;
      if (current.status !== 'EN_COLA') return current.status;
      // Un rechazo no deja destinatario (CA-6); un error conserva el enmascarado de la solicitud.
      await qr.query(
        `UPDATE billing_email_log
            SET status = $3, reason_code = $4, processed_at = now(),
                recipient_masked = CASE WHEN $5::boolean THEN NULL ELSE recipient_masked END
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenantId, logId, status, reasonCode, status === 'RECHAZADO'],
      );
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'BillingEmail',
          entityId: logId,
          newValue: { kind: current.kind, status, reasonCode },
        },
        qr.manager,
      );
      this.logger.log(`billing.email.${status.toLowerCase()} logId=${logId} reason=${reasonCode}`);
      return status;
    });
  }
}
