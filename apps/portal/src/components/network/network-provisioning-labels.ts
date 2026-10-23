import type {
  CommercialActivationStatus,
  ControlMethod,
  ServiceProvisioningStatus,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';

export const NETWORK_PROVISIONING_COPY = {
  readDenied: 'No tienes acceso al aprovisionamiento de esta orden.',
  inboxDenied: 'No tienes acceso a la bandeja de aprovisionamiento.',
  subscriberDenied: 'No tienes acceso a esta información.',
  loadError: 'No pudimos cargar el aprovisionamiento de esta orden. Reintenta.',
  inboxLoadError: 'No pudimos cargar esta lista. Reintenta.',
  subscriberLoadError: 'No pudimos cargar los servicios técnicos. Reintenta.',
  closureGateIncomplete:
    'No puedes cerrar esta instalación todavía. Falta completar el aprovisionamiento certificado.',
} as const;

const NETWORK_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  NETWORK_POOL_EXHAUSTED:
    'Esta red no tiene direcciones libres. Elige otra red o revisa su rango y exclusiones.',
  IP_OUTSIDE_RANGE:
    'La dirección está fuera del rango asignable. Ingresa una dirección dentro del rango de la red.',
  IP_IS_GATEWAY:
    'La dirección corresponde a la puerta de enlace y no se puede asignar. Elige otra.',
  IP_EXCLUDED: 'La dirección está excluida de esta red. Elige otra.',
  IP_IN_USE: 'La dirección ya está en uso. Actualiza la disponibilidad o elige otra.',
  NETWORK_OVERLAP:
    'El rango se superpone con otra red registrada. Revisa el CIDR antes de guardar.',
  NETWORK_NOT_IN_ROUTER:
    'La red seleccionada no pertenece a este router. Elige una red asociada al router.',
  CONTROL_METHOD_NOT_SUPPORTED:
    'Este router no admite el método seleccionado. Elige uno de los métodos disponibles.',
  CONTRACT_NOT_OF_SUBSCRIBER: 'El contrato no corresponde a este suscriptor. Revisa la selección.',
  PROVISIONING_ORDER_NOT_ELIGIBLE:
    'Esta orden no cumple las condiciones para esta acción. Revisa su estado y tipo.',
  PROVISIONING_TECHNICIAN_REQUIRED:
    'Asigna un técnico a la orden antes de reservar, certificar o regularizar. Actualiza la orden y vuelve a intentarlo.',
  PROVISIONING_CERTIFIER_IS_EXECUTOR:
    'La persona que certifica debe ser distinta del técnico asignado. Solicita la certificación a otra persona autorizada.',
  PROVISIONING_EVIDENCE_REQUIRED:
    'Selecciona una foto o un documento adjunto a esta orden para certificar el servicio.',
  PROVISIONING_STATE_INVALID:
    'El servicio cambió y esta acción ya no está disponible. Actualiza la información y revisa su estado.',
  PROVISIONING_ALREADY_ACTIVE:
    'Esta orden ya tiene un servicio activo. Revisa el servicio registrado antes de continuar.',
  VERSION_CONFLICT:
    'El registro cambió mientras lo editabas. Actualiza la información y vuelve a aplicar tus cambios.',
  CLOSURE_GATE_INCOMPLETE: NETWORK_PROVISIONING_COPY.closureGateIncomplete,
};

export function getProvisioningErrorMessage(
  error: unknown,
  fallback = 'No fue posible completar esta acción. Revisa la información e intenta nuevamente.',
): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
  if (error.status === 403) return NETWORK_PROVISIONING_COPY.readDenied;
  return NETWORK_ERROR_MESSAGES[error.code] ?? fallback;
}

export function getControlMethodProductLabel(method: ControlMethod): string {
  return method === 'SIMPLE_QUEUE_STATIC_IP'
    ? 'Cola simple por IP fija'
    : 'Lista de direcciones PCQ';
}

export function getProvisioningStatusLabel(status: ServiceProvisioningStatus | null): string {
  if (status === null) return 'Sin reserva';
  const labels: Record<ServiceProvisioningStatus, string> = {
    RESERVED: 'Reservado',
    CERTIFIED: 'Certificado',
    ACTIVE: 'Activo',
    FAILED: 'Cerrado sin certificar',
    RELEASED: 'Liberado',
  };
  return labels[status];
}

export function getCommercialActivationLabel(status: CommercialActivationStatus): string {
  const labels: Record<CommercialActivationStatus, string> = {
    NOT_APPLICABLE: 'No requiere activación comercial',
    PENDING: 'Activación comercial pendiente',
    DONE: 'Activación comercial completada',
    BLOCKED: 'Activación comercial pendiente',
  };
  return labels[status];
}

export function getCommercialActivationDetailLabel(
  detail: 'CONTACT_REQUIRED' | 'FISCAL_INCOMPLETE' | 'NO_EXPEDIENTE' | null,
): string | null {
  if (detail === 'CONTACT_REQUIRED') return 'Falta teléfono o correo de contacto';
  if (detail === 'FISCAL_INCOMPLETE') return 'Faltan datos fiscales';
  if (detail === 'NO_EXPEDIENTE') return 'No hay un expediente asociado';
  return null;
}

export function formatNetworkDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(date);
}
