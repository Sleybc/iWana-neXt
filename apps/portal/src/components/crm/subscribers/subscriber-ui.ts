import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  TaxRegime,
  VatTreatment,
} from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';

export type SubscriberBadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'primary'
  | 'lime';

export const SUBSCRIBER_STATUS_META: Record<
  SubscriberStatus,
  { label: string; variant: SubscriberBadgeVariant }
> = {
  LEAD: { label: 'Lead', variant: 'neutral' },
  PROSPECT: { label: 'Prospecto', variant: 'info' },
  ACTIVE: { label: 'Activo', variant: 'success' },
  SUSPENDED: { label: 'Suspendido', variant: 'warning' },
  CANCELLED: { label: 'Cancelado', variant: 'error' },
};

export const PERSON_TYPE_META: Record<
  PersonType,
  { label: string; variant: SubscriberBadgeVariant }
> = {
  NATURAL: { label: 'Persona natural', variant: 'info' },
  JURIDICA: { label: 'Persona jurídica', variant: 'primary' },
};

export const CUSTOMER_SEGMENT_META: Record<CustomerSegment, { label: string }> = {
  RESIDENTIAL: { label: 'Residencial' },
  SOHO: { label: 'SOHO' },
  PYME: { label: 'PyME' },
  CORPORATE: { label: 'Corporativo' },
  GOVERNMENT: { label: 'Gobierno' },
  WHOLESALE: { label: 'Mayorista' },
};

export const VAT_TREATMENT_META: Record<
  VatTreatment,
  { label: string; description: string; accentClass: string }
> = {
  EXEMPT: {
    label: 'Exento',
    description: 'Tarifa 0% por tratamiento exento.',
    accentClass: 'border-emerald-400 text-emerald-700 dark:text-emerald-300',
  },
  EXCLUDED: {
    label: 'Excluido',
    description: 'Operación excluida del IVA.',
    accentClass: 'border-amber-400 text-amber-700 dark:text-amber-300',
  },
  STANDARD: {
    label: 'Estándar',
    description: 'Tarifa general vigente.',
    accentClass: 'border-rose-400 text-rose-700 dark:text-rose-300',
  },
};

export const TAX_REGIME_META: Record<TaxRegime, { label: string }> = {
  SIMPLIFIED: { label: 'Simplificado' },
  COMMON: { label: 'Común' },
};

export const DOCUMENT_TYPE_OPTIONS = [
  { value: DocumentType.CC, label: 'Cédula de ciudadanía' },
  { value: DocumentType.CE, label: 'Cédula de extranjería' },
  { value: DocumentType.PASAPORTE, label: 'Pasaporte' },
  { value: DocumentType.PEP, label: 'PEP' },
  { value: DocumentType.PTP, label: 'PTP' },
  { value: DocumentType.NIT_PERSONA, label: 'NIT persona' },
] as const;

export const PERSON_TYPE_OPTIONS = [
  { value: PersonType.NATURAL, label: PERSON_TYPE_META[PersonType.NATURAL].label },
  { value: PersonType.JURIDICA, label: PERSON_TYPE_META[PersonType.JURIDICA].label },
] as const;

export const CUSTOMER_SEGMENT_OPTIONS = Object.values(CustomerSegment).map((value) => ({
  value,
  label: CUSTOMER_SEGMENT_META[value].label,
}));

export const SUBSCRIBER_STATUS_OPTIONS = Object.values(SubscriberStatus).map((value) => ({
  value,
  label: SUBSCRIBER_STATUS_META[value].label,
}));

export const STRATUM_OPTIONS = [1, 2, 3, 4, 5, 6].map((value) => ({
  value: String(value),
  label: `Estrato ${value}`,
}));

export const ALLOWED_TRANSITIONS: Record<SubscriberStatus, SubscriberStatus[]> = {
  LEAD: [SubscriberStatus.PROSPECT, SubscriberStatus.CANCELLED],
  PROSPECT: [SubscriberStatus.ACTIVE, SubscriberStatus.SUSPENDED, SubscriberStatus.CANCELLED],
  ACTIVE: [SubscriberStatus.SUSPENDED, SubscriberStatus.CANCELLED],
  SUSPENDED: [SubscriberStatus.ACTIVE, SubscriberStatus.CANCELLED],
  CANCELLED: [],
};

export function formatSubscriberName(
  subscriber: Pick<SubscriberRecord, 'personType' | 'firstName' | 'lastName' | 'businessName'>,
): string {
  if (subscriber.personType === PersonType.JURIDICA) {
    return subscriber.businessName?.trim() || 'Sin razón social';
  }

  const fullName = [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ').trim();
  return fullName || 'Sin nombre';
}

export function formatDocumentDisplay(
  subscriber: Pick<
    SubscriberRecord,
    'personType' | 'documentType' | 'documentNumber' | 'nit' | 'nitVerificationDigit'
  >,
): string {
  if (subscriber.personType === PersonType.JURIDICA) {
    const nit = subscriber.nit?.trim();
    if (!nit) return 'Sin NIT';
    return subscriber.nitVerificationDigit ? `${nit}-${subscriber.nitVerificationDigit}` : nit;
  }

  const typeLabel = DOCUMENT_TYPE_OPTIONS.find(
    (item) => item.value === subscriber.documentType,
  )?.label;
  if (!subscriber.documentNumber) return typeLabel ? `${typeLabel} pendiente` : 'Sin documento';
  return typeLabel ? `${typeLabel}: ${subscriber.documentNumber}` : subscriber.documentNumber;
}

export function formatVatTreatmentLabel(vatTreatment: VatTreatment): string {
  return VAT_TREATMENT_META[vatTreatment]?.label ?? vatTreatment;
}

export function formatSubscriberDate(value: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value));
}
