import { PersonType, type SubscriberListItem } from '@iwana/shared';

/**
 * Acceso al número de documento del titular (`crm.subscribers.document.read`).
 *
 * Sin el permiso la API entrega `documentNumber` ya enmascarado con
 * `documentNumberRestricted: true` y rechaza cualquier escritura del campo con 403
 * `SUBSCRIBER_DOCUMENT_WRITE_FORBIDDEN`. La UI muestra el valor tal cual llega
 * (nunca lo vuelve a enmascarar ni intenta reconstruirlo) y nunca lo envía al guardar.
 */
export const DOCUMENT_RESTRICTED_LABEL = 'Restringido por tu rol';

export const DOCUMENT_RESTRICTED_EDIT_HELP =
  'Restringido por tu rol: no puedes ver completo ni cambiar el número de documento.';

export const DOCUMENT_RESTRICTED_CREATE_HELP =
  'Restringido por tu rol: solo un perfil con acceso al documento puede registrarlo.';

export const DOCUMENT_RESTRICTED_CREATE_NATURAL_MESSAGE =
  'Tu perfil de acceso no permite registrar el número de documento. Pide a un administrador que cree este suscriptor.';

export const DOCUMENT_WRITE_FORBIDDEN_MESSAGE =
  'Tu perfil de acceso no permite registrar ni cambiar el número de documento. Pide a un administrador que lo haga.';

const DOCUMENT_WRITE_FORBIDDEN_CODE = 'SUBSCRIBER_DOCUMENT_WRITE_FORBIDDEN';

/** true cuando la API marcó el documento como restringido para quien lo lee. */
export function isDocumentNumberRestricted(
  subscriber: Pick<SubscriberListItem, 'documentNumberRestricted'> | null | undefined,
): boolean {
  return subscriber?.documentNumberRestricted === true;
}

/**
 * El indicador aplica al número de documento de persona natural; el NIT de persona
 * jurídica no viaja enmascarado.
 */
export function showsRestrictedDocument(
  subscriber: Pick<SubscriberListItem, 'documentNumberRestricted' | 'personType'>,
): boolean {
  return subscriber.personType !== PersonType.JURIDICA && isDocumentNumberRestricted(subscriber);
}

/** 403 de la API por intentar registrar o cambiar el documento sin el permiso. */
export function isDocumentWriteForbidden(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, code } = error as { status?: unknown; code?: unknown };
  return status === 403 && code === DOCUMENT_WRITE_FORBIDDEN_CODE;
}
