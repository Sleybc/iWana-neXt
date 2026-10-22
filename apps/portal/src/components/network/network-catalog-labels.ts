import type { ControlMethod } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';

export function getControlMethodLabel(method: ControlMethod): string {
  switch (method) {
    case 'SIMPLE_QUEUE_STATIC_IP':
      return 'Cola simple por IP fija';
    case 'PCQ_ADDRESS_LIST':
      return 'Lista de direcciones PCQ';
  }
}

export function getCatalogStatusLabel(status: 'ACTIVE' | 'INACTIVE'): string {
  return status === 'ACTIVE' ? 'Activo' : 'Inactivo';
}

export function getCatalogStatusVariant(status: 'ACTIVE' | 'INACTIVE'): 'success' | 'neutral' {
  return status === 'ACTIVE' ? 'success' : 'neutral';
}

export function getNetworkApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
  if (error.status === 403) return 'No tienes acceso al catálogo de red.';
  const messages: Record<string, string> = {
    VERSION_CONFLICT:
      'El registro cambió mientras lo editabas. Actualiza la información y vuelve a aplicar tus cambios.',
    NETWORK_OVERLAP:
      'El rango se superpone con otra red registrada. Revisa el CIDR antes de guardar.',
    NETWORK_NOT_IN_ROUTER:
      'La red seleccionada no pertenece a este router. Elige una red asociada al router.',
    CONTROL_METHOD_NOT_SUPPORTED:
      'Este router no admite el método seleccionado. Elige uno de los métodos disponibles.',
    NETWORK_POOL_EXHAUSTED:
      'Esta red no tiene direcciones libres. Elige otra red o revisa su rango y exclusiones.',
    IP_OUTSIDE_RANGE:
      'La dirección está fuera del rango asignable. Ingresa una dirección dentro del rango de la red.',
    IP_IS_GATEWAY:
      'La dirección corresponde a la puerta de enlace y no se puede asignar. Elige otra.',
    IP_EXCLUDED: 'La dirección está excluida de esta red. Elige otra.',
    IP_IN_USE: 'La dirección ya está en uso. Actualiza la disponibilidad o elige otra.',
    VALIDATION_ERROR: 'Revisa los datos ingresados e intenta nuevamente.',
  };
  const mappedMessage = messages[error.code];
  if (mappedMessage) return mappedMessage;
  if ([400, 409, 422].includes(error.status)) return fallback;
  return fallback;
}
