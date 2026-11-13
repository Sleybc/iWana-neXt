import { z } from 'zod';
import {
  BILLING_BLOCKING_REASONS,
  BILLING_DOCUMENT_LINE_KINDS,
  BILLING_DOCUMENT_STATUSES,
  BILLING_DOCUMENT_VOID_REASONS,
  BILLING_PERIOD_PAYMENT_STATES,
} from './billing-constants';
import { billingMoneyStringSchema, billingSignedMoneyStringSchema } from './billing-money.schema';
import { BillingCourtesyResponseSchema } from './billing-courtesies.contract';
import { BillingDocumentInstallationBreakdownSchema } from './billing-installation-consumption.contract';

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

/** Comando para generar documentos manualmente (HLD §4). */
export const GenerateDocumentsCommandSchema = z
  .object({
    contractId: z.string().uuid().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .refine(isCivilDate, 'La fecha debe ser una fecha civil válida.')
      .optional(),
  })
  .strict();

export type GenerateDocumentsCommand = z.infer<typeof GenerateDocumentsCommandSchema>;

/** Comando para emitir un lote de borradores (HLD §4). */
export const IssueDocumentsCommandSchema = z
  .object({
    documentIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict();

export type IssueDocumentsCommand = z.infer<typeof IssueDocumentsCommandSchema>;

/** Comando para anular un documento emitido (HLD §4, RS-7). */
export const VoidDocumentCommandSchema = z
  .object({
    reasonCode: z.enum(BILLING_DOCUMENT_VOID_REASONS),
    note: z.string().max(500).optional(),
  })
  .strict();

export type VoidDocumentCommand = z.infer<typeof VoidDocumentCommandSchema>;

/** Línea de un documento de cobro (HLD §3.1, §4). */
export const BillingDocumentLineSchema = z
  .object({
    id: z.string().uuid(),
    documentId: z.string().uuid(),
    kind: z.enum(BILLING_DOCUMENT_LINE_KINDS),
    description: z.string().min(1).max(200),
    quantity: z.string().regex(/^\d+(\.\d{1,4})?$/u),
    unitPrice: billingSignedMoneyStringSchema,
    baseAmount: billingSignedMoneyStringSchema,
    taxAmount: billingSignedMoneyStringSchema,
    total: billingSignedMoneyStringSchema,
    vatTreatment: z.string().min(1).max(16),
    vatRate: z.string().regex(/^\d+(\.\d{1,4})?$/u),
    vatLegalBasis: z.string().max(60).nullable().optional(),
    position: z.number().int().min(0),
  })
  .strict()
  // Solo la línea de cortesía (spec MOD14 2026-11-12 R4) resta: es la única con montos negativos
  // y nunca suma (CHECK chk_billing_document_lines_courtesy_sign de la migración 203).
  .refine(
    (line) =>
      line.kind === 'CORTESIA' ||
      [line.unitPrice, line.baseAmount, line.taxAmount, line.total].every(
        (value) => !value.startsWith('-'),
      ),
    { message: 'Solo una línea de cortesía admite montos negativos.', path: ['total'] },
  )
  .refine(
    (line) =>
      line.kind !== 'CORTESIA' ||
      [line.unitPrice, line.baseAmount, line.taxAmount, line.total].every(
        (value) => value.startsWith('-') || Number(value) === 0,
      ),
    { message: 'Una línea de cortesía no puede tener montos positivos.', path: ['total'] },
  );

export type BillingDocumentLine = z.infer<typeof BillingDocumentLineSchema>;

/** Snapshot fiscal del adquirente congelado al emitir (HLD §3.1, §4, ADR-058, ADR-100). */
export const BillingBuyerSnapshotSchema = z
  .object({
    displayName: z.string(),
    documentType: z.string().nullable().optional(),
    documentNumber: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    rutResponsibilities: z.array(z.string()).default([]),
  })
  .strict();

export type BillingBuyerSnapshot = z.infer<typeof BillingBuyerSnapshotSchema>;

/** Snapshot del emisor (tenant) congelado al emitir (HLD §3.1, §4). */
export const BillingIssuerSnapshotSchema = z
  .object({
    legalName: z.string(),
    nit: z.string(),
    verificationDigit: z.string().nullable().optional(),
  })
  .strict();

export type BillingIssuerSnapshot = z.infer<typeof BillingIssuerSnapshotSchema>;

/** Respuesta serializada de un documento de cobro (HLD §4, RS-21, RS-22). */
export const BillingDocumentResponseSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    /** `null` solo en un documento `IMPORTADO` (ADR-110 D5): no pertenece a un periodo de iWana. */
    periodId: z.string().uuid().nullable(),
    contractId: z.string().uuid(),
    subscriberId: z.string().uuid(),
    status: z.enum(BILLING_DOCUMENT_STATUSES),
    number: z.string().nullable().optional(),
    /** Número del sistema de origen; solo en un documento `IMPORTADO`. */
    externalNumber: z.string().nullable().optional(),
    issueDate: z.string().nullable().optional(),
    dueDate: z.string(),
    periodStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    periodEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    coveredStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    paymentState: z.enum(BILLING_PERIOD_PAYMENT_STATES).nullable(),
    buyerProtected: z.boolean(),
    subtotal: billingMoneyStringSchema,
    taxTotal: billingMoneyStringSchema,
    total: billingMoneyStringSchema,
    /**
     * Spec MOD14 2026-11-12 bloque C: los adicionales con precio congelado ya se facturan como
     * líneas `ADICIONAL`; este conteo queda solo para los que el contrato referencia sin precio
     * congelado (ítem sin tarifa vigente o contrato de titular anonimizado). Normalmente 0.
     */
    unbilledAdditionalCount: z.number().int().min(0),
    blockingReason: z.enum(BILLING_BLOCKING_REASONS).nullable().optional(),
    buyerSnapshot: BillingBuyerSnapshotSchema.nullable().optional(),
    issuerSnapshot: BillingIssuerSnapshotSchema.nullable().optional(),
    voidReasonCode: z.enum(BILLING_DOCUMENT_VOID_REASONS).nullable().optional(),
    voidNote: z.string().nullable().optional(),
    voidedAt: z.string().nullable().optional(),
    voidedBy: z.string().uuid().nullable().optional(),
    createdBy: z.string().uuid().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lines: z.array(BillingDocumentLineSchema).optional(),
    paidAmount: billingMoneyStringSchema.optional(),
    /**
     * Ajustes de cortesía activos aplicados a un EMITIDO o IMPORTADO (spec MOD14 2026-11-12 R4),
     * sin superar lo que el pago dejó pendiente; `0.00` en otro estado. Misma fórmula en el detalle
     * y en el estado de cuenta. No incluye la línea `CORTESIA` (ya está en `total`). No es pago:
     * `paidAmount` no la incluye; `pendingAmount` y `paymentState` sí la restan.
     */
    courtesyAmount: billingMoneyStringSchema.optional(),
    pendingAmount: billingMoneyStringSchema.optional(),
    /**
     * Retenciones vigentes atribuidas al documento (spec MOD14 2026-11-13 R8). Son parte de
     * `paidAmount`: el pago aplicó valor recibido + retenciones. Solo en el estado de cuenta.
     */
    withholdingAmount: billingMoneyStringSchema.optional(),
    /** Cortesías del documento, activas y anuladas; solo en el detalle. */
    courtesies: z.array(BillingCourtesyResponseSchema).optional(),
    /**
     * Valor real de la instalación, informativo (spec MOD14 2026-11-13 R3–R5). Solo en el detalle;
     * null si el documento no lleva línea `INSTALACION` o su contrato no tiene OT de instalación
     * cerrada con consumo registrado.
     */
    installationBreakdown: BillingDocumentInstallationBreakdownSchema.nullable().optional(),
  })
  .strict();

export type BillingDocumentResponse = z.infer<typeof BillingDocumentResponseSchema>;

const generationCount = z.number().int().nonnegative();

export const BillingGenerationSummarySchema = z
  .object({
    generated: generationCount,
    failed: generationCount,
    notDue: generationCount,
    existing: generationCount,
    omittedImpersonation: generationCount,
    omittedTermination: generationCount,
    blocked: generationCount,
    withoutCycle: generationCount,
    unbilledAdditionalDocuments: generationCount,
  })
  .strict();

export type BillingGenerationSummary = z.infer<typeof BillingGenerationSummarySchema>;

/** Comando «Generar primer cobro» de un contrato activo sin periodos (spec 2026-11-11 R3). */
export const GenerateFirstChargeCommandSchema = z
  .object({
    contractId: z.string().uuid(),
  })
  .strict();

export type GenerateFirstChargeCommand = z.infer<typeof GenerateFirstChargeCommandSchema>;

/** Fuente de la fecha civil de activación que ancla el primer cobro. */
export const BILLING_FIRST_CHARGE_ANCHOR_SOURCES = [
  'ACTIVATION_EVENT',
  'START_DATE',
  'STATUS_CHANGED_AT',
] as const;

export type BillingFirstChargeAnchorSource = (typeof BILLING_FIRST_CHARGE_ANCHOR_SOURCES)[number];

/**
 * Resultado del congelamiento del cargo de instalación (R4): `FROZEN` lo congeló ahora,
 * `ALREADY_SET` el contrato ya lo tenía (incluido `0`), `UNRESOLVED` el plan no tiene precio
 * vigente para el segmento y `NOT_APPLICABLE` el contrato ya tenía periodos.
 */
export const BILLING_FIRST_CHARGE_INSTALLATION_OUTCOMES = [
  'FROZEN',
  'ALREADY_SET',
  'UNRESOLVED',
  'NOT_APPLICABLE',
] as const;

export type BillingFirstChargeInstallationOutcome =
  (typeof BILLING_FIRST_CHARGE_INSTALLATION_OUTCOMES)[number];

/** Datos fiscales del contrato heredado (R7): qué se congeló desde el suscriptor. */
export const BILLING_FIRST_CHARGE_FISCAL_OUTCOMES = [
  'FROZEN',
  'ALREADY_SET',
  'UNRESOLVED',
  'NOT_APPLICABLE',
] as const;

export type BillingFirstChargeFiscalOutcome = (typeof BILLING_FIRST_CHARGE_FISCAL_OUTCOMES)[number];

export const BILLING_FIRST_CHARGE_FISCAL_FIELDS = ['NAME', 'DOCUMENT', 'ADDRESS'] as const;

export type BillingFirstChargeFiscalField = (typeof BILLING_FIRST_CHARGE_FISCAL_FIELDS)[number];

export const BillingFirstChargeResultSchema = z
  .object({
    contractId: z.string().uuid(),
    /** Fecha civil de activación usada como ancla; null si el contrato ya tenía periodos. */
    anchorDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    anchorSource: z.enum(BILLING_FIRST_CHARGE_ANCHOR_SOURCES).nullable(),
    installationFee: z
      .object({
        outcome: z.enum(BILLING_FIRST_CHARGE_INSTALLATION_OUTCOMES),
        amount: billingMoneyStringSchema.nullable(),
      })
      .strict(),
    /**
     * R7: `FROZEN` congeló al menos un campo, `ALREADY_SET` el contrato ya los tenía,
     * `UNRESOLVED` el suscriptor no tiene con qué completarlos y `NOT_APPLICABLE` el contrato
     * ya tiene documentos no borrador. Solo nombres de campo, nunca valores.
     */
    fiscalData: z
      .object({
        outcome: z.enum(BILLING_FIRST_CHARGE_FISCAL_OUTCOMES),
        frozenFields: z.array(z.enum(BILLING_FIRST_CHARGE_FISCAL_FIELDS)),
        missingFields: z.array(z.enum(BILLING_FIRST_CHARGE_FISCAL_FIELDS)),
      })
      .strict(),
    /** Suma del primer cobro y de los periodos vencidos generados hasta el vigente. */
    summary: BillingGenerationSummarySchema,
    /**
     * Borradores existentes del contrato regularizados: `unblocked` dejaron de estar bloqueados
     * por SIN_DATOS_FISCALES (R7) y `rescheduled` corrigieron un vencimiento pasado (R8).
     */
    regularizedDrafts: z
      .object({ unblocked: generationCount, rescheduled: generationCount })
      .strict(),
  })
  .strict();

export type BillingFirstChargeResult = z.infer<typeof BillingFirstChargeResultSchema>;
