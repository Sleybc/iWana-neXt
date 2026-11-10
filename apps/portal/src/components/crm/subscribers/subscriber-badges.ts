import { SubscriberStatus, VatTreatment, type SubscriberListItem } from '@iwana/shared';

/**
 * Insignias derivadas del suscriptor (spec 2026-11-10 §3 G, CA-6).
 * Se calculan solo desde datos existentes; no hay forma de asignarlas a mano.
 */
export type SubscriberBadgeId =
  | 'vat'
  | 'fiscal-incomplete'
  | 'contact-pending'
  | 'overdue-debt'
  | 'service-suspended';

export type SubscriberBadgeVariant = 'info' | 'warning' | 'error';

export interface SubscriberDerivedBadge {
  id: SubscriberBadgeId;
  label: string;
  variant: SubscriberBadgeVariant;
}

export interface SubscriberBadgeInput {
  status: SubscriberStatus | string;
  vatTreatment?: VatTreatment | null | undefined;
  contactPending?: boolean | null | undefined;
  anonymizedAt?: string | null | undefined;
  /** Solo el detalle lo trae; en la lista se omite y la insignia no se calcula. */
  fiscalCompleteness?: { complete: boolean } | null | undefined;
  /** Estados de los servicios conocidos (360°) o del servicio principal (lista). */
  serviceStatuses?: ReadonlyArray<string | null | undefined> | undefined;
  /** Estados de pago de los documentos del estado de cuenta, si se leyó. */
  documentPaymentStates?: ReadonlyArray<string | null | undefined> | undefined;
}

const VAT_LABELS: Partial<Record<VatTreatment, string>> = {
  [VatTreatment.EXEMPT]: 'IVA exento',
  [VatTreatment.EXCLUDED]: 'IVA excluido',
};

export function deriveSubscriberBadges(input: SubscriberBadgeInput): SubscriberDerivedBadge[] {
  // Un titular anonimizado no conserva atributos que describir.
  if (input.anonymizedAt) return [];

  const badges: SubscriberDerivedBadge[] = [];
  const vatLabel = input.vatTreatment ? VAT_LABELS[input.vatTreatment] : undefined;
  if (vatLabel) badges.push({ id: 'vat', label: vatLabel, variant: 'info' });

  if (input.fiscalCompleteness?.complete === false && input.status !== SubscriberStatus.CANCELLED) {
    badges.push({
      id: 'fiscal-incomplete',
      label: 'Datos fiscales incompletos',
      variant: 'warning',
    });
  }

  if (input.contactPending) {
    badges.push({ id: 'contact-pending', label: 'Contacto pendiente', variant: 'warning' });
  }

  if (input.documentPaymentStates?.some((state) => state === 'VENCIDO')) {
    badges.push({ id: 'overdue-debt', label: 'Deuda vencida', variant: 'error' });
  }

  if (
    input.status === SubscriberStatus.SUSPENDED ||
    input.serviceStatuses?.some((status) => status === 'SUSPENDED')
  ) {
    badges.push({ id: 'service-suspended', label: 'Servicio suspendido', variant: 'error' });
  }

  return badges;
}

/** Insignias de la lista: solo con lo que trae la fila (sin estado de cuenta ni completitud). */
export function deriveSubscriberListBadges(
  item: Pick<
    SubscriberListItem,
    'status' | 'vatTreatment' | 'contactPending' | 'anonymizedAt' | 'primaryService'
  >,
): SubscriberDerivedBadge[] {
  return deriveSubscriberBadges({
    status: item.status,
    vatTreatment: item.vatTreatment,
    contactPending: item.contactPending,
    anonymizedAt: item.anonymizedAt,
    serviceStatuses: item.primaryService ? [item.primaryService.status] : [],
  });
}
