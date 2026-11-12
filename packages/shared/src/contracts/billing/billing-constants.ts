/**
 * Constantes, catálogos cerrados y códigos de error de MOD14 Facturación (HLD v1.1 §4, PRD §8).
 */

export const BILLING_PERIOD_TIMINGS = ['ANTICIPADO', 'VENCIDO'] as const;
export type BillingPeriodTiming = (typeof BILLING_PERIOD_TIMINGS)[number];

export const BILLING_CUTOFF_MODES = ['DIA_FIJO_CICLO', 'VENCIMIENTO_MAS_GRACIA'] as const;
export type BillingCutoffMode = (typeof BILLING_CUTOFF_MODES)[number];

export const BILLING_PRORATION_METHODS = ['DIAS_REALES', 'MES_30'] as const;
export type BillingProrationMethod = (typeof BILLING_PRORATION_METHODS)[number];

export const BILLING_FIRST_PERIOD_MODES = ['SEPARADO', 'JUNTO_AL_SIGUIENTE'] as const;
export type BillingFirstPeriodMode = (typeof BILLING_FIRST_PERIOD_MODES)[number];

export const BILLING_APPROVAL_MODES = ['BORRADOR', 'AUTOMATICA'] as const;
export type BillingApprovalMode = (typeof BILLING_APPROVAL_MODES)[number];

export const BILLING_PAYMENT_METHODS = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'CONSIGNACION',
  'DATAFONO',
  'OTRO',
] as const;
export type BillingPaymentMethod = (typeof BILLING_PAYMENT_METHODS)[number];

/**
 * `IMPORTADO` (ADR-110 D5): documento histórico traído de otro sistema (UISP). No es fiscal,
 * no consume numeración, no emite eventos ni se anula; sí cuenta en cartera y estado de cuenta.
 */
export const BILLING_DOCUMENT_STATUSES = ['BORRADOR', 'EMITIDO', 'ANULADO', 'IMPORTADO'] as const;
export type BillingDocumentStatus = (typeof BILLING_DOCUMENT_STATUSES)[number];

export const BILLING_DOCUMENT_LINE_KINDS = [
  'PLAN',
  'ADICIONAL',
  'PRORRATEO',
  'INSTALACION',
  /** Línea negativa de cortesía en un borrador (spec MOD14 2026-11-12 R4). */
  'CORTESIA',
] as const;
export type BillingDocumentLineKind = (typeof BILLING_DOCUMENT_LINE_KINDS)[number];

export const BILLING_PAYMENT_STATUSES = ['REGISTRADO', 'ANULADO'] as const;
export type BillingPaymentStatus = (typeof BILLING_PAYMENT_STATUSES)[number];

/** Motivos de anulación de documentos de cobro (HLD v1.1 §4, RS-7). */
export const BILLING_DOCUMENT_VOID_REASONS = [
  'ERROR_DE_VALOR',
  'ERROR_DE_ADQUIRENTE',
  'DUPLICADO',
  'SERVICIO_NO_PRESTADO',
  'SUPLANTACION',
] as const;
export type BillingDocumentVoidReason = (typeof BILLING_DOCUMENT_VOID_REASONS)[number];

/** Motivos de anulación de pagos (HLD v1.1 §4). */
export const BILLING_PAYMENT_VOID_REASONS = [
  'ERROR_DE_REGISTRO',
  'PAGO_RECHAZADO',
  'DUPLICADO',
] as const;
export type BillingPaymentVoidReason = (typeof BILLING_PAYMENT_VOID_REASONS)[number];

/**
 * Estados de pago derivados de un periodo de facturación (HLD v1.1 §4, ADR-103 D3).
 * Orden de evaluación: SIN_DOCUMENTO -> PAGADO -> VENCIDO -> PARCIAL -> PENDIENTE.
 */
export const BILLING_PERIOD_PAYMENT_STATES = [
  'SIN_DOCUMENTO',
  'PAGADO',
  'VENCIDO',
  'PARCIAL',
  'PENDIENTE',
] as const;
export type BillingPeriodPaymentState = (typeof BILLING_PERIOD_PAYMENT_STATES)[number];

/** Motivos que impiden emitir un documento de cobro en borrador (HLD v1.1 §4, RF-FAC-15). */
export const BILLING_BLOCKING_REASONS = [
  'SIN_PRECIO',
  'SIN_TRATAMIENTO_IVA',
  'SIN_DATOS_FISCALES',
] as const;
export type BillingBlockingReason = (typeof BILLING_BLOCKING_REASONS)[number];

/**
 * Cortesías (spec MOD14 2026-11-12 D4, R4-R6). Sobre un BORRADOR se aplican como línea negativa
 * «Cortesía»; sobre un EMITIDO o IMPORTADO, como ajuste no monetario que baja el saldo sin ser
 * pago ni nota crédito y sin tocar la base gravable ya emitida.
 */
export const BILLING_COURTESY_APPLICATIONS = ['LINEA_EN_BORRADOR', 'AJUSTE_SOBRE_EMITIDO'] as const;
export type BillingCourtesyApplication = (typeof BILLING_COURTESY_APPLICATIONS)[number];

/** `VALOR`: un monto con IVA incluido. `LINEA`: el total de una línea del documento. */
export const BILLING_COURTESY_TARGETS = ['VALOR', 'LINEA'] as const;
export type BillingCourtesyTarget = (typeof BILLING_COURTESY_TARGETS)[number];

export const BILLING_COURTESY_STATUSES = ['ACTIVA', 'ANULADA'] as const;
export type BillingCourtesyStatus = (typeof BILLING_COURTESY_STATUSES)[number];

/** Motivos de catálogo de una cortesía; `OTRO` exige nota. */
export const BILLING_COURTESY_REASONS = [
  'PRORRATEO_INICIAL',
  'FALLA_DEL_SERVICIO',
  'RETENCION_DEL_CLIENTE',
  'PROMOCION_COMERCIAL',
  'ERROR_OPERATIVO',
  'OTRO',
] as const;
export type BillingCourtesyReason = (typeof BILLING_COURTESY_REASONS)[number];

/** Motivos de anulación de una cortesía. */
export const BILLING_COURTESY_VOID_REASONS = [
  'ERROR_DE_REGISTRO',
  'VALOR_INCORRECTO',
  'DOCUMENTO_EQUIVOCADO',
  'DECISION_REVERTIDA',
] as const;
export type BillingCourtesyVoidReason = (typeof BILLING_COURTESY_VOID_REASONS)[number];

/** Tabla de códigos de error de Billing (HLD v1.1 §4, RS-6, RS-7). */
export const BILLING_ERROR_CODES = {
  BILLING_ISSUER_INCOMPLETE: 'BILLING_ISSUER_INCOMPLETE',
  BILLING_SUBSCRIBER_NOT_FOUND: 'BILLING_SUBSCRIBER_NOT_FOUND',
  BILLING_POLICY_INCOMPATIBLE: 'BILLING_POLICY_INCOMPATIBLE',
  BILLING_POLICY_CHANGED: 'BILLING_POLICY_CHANGED',
  BILLING_DOCUMENT_BLOCKED: 'BILLING_DOCUMENT_BLOCKED',
  BILLING_DOCUMENT_NOT_DRAFT: 'BILLING_DOCUMENT_NOT_DRAFT',
  BILLING_DOCUMENT_NOT_ISSUED: 'BILLING_DOCUMENT_NOT_ISSUED',
  BILLING_ALLOCATION_EXCEEDS_BALANCE: 'BILLING_ALLOCATION_EXCEEDS_BALANCE',
  BILLING_PAYMENT_VOIDED: 'BILLING_PAYMENT_VOIDED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  PRIVACY_TITULAR_ANONYMIZED: 'PRIVACY_TITULAR_ANONYMIZED',
  /** PDF histórico de un IMPORTADO (ADR-110 D5). */
  BILLING_IMPORTED_PDF_NOT_AVAILABLE: 'BILLING_IMPORTED_PDF_NOT_AVAILABLE',
  BILLING_IMPORTED_PDF_RESTRICTED: 'BILLING_IMPORTED_PDF_RESTRICTED',
  BILLING_IMPORTED_PDF_UNREADABLE: 'BILLING_IMPORTED_PDF_UNREADABLE',
  /** Cortesías (spec MOD14 2026-11-12). */
  BILLING_COURTESY_EXCEEDS_BALANCE: 'BILLING_COURTESY_EXCEEDS_BALANCE',
  BILLING_COURTESY_DOCUMENT_NOT_ELIGIBLE: 'BILLING_COURTESY_DOCUMENT_NOT_ELIGIBLE',
  BILLING_COURTESY_LINE_NOT_ELIGIBLE: 'BILLING_COURTESY_LINE_NOT_ELIGIBLE',
  BILLING_COURTESY_MIXED_VAT: 'BILLING_COURTESY_MIXED_VAT',
  BILLING_COURTESY_NOT_FOUND: 'BILLING_COURTESY_NOT_FOUND',
  BILLING_COURTESY_ALREADY_VOIDED: 'BILLING_COURTESY_ALREADY_VOIDED',
  BILLING_COURTESY_NOT_VOIDABLE: 'BILLING_COURTESY_NOT_VOIDABLE',
} as const;
export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[keyof typeof BILLING_ERROR_CODES];
