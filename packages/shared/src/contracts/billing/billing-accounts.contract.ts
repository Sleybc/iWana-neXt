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
    creditBalance: billingMoneyStringSchema,
    documents: z.array(BillingDocumentResponseSchema),
    payments: z.array(BillingPaymentResponseSchema),
    /** Cortesías del titular, activas y anuladas, de la más reciente a la más antigua (siempre enviado). */
    courtesies: z.array(BillingCourtesyResponseSchema).optional(),
    contractSummaries: z.array(ContractBillingSummarySchema).default([]),
  })
  .strict();

export type BillingAccountStatement = z.infer<typeof BillingAccountStatementSchema>;
