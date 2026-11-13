import { BILLING_BLOCKED_BUYER_DISPLAY_NAME } from '@iwana/shared';
import type {
  BillingCourtesyApplication,
  BillingCourtesyReason,
  BillingCourtesyResponse,
  BillingCourtesyStatus,
  BillingCourtesyVoidReason,
  BillingDocumentLine,
  BillingDocumentLineKind,
  BillingDocumentResponse,
  BillingInstallationValueSource,
  BillingPeriodPaymentState,
  BillingWithholdingOptionsResponse,
  BillingWithholdingTaxCode,
} from '@iwana/shared';
import type { BadgeProps } from '@iwana/ui';
import { formatBillingDate } from '../crm/subscribers/billing-cycle-ui';

export const PAYMENT_STATES = {
  PAGADO: { label: 'Pagado', variant: 'success' },
  PARCIAL: { label: 'Pago parcial', variant: 'info' },
  PENDIENTE: { label: 'Pendiente', variant: 'neutral' },
  VENCIDO: { label: 'Vencido', variant: 'warning' },
  SIN_DOCUMENTO: { label: 'Sin documento', variant: 'neutral' },
} satisfies Record<BillingPeriodPaymentState, { label: string; variant: BadgeProps['variant'] }>;

export const DOCUMENT_STATES = {
  BORRADOR: { label: 'Borrador', variant: 'neutral' },
  EMITIDO: { label: 'Emitido', variant: 'info' },
  ANULADO: { label: 'Anulado', variant: 'error' },
  /** ADR-110 D5: historial traído de UISP; no es documento fiscal ni se emite o anula. */
  IMPORTADO: { label: 'Histórico importado', variant: 'neutral' },
} as const;

export const PAYMENT_METHODS = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia bancaria',
  CONSIGNACION: 'Consignación bancaria',
  DATAFONO: 'Datáfono / Tarjeta',
  OTRO: 'Otro medio',
} as const;

/** Tipo de línea del documento de cobro (fase 2: la instalación va en el primer cobro). */
export const DOCUMENT_LINE_KINDS = {
  PLAN: 'Plan',
  ADICIONAL: 'Adicional',
  PRORRATEO: 'Prorrateo',
  INSTALACION: 'Instalación',
  CORTESIA: 'Cortesía',
} satisfies Record<BillingDocumentLineKind, string>;

/** IVA visible de una línea: tarifa general o el tratamiento exento/excluido. */
export function documentLineVat(
  line: Pick<BillingDocumentLine, 'vatTreatment' | 'vatRate'>,
): string {
  if (line.vatTreatment === 'EXEMPT') return 'Exento';
  if (line.vatTreatment === 'EXCLUDED') return 'Excluido';
  return `IVA ${Number(line.vatRate).toLocaleString('es-CO')} %`;
}

/** Motivos de catálogo de una cortesía (spec MOD14 2026-11-12 D4). */
export const COURTESY_REASONS = {
  PRORRATEO_INICIAL: 'Prorrateo del primer mes',
  FALLA_DEL_SERVICIO: 'Compensación por falla del servicio',
  RETENCION_DEL_CLIENTE: 'Retención del cliente',
  PROMOCION_COMERCIAL: 'Promoción comercial',
  ERROR_OPERATIVO: 'Error operativo',
  OTRO: 'Otro motivo',
} satisfies Record<BillingCourtesyReason, string>;

export const COURTESY_VOID_REASONS = {
  ERROR_DE_REGISTRO: 'Error al registrar la cortesía',
  VALOR_INCORRECTO: 'Valor incorrecto',
  DOCUMENTO_EQUIVOCADO: 'Documento equivocado',
  DECISION_REVERTIDA: 'Se revirtió la decisión',
} satisfies Record<BillingCourtesyVoidReason, string>;

export const COURTESY_STATUSES = {
  ACTIVA: { label: 'Aplicada', variant: 'success' },
  ANULADA: { label: 'Anulada', variant: 'neutral' },
} satisfies Record<BillingCourtesyStatus, { label: string; variant: BadgeProps['variant'] }>;

export const COURTESY_APPLICATIONS = {
  LINEA_EN_BORRADOR: 'Línea en el borrador',
  AJUSTE_SOBRE_EMITIDO: 'Ajuste sobre el documento emitido',
} satisfies Record<BillingCourtesyApplication, string>;

/**
 * Un documento anulado no admite cortesías. Un borrador sí; un emitido o importado solo mientras
 * tenga saldo pendiente mayor que cero (la cortesía no puede superar el saldo).
 */
export function canReceiveCourtesy(
  document: Pick<BillingDocumentResponse, 'status' | 'pendingAmount'>,
): boolean {
  if (document.status === 'ANULADO') return false;
  if (document.status === 'BORRADOR') return true;
  return document.pendingAmount != null && moneyCents(document.pendingAmount) > 0;
}

/** Líneas que se pueden regalar: con valor, que no sean cortesía ni estén ya regaladas. */
export function courtesyEligibleLines(
  document: Pick<BillingDocumentResponse, 'lines' | 'courtesies'>,
): BillingDocumentLine[] {
  const gifted = new Set(
    (document.courtesies ?? [])
      .filter((courtesy: BillingCourtesyResponse) => courtesy.status === 'ACTIVA')
      .map((courtesy) => courtesy.sourceLineId),
  );
  return (document.lines ?? []).filter(
    (line) => line.kind !== 'CORTESIA' && moneyCents(line.total) > 0 && !gifted.has(line.id),
  );
}

/** Saldo que la cortesía puede cubrir: el total del borrador o el pendiente del emitido (R5). */
export function courtesyBaseCents(
  document: Pick<BillingDocumentResponse, 'status' | 'pendingAmount' | 'total'>,
): number {
  if (document.status === 'BORRADOR') return moneyCents(document.total);
  return moneyCents(document.pendingAmount ?? document.total);
}

/**
 * En un borrador con conceptos de IVA distinto, la cortesía por valor no se puede repartir:
 * debe otorgarse por línea (BILLING_COURTESY_MIXED_VAT).
 */
export function courtesyNeedsLine(
  document: Pick<BillingDocumentResponse, 'status' | 'lines'>,
): boolean {
  if (document.status !== 'BORRADOR') return false;
  const rates = new Set(
    (document.lines ?? [])
      .filter((line) => line.kind !== 'CORTESIA' && moneyCents(line.total) > 0)
      .map((line) => `${line.vatTreatment}|${Number(line.vatRate)}|${line.vatLegalBasis ?? ''}`),
  );
  return rates.size > 1;
}

/** Tipos de retención del registro de pago (spec MOD14 2026-11-13 R6). */
export const WITHHOLDING_TAX_CODES = {
  RETE_FUENTE_SERVICIOS: 'Retención en la fuente por servicios',
  RETE_ICA: 'Retención de ICA',
} satisfies Record<BillingWithholdingTaxCode, string>;

/** Por qué el titular puede practicar retenciones (R7, decisión D3: solo O-23 en el RUT). */
export const WITHHOLDING_ELIGIBILITY = {
  AGENTE_RETENEDOR: 'El titular es agente de retención según su RUT.',
} satisfies Record<NonNullable<BillingWithholdingOptionsResponse['eligibility']>, string>;

/** Tarifa en porcentaje sin ceros sobrantes: «4.0000» → «4 %», «0.966» → «0,966 %». */
export function formatWithholdingRate(rate: string): string {
  return `${Number(rate).toLocaleString('es-CO', { maximumFractionDigits: 4 })} %`;
}

/** Retenciones vigentes de un documento o estado de cuenta, o null si no hay. */
export function withholdingAmountOrNull(value: string | undefined): string | null {
  return value && moneyCents(value) > 0 ? value : null;
}

export const WITHHOLDING_INCLUDED_NOTE = 'Ya están incluidas en lo pagado.';

/** Origen del valor de referencia de un ítem de la instalación (spec MOD14 2026-11-13 R2). */
export const INSTALLATION_VALUE_SOURCES = {
  PRECIO_COMERCIAL: 'Precio comercial vigente',
  COSTO_PROMEDIO: 'Costo promedio de inventario',
  SIN_VALOR: 'Sin valor de referencia',
} satisfies Record<BillingInstallationValueSource, string>;

export const DOCUMENT_VOID_REASONS = {
  ERROR_DE_VALOR: 'Error en el valor facturado',
  ERROR_DE_ADQUIRENTE: 'Error en los datos del adquirente',
  DUPLICADO: 'Documento duplicado',
  SERVICIO_NO_PRESTADO: 'Servicio no prestado',
  SUPLANTACION: 'Suplantación de identidad (falsedad personal - Ley 2573)',
} as const;

export const PAYMENT_VOID_REASONS = {
  ERROR_DE_REGISTRO: 'Error de captura en el registro',
  PAGO_RECHAZADO: 'Pago rechazado por entidad bancaria',
  DUPLICADO: 'Registro de pago duplicado',
} as const;

export const BLOCKING_REASONS = {
  SIN_PRECIO: 'Falta tarifa vigente en el catálogo comercial',
  SIN_TRATAMIENTO_IVA: 'El punto de servicio no tiene régimen de IVA resoluble',
  SIN_DATOS_FISCALES: 'Datos del suscriptor incompletos para facturar',
} as const;

export const PROTECTED_LABEL = BILLING_BLOCKED_BUYER_DISPLAY_NAME;
export const PROTECTED_NOTICE =
  'Los datos personales del titular se encuentran bajo custodia restringida por solicitud de privacidad. Los movimientos contables y saldos permanecen auditables.';

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' });
export const formatBillingMoney = (value: string | number) => cop.format(Number(value));
const copCents = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
/** Monto exacto: muestra los centavos solo si los hay, para que el saldo sea pagable tal cual. */
export const formatBillingMoneyExact = (value: string | number) => {
  const amount = Number(value);
  return Number.isInteger(Math.round(amount * 100) / 100)
    ? cop.format(amount)
    : copCents.format(amount);
};

export function moneyCents(value: string): number {
  const match = /^(\d{1,12})(?:[.,](\d{1,2}))?$/u.exec(value);
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : NaN;
}

/** Total de cortesías activas del estado de cuenta, o null si no hay (spec MOD14 R4). */
export function statementCourtesyTotal(statement: {
  totalCourtesy?: string | undefined;
}): string | null {
  const total = statement.totalCourtesy;
  return total && moneyCents(total) > 0 ? total : null;
}

/** Cortesía activa aplicada a un documento emitido o importado, o null si no tiene. */
export function documentCourtesyAmount(document: {
  courtesyAmount?: string | undefined;
}): string | null {
  const amount = document.courtesyAmount;
  return amount && moneyCents(amount) > 0 ? amount : null;
}

export const COURTESY_PENDING_NOTE = 'Ya descuenta las cortesías otorgadas.';

export function fromMoneyCents(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

/** Adicionales del contrato sin precio congelado: no se cobran hasta que el contrato lo tenga. */
export function additionalNotice(count: number): string {
  if (count === 1)
    return 'Este contrato tiene 1 adicional sin precio guardado en el contrato; por eso no se cobró en este documento';
  return `Este contrato tiene ${count} adicionales sin precio guardado en el contrato; por eso no se cobraron en este documento`;
}

export const IMPERSONATION_HOLD_TITLE =
  'Cobro suspendido preventivamente por investigación de suplantación de identidad (Ley 2573 de 2022).';
export const IMPERSONATION_HOLD_NOTICE = 'No se generarán nuevos cobros hasta resolución.';
export const ANONYMIZED_STATEMENT_TITLE = 'Titular anonimizado';
export const ANONYMIZED_STATEMENT_NOTICE =
  'El estado de cuenta ya no se consulta porque los datos del titular fueron anonimizados.';

/** Fecha o «Sin periodo»: un documento IMPORTADO no pertenece a un periodo de iWana (ADR-110 D5). */
export function formatOptionalBillingDate(value: string | null): string {
  return value ? formatBillingDate(value) : 'Sin periodo';
}

/** Rango del periodo cubierto, o «Sin periodo» para un documento importado. */
export function documentCoveredRange(document: {
  coveredStart: string | null;
  periodEnd: string | null;
}): string {
  if (!document.coveredStart || !document.periodEnd) return 'Sin periodo';
  return `${formatBillingDate(document.coveredStart)} al ${formatBillingDate(document.periodEnd)}`;
}

/** Identificación visible: número propio, número de origen (importado) o inicio del periodo. */
export function documentReference(document: {
  number?: string | null | undefined;
  externalNumber?: string | null | undefined;
  periodStart: string | null;
}): string {
  return (
    document.number ?? document.externalNumber ?? formatOptionalBillingDate(document.periodStart)
  );
}
