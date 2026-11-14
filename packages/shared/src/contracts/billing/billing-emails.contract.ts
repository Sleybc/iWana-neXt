import { z } from 'zod';
import {
  BillingStatementLedgerQuerySchema,
  billingCivilDateSchema,
} from './billing-accounts.contract';

/**
 * Envíos por correo de Facturación (spec MOD05↔MOD14 2026-11-13 D5, D9, D10, R4, CA-4, CA-6).
 *
 * El destinatario es siempre el correo registrado del titular, nunca uno libre. El registro
 * (`billing_email_log`) guarda el destinatario enmascarado, el asunto generado, el estado y un
 * código de motivo cerrado: nunca el mensaje de error del servidor de correo ni texto libre.
 */
export const BILLING_EMAIL_KINDS = ['FACTURA', 'RECIBO', 'ESTADO_CUENTA'] as const;
export type BillingEmailKind = (typeof BILLING_EMAIL_KINDS)[number];

/** `EN_COLA` → `ENVIADO` | `ERROR` | `RECHAZADO` (los tres últimos son terminales). */
export const BILLING_EMAIL_STATUSES = ['EN_COLA', 'ENVIADO', 'ERROR', 'RECHAZADO'] as const;
export type BillingEmailStatus = (typeof BILLING_EMAIL_STATUSES)[number];

/**
 * Motivo cerrado de un envío no realizado: `SIN_CORREO` (el titular no tiene correo registrado),
 * `TITULAR_RESTRINGIDO` (datos bloqueados o anonimizado; CA-6) y `FALLO_DE_ENVIO` (se agotaron los
 * reintentos o el documento dejó de poder enviarse).
 */
export const BILLING_EMAIL_REASON_CODES = [
  'SIN_CORREO',
  'TITULAR_RESTRINGIDO',
  'FALLO_DE_ENVIO',
] as const;
export type BillingEmailReasonCode = (typeof BILLING_EMAIL_REASON_CODES)[number];

/** Cuerpo de `POST billing/subscribers/:subscriberId/statement/send`: el periodo del libro. */
export const SendStatementEmailCommandSchema = BillingStatementLedgerQuerySchema;
export type SendStatementEmailCommand = z.infer<typeof SendStatementEmailCommandSchema>;

/** Una fila del registro de correos, sin texto libre. */
export const BillingEmailLogEntrySchema = z
  .object({
    id: z.string().uuid(),
    subscriberId: z.string().uuid(),
    kind: z.enum(BILLING_EMAIL_KINDS),
    documentId: z.string().uuid().nullable(),
    paymentId: z.string().uuid().nullable(),
    periodFrom: billingCivilDateSchema.nullable(),
    periodTo: billingCivilDateSchema.nullable(),
    /**
     * Destinatario enmascarado (`j***@d***.co`). Nulo en un rechazo y cuando el titular tiene datos
     * bloqueados y el lector no tiene permiso para verlos.
     */
    recipientMasked: z.string().max(120).nullable(),
    subject: z.string().max(200),
    status: z.enum(BILLING_EMAIL_STATUSES),
    reasonCode: z.enum(BILLING_EMAIL_REASON_CODES).nullable(),
    /** Hubo un envío `ENVIADO` anterior del mismo documento, pago o periodo. */
    resend: z.boolean(),
    requestedBy: z.string().uuid(),
    createdAt: z.string(),
    processedAt: z.string().nullable(),
  })
  .strict();

export type BillingEmailLogEntry = z.infer<typeof BillingEmailLogEntrySchema>;

/** Registro de correos del titular, del más reciente al más antiguo (máximo 200 filas). */
export const BillingEmailLogResponseSchema = z
  .object({
    subscriberId: z.string().uuid(),
    entries: z.array(BillingEmailLogEntrySchema),
  })
  .strict();

export type BillingEmailLogResponse = z.infer<typeof BillingEmailLogResponseSchema>;
