import { SubscriberListItem, UserRole, type PrivacyMark } from '@iwana/shared';
import { Subscriber } from './entities/subscriber.entity';
import { hasRealContact } from './subscriber-contact.util';

/** Finalidades declaradas para los campos personales del listado — ADR-067 §2. */
export const SUBSCRIBER_LIST_FIELD_PURPOSE = {
  documentNumber: 'Identificación en atención telefónica y conciliación de cartera',
  phone: 'Contacto directo',
  altContactPhone: 'Contacto directo',
  whatsapp: 'Contacto directo',
  email: 'Notificación y recuperación de acceso',
  address: 'Despacho técnico',
  neighborhood: 'Despacho técnico',
  city: 'Despacho técnico',
  latitude: 'Verificación de cobertura',
  longitude: 'Verificación de cobertura',
  rowLabel: 'Etiqueta de la fila: distinguir al suscriptor en el listado y en el selector',
} as const;

// NIT y dígito usan la finalidad ya declarada para documentNumber.
export type SubscriberListField =
  | Exclude<keyof typeof SUBSCRIBER_LIST_FIELD_PURPOSE, 'rowLabel'>
  | 'nit'
  | 'nitVerificationDigit'
  | 'department';
export type SubscriberListFieldRoleMap = Partial<
  Record<UserRole, ReadonlyArray<SubscriberListField>>
>;

/** Mapa ratificado en docs/specs/2026-10-11-mod05-subscriber-list-field-role-map.md §6. */
export const SUBSCRIBER_LIST_FIELD_ROLE_MAP: SubscriberListFieldRoleMap = {
  [UserRole.ADMIN]: [
    'documentNumber',
    'nit',
    'nitVerificationDigit',
    'phone',
    'altContactPhone',
    'whatsapp',
    'email',
    'address',
    'neighborhood',
    'city',
    'department',
  ],
  [UserRole.NOC]: [],
  [UserRole.SALES]: [],
  [UserRole.SUPPORT]: [
    'documentNumber',
    'nit',
    'nitVerificationDigit',
    'phone',
    'altContactPhone',
    'whatsapp',
    'address',
    'neighborhood',
    'city',
    'department',
  ],
  [UserRole.ACCOUNTANT]: ['documentNumber', 'nit', 'nitVerificationDigit'],
};

type SubscriberWithDecryptedFields = Subscriber & {
  documentNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  altContactPhone?: string | null;
  privacyMarks?: PrivacyMark[];
  hasLiveContracts?: boolean;
  anonymizedAt?: Date | null;
  anonymizedRequestId?: string | null;
  primaryService?: SubscriberListItem['primaryService'];
  otherLiveServicesCount?: number;
};

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Construye una lista cerrada; roles desconocidos solo reciben campos base. */
export function projectSubscriberForList(
  subscriber: SubscriberWithDecryptedFields,
  role: string,
  canSeeBlocked = false,
): SubscriberListItem {
  const anonymizedAt = toIsoOrNull(subscriber.anonymizedAt);
  const privacyRestricted =
    anonymizedAt === null &&
    (subscriber.privacyMarks ?? []).includes('DATOS_BLOQUEADOS') &&
    !canSeeBlocked;
  const redactServiceLocation = privacyRestricted || anonymizedAt !== null;
  const primaryService = subscriber.primaryService
    ? {
        ...subscriber.primaryService,
        city: redactServiceLocation ? null : subscriber.primaryService.city,
        alias: redactServiceLocation ? null : subscriber.primaryService.alias,
      }
    : null;
  const output: Record<string, unknown> = {
    id: subscriber.id,
    tenantId: subscriber.tenantId,
    partyId: subscriber.partyId,
    userId: subscriber.userId ?? null,
    privacyRestricted,
    anonymizedAt,
    anonymizedRequestId: subscriber.anonymizedRequestId ?? null,
    status: subscriber.status,
    personType: subscriber.personType,
    customerSegment: subscriber.customerSegment,
    stratum: subscriber.stratum,
    vatTreatment: subscriber.vatTreatment,
    vatResponsibility: subscriber.vatResponsibility ?? null,
    rutResponsibilities: subscriber.rutResponsibilities ?? [],
    legalRepresentative:
      subscriber.legalRepresentativePartyId && subscriber.legalRepresentativeDisplayName
        ? {
            partyId: subscriber.legalRepresentativePartyId,
            displayName: subscriber.legalRepresentativeDisplayName,
          }
        : null,
    taxRegime: subscriber.taxRegime ?? null,
    expedienteId: subscriber.expedienteId ?? null,
    convertedAt: toIsoOrNull(subscriber.convertedAt),
    activatedAt: toIsoOrNull(subscriber.activatedAt),
    documentType: subscriber.documentType,
    firstName: subscriber.firstName,
    lastName: subscriber.lastName,
    businessName: subscriber.businessName,
    commercialName: subscriber.commercialName,
    createdAt: subscriber.createdAt.toISOString(),
    updatedAt: toIsoOrNull(subscriber.updatedAt) ?? subscriber.createdAt.toISOString(),
    contactPending: !hasRealContact(subscriber),
    hasLiveContracts: subscriber.hasLiveContracts === true,
    primaryService,
    otherLiveServicesCount: subscriber.otherLiveServicesCount ?? 0,
    privacyMarks: subscriber.privacyMarks ?? [],
  };

  if (privacyRestricted || anonymizedAt !== null) {
    Object.assign(output, {
      stratum: null,
      firstName: null,
      lastName: null,
      businessName: null,
      commercialName: null,
      legalRepresentative: null,
      documentNumber: null,
      nit: null,
      nitVerificationDigit: null,
      phone: null,
      altContactPhone: null,
      whatsapp: null,
      email: null,
      address: null,
      neighborhood: null,
      city: null,
      department: null,
      latitude: null,
      longitude: null,
      contactPending: false,
    });
    return output as unknown as SubscriberListItem;
  }

  const allowedFields = SUBSCRIBER_LIST_FIELD_ROLE_MAP[role as UserRole] ?? [];
  const fieldValues: Record<SubscriberListField, unknown> = {
    documentNumber: subscriber.documentNumber,
    nit: subscriber.nit,
    nitVerificationDigit: subscriber.nitVerificationDigit,
    phone: subscriber.phone,
    altContactPhone: subscriber.altContactPhone,
    whatsapp: subscriber.whatsapp,
    email: subscriber.email,
    address: subscriber.address,
    neighborhood: subscriber.neighborhood,
    city: subscriber.city,
    department: subscriber.department,
    latitude: subscriber.latitude,
    longitude: subscriber.longitude,
  };

  for (const field of allowedFields) {
    const value = fieldValues[field];
    if (value !== null && value !== undefined) output[field] = value;
  }

  return output as unknown as SubscriberListItem;
}
