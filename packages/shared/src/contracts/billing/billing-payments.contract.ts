import { z } from 'zod';
import {
  BILLING_ALLOCATION_UNLINK_REASONS,
  BILLING_PAYMENT_METHODS,
  BILLING_PAYMENT_STATUSES,
  BILLING_PAYMENT_VOID_REASONS,
  BILLING_WITHHOLDING_MAX_LINES,
  BILLING_WITHHOLDING_TAX_CODES,
} from './billing-constants';
import { billingMoneyInputSchema, billingMoneyStringSchema } from './billing-money.schema';

function isCivilDate(value: string): boolean {
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

export const PaymentAllocationInputSchema = z
  .object({
    documentId: z.string().uuid(),
    amount: billingMoneyInputSchema(),
  })
  .strict();

export type PaymentAllocationInput = z.infer<typeof PaymentAllocationInputSchema>;

const WITHHOLDING_RATE_PATTERN = /^\d{1,3}(\.\d{1,4})?$/u;

/** Tarifa en porcentaje (4 = 4 %), mayor que 0, hasta 100 y con cuatro decimales como máximo. */
export const billingWithholdingRateInputSchema = z.union([
  z
    .number()
    .finite()
    .positive()
    .max(100)
    .refine(
      (value) => Number(value.toFixed(4)) === value,
      'La tarifa admite hasta cuatro decimales.',
    ),
  z
    .string()
    .regex(WITHHOLDING_RATE_PATTERN)
    .refine((value) => Number(value) > 0 && Number(value) <= 100),
]);

function moneyToCents(value: string | number): bigint {
  const [whole = '0', fraction = ''] = (typeof value === 'number' ? value.toFixed(2) : value).split(
    '.',
  );
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

function rateToTenThousandths(value: string | number): bigint {
  const [whole = '0', fraction = ''] = (typeof value === 'number' ? value.toFixed(4) : value).split(
    '.',
  );
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0').slice(0, 4));
}

/**
 * Valor exacto de una retención, en centavos: base × tarifa / 100 con ajuste al peso (redondeo
 * al peso entero más cercano, la mitad hacia arriba). Siempre es múltiplo de 100 centavos.
 * Decisión D4 de la spec MOD14 2026-11-13: sin tolerancia, el valor retenido debe ser este.
 */
export function expectedWithholdingCents(base: string | number, rate: string | number): number {
  // centavos × diezmilésimas de punto porcentual: 1 peso = 100 × 10_000 × 100 unidades.
  const numerator = moneyToCents(base) * rateToTenThousandths(rate);
  return Number(((numerator + 50_000_000n) / 100_000_000n) * 100n);
}

/**
 * Línea de retención del pago (spec MOD14 2026-11-13 R6). `amount` es lo que el cliente retuvo y
 * suma al valor recibido para saldar. `documentId` atribuye la retención a un documento del pago;
 * si se omite, se atribuye al primer documento aplicado con espacio suficiente.
 */
export const PaymentWithholdingInputSchema = z
  .object({
    taxCode: z.enum(BILLING_WITHHOLDING_TAX_CODES),
    base: billingMoneyInputSchema(),
    rate: billingWithholdingRateInputSchema,
    amount: billingMoneyInputSchema(),
    certificateNumber: z.string().trim().min(1).max(60),
    documentId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((line, ctx) => {
    const amount = moneyToCents(line.amount);
    if (amount > moneyToCents(line.base)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'La retención no puede superar su base.',
      });
      return;
    }
    // Decisión D4: ajuste al peso exacto, sin tolerancia.
    if (amount !== BigInt(expectedWithholdingCents(line.base, line.rate))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'El valor de la retención debe ser base × tarifa ajustado al peso.',
      });
    }
  });

export type PaymentWithholdingInput = z.infer<typeof PaymentWithholdingInputSchema>;

/** Comando para registrar un pago manual (HLD §4, §6.3). */
export const RegisterPaymentCommandSchema = z
  .object({
    subscriberId: z.string().uuid(),
    method: z.enum(BILLING_PAYMENT_METHODS),
    amount: billingMoneyInputSchema(),
    paidAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .refine(isCivilDate, 'La fecha de pago debe ser una fecha civil válida.'),
    reference: z.string().max(80).optional(),
    note: z.string().max(500).optional(),
    allocations: z.array(PaymentAllocationInputSchema).optional(),
    /**
     * Retenciones practicadas por el cliente (spec MOD14 2026-11-13 R6, R7): solo para titulares
     * agentes de retención (O-23 en el RUT, decisión D3). `amount` (valor recibido) + retenciones es lo que
     * se aplica contra el saldo, por FIFO o por `allocations`.
     */
    withholdings: z
      .array(PaymentWithholdingInputSchema)
      .max(BILLING_WITHHOLDING_MAX_LINES)
      .optional(),
  })
  .strict();

export type RegisterPaymentCommand = z.infer<typeof RegisterPaymentCommandSchema>;

/** Comando para anular un pago registrado (HLD §4, §6.3). */
export const VoidPaymentCommandSchema = z
  .object({
    reasonCode: z.enum(BILLING_PAYMENT_VOID_REASONS),
    note: z.string().max(500).optional(),
  })
  .strict();

export type VoidPaymentCommand = z.infer<typeof VoidPaymentCommandSchema>;

/**
 * Comando para desasociar una aplicación vigente de un pago (spec MOD05↔MOD14 2026-11-13 D6). El
 * valor queda como saldo a favor del pago y puede re-aplicarse. Sin texto libre.
 */
export const UnlinkAllocationCommandSchema = z
  .object({
    reasonCode: z.enum(BILLING_ALLOCATION_UNLINK_REASONS),
  })
  .strict();

export type UnlinkAllocationCommand = z.infer<typeof UnlinkAllocationCommandSchema>;

export const CreditAllocationItemSchema = z
  .object({
    paymentId: z.string().uuid(),
    documentId: z.string().uuid(),
    amount: billingMoneyInputSchema(),
  })
  .strict();

export type CreditAllocationItem = z.infer<typeof CreditAllocationItemSchema>;

/** Comando para aplicar saldo a favor a documentos emitidos (HLD §4, §6.3). */
export const AllocateCreditCommandSchema = z
  .object({
    subscriberId: z.string().uuid(),
    allocations: z.array(CreditAllocationItemSchema).min(1),
  })
  .strict();

export type AllocateCreditCommand = z.infer<typeof AllocateCreditCommandSchema>;

/** Cobertura de pago a un documento de cobro (HLD §3.1, §4). */
export const BillingPaymentAllocationResponseSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    paymentId: z.string().uuid(),
    documentId: z.string().uuid(),
    amount: billingMoneyStringSchema,
    reversedAt: z.string().nullable().optional(),
    reversedBy: z.string().uuid().nullable().optional(),
    /** Motivo de una desasociación manual; nulo en las reversiones por anulación del pago. */
    reversalReasonCode: z.enum(BILLING_ALLOCATION_UNLINK_REASONS).nullable().optional(),
    createdBy: z.string().uuid().nullable(),
    createdAt: z.string(),
  })
  .strict();

export type BillingPaymentAllocationResponse = z.infer<
  typeof BillingPaymentAllocationResponseSchema
>;

/**
 * Retención registrada con un pago (spec MOD14 2026-11-13 R6, R8). `voidedAt` se llena al anular
 * el pago o el documento al que se atribuye (H-3). `certificateNumber` es nulo tras la supresión
 * del titular o si el titular tiene datos bloqueados y el lector no tiene permiso.
 *
 * Topes del servidor (H-1): una sola retención vigente por (documento, `taxCode`); la base
 * acumulada del tipo sobre el documento no supera su subtotal antes de IVA; la tarifa no supera la
 * sugerida por Tributación más la tolerancia configurada (`BILLING_WITHHOLDING_RATE_TOLERANCE_PP`)
 * salvo con `BILLING_COURTESIES_MANAGE`.
 */
export const BillingPaymentWithholdingResponseSchema = z
  .object({
    id: z.string().uuid(),
    paymentId: z.string().uuid(),
    documentId: z.string().uuid(),
    taxCode: z.enum(BILLING_WITHHOLDING_TAX_CODES),
    base: billingMoneyStringSchema,
    /** Porcentaje con cuatro decimales, p. ej. `4.0000`. */
    rate: z.string().regex(/^\d{1,3}\.\d{4}$/u),
    amount: billingMoneyStringSchema,
    certificateNumber: z.string().nullable(),
    voidedAt: z.string().nullable(),
    createdBy: z.string().uuid(),
    createdAt: z.string(),
  })
  .strict();

export type BillingPaymentWithholdingResponse = z.infer<
  typeof BillingPaymentWithholdingResponseSchema
>;

/** Tipo de retención disponible con su tarifa sugerida por Tributación. */
export const BillingWithholdingOptionSchema = z
  .object({
    taxCode: z.enum(BILLING_WITHHOLDING_TAX_CODES),
    name: z.string(),
    /** Porcentaje sugerido (`null` si Tributación no tiene tarifa); el usuario lo puede editar. */
    suggestedRate: z.string().nullable(),
    /** `TRIBUTACION`: definición activa del tenant; `PRESET`: valor del preset del sistema. */
    source: z.enum(['TRIBUTACION', 'PRESET']),
  })
  .strict();

export type BillingWithholdingOption = z.infer<typeof BillingWithholdingOptionSchema>;

/** Opciones de retención para registrar un pago del titular (spec MOD14 2026-11-13 R7). */
export const BillingWithholdingOptionsResponseSchema = z
  .object({
    subscriberId: z.string().uuid(),
    eligible: z.boolean(),
    /**
     * Por qué puede retener: solo la responsabilidad O-23 del RUT (decisión D3 de la spec MOD14
     * 2026-11-13; `PERSONA_JURIDICA` se retiró del contrato).
     */
    eligibility: z.enum(['AGENTE_RETENEDOR']).nullable(),
    options: z.array(BillingWithholdingOptionSchema),
  })
  .strict();

export type BillingWithholdingOptionsResponse = z.infer<
  typeof BillingWithholdingOptionsResponseSchema
>;

/** Respuesta serializada de un pago (HLD §4, RS-22). */
export const BillingPaymentResponseSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    subscriberId: z.string().uuid(),
    subscriberDisplayName: z.string().nullable().optional(),
    subscriberProtected: z.boolean().optional(),
    method: z.enum(BILLING_PAYMENT_METHODS),
    amount: billingMoneyStringSchema,
    paidAt: z.string(),
    reference: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    idempotencyKey: z.string(),
    status: z.enum(BILLING_PAYMENT_STATUSES),
    voidReasonCode: z.enum(BILLING_PAYMENT_VOID_REASONS).nullable().optional(),
    voidNote: z.string().nullable().optional(),
    voidedAt: z.string().nullable().optional(),
    voidedBy: z.string().uuid().nullable().optional(),
    createdBy: z.string().uuid(),
    createdAt: z.string(),
    allocatedAmount: billingMoneyStringSchema.optional(),
    unallocatedAmount: billingMoneyStringSchema.optional(),
    allocations: z.array(BillingPaymentAllocationResponseSchema).optional(),
    /** Suma de las retenciones vigentes (no anuladas); `0.00` en un pago anulado. */
    withholdingAmount: billingMoneyStringSchema.optional(),
    /** Retenciones del pago, vigentes y anuladas (spec MOD14 2026-11-13 R8). */
    withholdings: z.array(BillingPaymentWithholdingResponseSchema).optional(),
    /**
     * Número consecutivo del recibo por tenant (spec MOD05↔MOD14 2026-11-13 D8). Inmutable; un pago
     * anulado lo conserva. Nulo en un pago importado.
     */
    receiptNumber: z.number().int().positive().nullable().optional(),
    /** El pago proviene de una importación (ADR-110); no tiene recibo de iWana. */
    imported: z.boolean().optional(),
    /** Referencia del sistema de origen de un pago importado (`uisp:…`); nulo en los nativos. */
    externalId: z.string().nullable().optional(),
  })
  .strict();

export type BillingPaymentResponse = z.infer<typeof BillingPaymentResponseSchema>;
