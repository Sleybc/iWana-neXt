import { z } from 'zod';
import {
  BILLING_COURTESY_APPLICATIONS,
  BILLING_COURTESY_REASONS,
  BILLING_COURTESY_STATUSES,
  BILLING_COURTESY_TARGETS,
  BILLING_COURTESY_VOID_REASONS,
} from './billing-constants';
import { billingMoneyInputSchema, billingMoneyStringSchema } from './billing-money.schema';

const NOTE_MAX = 500;

/**
 * Comando «Otorgar cortesía» sobre un documento (spec MOD14 2026-11-12 D4, R4, R5).
 * `VALOR` exige `amount` (IVA incluido); `LINEA` exige `lineId` y regala el total de esa línea.
 * El motivo es de catálogo; `OTRO` exige nota.
 */
export const GrantCourtesyCommandSchema = z
  .object({
    target: z.enum(BILLING_COURTESY_TARGETS),
    amount: billingMoneyInputSchema().optional(),
    lineId: z.string().uuid().optional(),
    reasonCode: z.enum(BILLING_COURTESY_REASONS),
    note: z.string().trim().min(1).max(NOTE_MAX).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.target === 'VALOR') {
      if (value.amount === undefined)
        ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Indica el valor.' });
      if (value.lineId !== undefined)
        ctx.addIssue({ code: 'custom', path: ['lineId'], message: 'Sobra la línea.' });
    } else {
      if (value.lineId === undefined)
        ctx.addIssue({ code: 'custom', path: ['lineId'], message: 'Indica la línea.' });
      if (value.amount !== undefined)
        ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Sobra el valor.' });
    }
    if (value.reasonCode === 'OTRO' && value.note === undefined)
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Explica el motivo.' });
  });

export type GrantCourtesyCommand = z.infer<typeof GrantCourtesyCommandSchema>;

/** Comando «Anular cortesía» (R5): devuelve el saldo o retira la línea del borrador. */
export const VoidCourtesyCommandSchema = z
  .object({
    reasonCode: z.enum(BILLING_COURTESY_VOID_REASONS),
    note: z.string().trim().min(1).max(NOTE_MAX).optional(),
  })
  .strict();

export type VoidCourtesyCommand = z.infer<typeof VoidCourtesyCommandSchema>;

/** Cortesía serializada (spec MOD14 2026-11-12 R4-R6). */
export const BillingCourtesyResponseSchema = z
  .object({
    id: z.string().uuid(),
    documentId: z.string().uuid(),
    subscriberId: z.string().uuid(),
    application: z.enum(BILLING_COURTESY_APPLICATIONS),
    target: z.enum(BILLING_COURTESY_TARGETS),
    /** Línea regalada cuando `target` es `LINEA`. */
    sourceLineId: z.string().uuid().nullable(),
    /**
     * Línea negativa «Cortesía» creada en el borrador; null en un ajuste sobre emitido. Al anular
     * la cortesía de un borrador la línea se retira y pasa a null, también en la respuesta de la
     * anulación (igual que en las lecturas posteriores).
     */
    lineId: z.string().uuid().nullable(),
    amount: billingMoneyStringSchema,
    reasonCode: z.enum(BILLING_COURTESY_REASONS),
    note: z.string().nullable(),
    status: z.enum(BILLING_COURTESY_STATUSES),
    voidReasonCode: z.enum(BILLING_COURTESY_VOID_REASONS).nullable(),
    voidNote: z.string().nullable(),
    voidedAt: z.string().nullable(),
    voidedBy: z.string().uuid().nullable(),
    createdBy: z.string().uuid(),
    createdAt: z.string(),
  })
  .strict();

export type BillingCourtesyResponse = z.infer<typeof BillingCourtesyResponseSchema>;
