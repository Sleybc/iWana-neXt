import { z } from 'zod';
import {
  BILLING_PAYMENT_METHODS,
  BILLING_PAYMENT_STATUSES,
  BILLING_PAYMENT_VOID_REASONS,
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
    createdBy: z.string().uuid().nullable(),
    createdAt: z.string(),
  })
  .strict();

export type BillingPaymentAllocationResponse = z.infer<
  typeof BillingPaymentAllocationResponseSchema
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
  })
  .strict();

export type BillingPaymentResponse = z.infer<typeof BillingPaymentResponseSchema>;
