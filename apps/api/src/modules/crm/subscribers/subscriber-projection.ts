import { SubscriberListItem, UserRole, type PrivacyMark } from '@iwana/shared';
import { Subscriber } from './entities/subscriber.entity';

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
};

/** Construye una lista cerrada; roles desconocidos solo reciben campos base. */
export function projectSubscriberForList(
  subscriber: SubscriberWithDecryptedFields,
  role: string,
): SubscriberListItem {
  const output: Record<string, unknown> = {
    id: subscriber.id,
    status: subscriber.status,
    personType: subscriber.personType,
    customerSegment: subscriber.customerSegment,
    stratum: subscriber.stratum,
    vatTreatment: subscriber.vatTreatment,
    documentType: subscriber.documentType,
    firstName: subscriber.firstName,
    lastName: subscriber.lastName,
    businessName: subscriber.businessName,
    commercialName: subscriber.commercialName,
    createdAt: subscriber.createdAt.toISOString(),
    privacyMarks: subscriber.privacyMarks ?? [],
  };
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
