import { z } from 'zod';
import { BILLING_PERIOD_PAYMENT_STATES, type BillingPeriodPaymentState } from './billing-constants';
import {
  BillingDocumentResponseSchema,
  type BillingDocumentResponse,
} from './billing-documents.contract';
import {
  BillingPaymentResponseSchema,
  type BillingPaymentResponse,
} from './billing-payments.contract';
import { billingMoneyStringSchema } from './billing-money.schema';
import { BillingCourtesyResponseSchema } from './billing-courtesies.contract';

export const ContractBillingSummarySchema = z
  .object({
    contractId: z.string().uuid(),
    totalInvoiced: billingMoneyStringSchema,
    totalPaid: billingMoneyStringSchema,
    /**
     * «Cortesías otorgadas» del contrato (spec MOD14 2026-11-12 R4): todas las activas sobre
     * cartera, es decir, las líneas `CORTESIA` de documentos emitidos más los ajustes
     * `AJUSTE_SOBRE_EMITIDO` aplicados. No son pago. La API siempre lo envía; es opcional para no
     * romper consumidores anteriores al bloque D.
     */
    totalCourtesy: billingMoneyStringSchema.optional(),
    totalPending: billingMoneyStringSchema,
    periodState: z.enum(BILLING_PERIOD_PAYMENT_STATES).optional(),
    /**
     * Contrato `ACTIVE` sin ninguna fila en `billing_periods` (spec 2026-11-11 R1). La ficha y
     * la pestaña Facturación lo muestran como «Contrato activo sin cobros generados» (R2).
     */
    billingNotStarted: z.boolean().default(false),
  })
  .strict();

export type ContractBillingSummary = z.infer<typeof ContractBillingSummarySchema>;

/** Estado de cuenta consolidado del suscriptor (HLD §4, §6.5, RS-21, RS-22). */
export const BillingAccountStatementSchema = z
  .object({
    subscriberId: z.string().uuid(),
    buyerProtected: z.boolean(),
    impersonationHold: z.boolean(),
    totalInvoiced: billingMoneyStringSchema,
    totalPaid: billingMoneyStringSchema,
    /**
     * «Cortesías otorgadas» del titular (spec MOD14 2026-11-12 R4): líneas `CORTESIA` de los
     * documentos emitidos más los ajustes `AJUSTE_SOBRE_EMITIDO` activos. No son pago. Solo los
     * ajustes bajan `totalPending`; la línea ya bajó el total facturado.
     */
    totalCourtesy: billingMoneyStringSchema.optional(),
    totalPending: billingMoneyStringSchema,
    /**
     * Retenciones vigentes del titular sobre documentos en cartera (spec MOD14 2026-11-13 R8).
     * Ya están dentro de `totalPaid`. La API siempre lo envía.
     */
    totalWithholding: billingMoneyStringSchema.optional(),
    creditBalance: billingMoneyStringSchema,
    documents: z.array(BillingDocumentResponseSchema),
    payments: z.array(BillingPaymentResponseSchema),
    /** Cortesías del titular, activas y anuladas, de la más reciente a la más antigua (siempre enviado). */
    courtesies: z.array(BillingCourtesyResponseSchema).optional(),
    contractSummaries: z.array(ContractBillingSummarySchema).default([]),
  })
  .strict();

export type BillingAccountStatement = z.infer<typeof BillingAccountStatementSchema>;

// ---------------------------------------------------------------------------------------------
// Libro del estado de cuenta (spec MOD05↔MOD14 2026-11-13 D4, D7, R2). Aditivo: extiende el
// estado de cuenta consolidado sin cambiar su contrato.
// ---------------------------------------------------------------------------------------------

function isLedgerCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= daysInMonth;
}

/** Monto con signo compatible con numeric(14,2): el saldo corrido puede quedar a favor. */
const ledgerSignedMoneySchema = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/u)
  .refine((value) => Math.abs(Number(value)) <= 999_999_999_999.99);

/** Fecha civil AAAA-MM-DD válida (sin hora ni zona). */
export const billingCivilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine(isLedgerCivilDate, 'La fecha debe ser una fecha civil válida.');

/**
 * Periodo del libro: ambos extremos opcionales e inclusivos. Sin `to`, el libro llega hasta hoy
 * en la zona del tenant (o hasta el último movimiento, si alguno es posterior). Los filtros de la
 * UI (3 y 6 meses, año, rango, todo) se traducen a `from`/`to` en el portal.
 */
export const BillingStatementLedgerQuerySchema = z
  .object({
    from: billingCivilDateSchema.optional(),
    to: billingCivilDateSchema.optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['from'],
  });

export type BillingStatementLedgerQuery = z.infer<typeof BillingStatementLedgerQuerySchema>;

/**
 * Tipo de fila del libro. Efecto en el saldo: `DOCUMENTO` es cargo; `PAGO`, `RETENCION` y
 * `CORTESIA` son abono; `DOCUMENTO_ANULADO` y `PAGO_ANULADO` son informativas (efecto 0);
 * `SALDO_ANTERIOR` abre el libro filtrado con el saldo acumulado antes de `from`.
 */
export const BILLING_STATEMENT_LEDGER_ROW_KINDS = [
  'SALDO_ANTERIOR',
  'DOCUMENTO',
  'DOCUMENTO_ANULADO',
  'CORTESIA',
  'PAGO',
  'RETENCION',
  'PAGO_ANULADO',
] as const;

export type BillingStatementLedgerRowKind = (typeof BILLING_STATEMENT_LEDGER_ROW_KINDS)[number];

export const BillingStatementLedgerRowSchema = z
  .object({
    kind: z.enum(BILLING_STATEMENT_LEDGER_ROW_KINDS),
    /** Fecha civil del movimiento en la zona del tenant. */
    date: billingCivilDateSchema,
    /**
     * Número del documento (o el externo de un importado), referencia del pago (nula si el
     * titular tiene datos bloqueados y el lector no tiene permiso) o código del impuesto retenido.
     */
    reference: z.string().nullable(),
    debit: billingMoneyStringSchema,
    credit: billingMoneyStringSchema,
    /** Saldo corrido: cargos − abonos. Negativo = saldo a favor del titular. */
    balance: ledgerSignedMoneySchema,
    documentId: z.string().uuid().nullable(),
    paymentId: z.string().uuid().nullable(),
    /** Vencimiento del documento (solo filas `DOCUMENTO`). */
    dueDate: billingCivilDateSchema.nullable(),
    /** Documento vencido con saldo, o saldado con un pago posterior al vencimiento. */
    late: z.boolean().optional(),
    /** Medio del pago (filas `PAGO` y `PAGO_ANULADO`). */
    method: BillingPaymentResponseSchema.shape.method.optional(),
    /** Consecutivo del recibo, si el pago lo tiene. */
    receiptNumber: z.number().int().positive().nullable().optional(),
  })
  .strict();

export type BillingStatementLedgerRow = z.infer<typeof BillingStatementLedgerRowSchema>;

/**
 * Libro cronológico del estado de cuenta (spec 2026-11-13 D4, R2). Sin filtro, `closingBalance`
 * es `totalPending − creditBalance` del estado de cuenta consolidado.
 */
export const BillingStatementLedgerSchema = z
  .object({
    subscriberId: z.string().uuid(),
    from: billingCivilDateSchema.nullable(),
    to: billingCivilDateSchema,
    openingBalance: ledgerSignedMoneySchema,
    closingBalance: ledgerSignedMoneySchema,
    buyerProtected: z.boolean(),
    rows: z.array(BillingStatementLedgerRowSchema),
  })
  .strict();

export type BillingStatementLedger = z.infer<typeof BillingStatementLedgerSchema>;
