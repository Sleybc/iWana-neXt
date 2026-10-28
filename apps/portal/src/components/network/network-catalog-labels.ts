import { OrganizationSiteType } from '@iwana/shared';
import type {
  CatalogMetaDto,
  ControlMethod,
  OrganizationSiteType as OrganizationSiteTypeValue,
  ReservationAvailability,
  RouterInterfaceKind,
  RouterInterfaceStatus,
  NetworkErrorCode,
  NetworkGlobalErrorCode,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';

export type CatalogIpProtectionState = 'active' | 'pending' | 'unknown';

export function getCatalogIpProtectionState(
  metadata: Partial<CatalogMetaDto> | null | undefined,
): CatalogIpProtectionState {
  if (metadata?.ipProtection === 'ACTIVE') return 'active';
  if (metadata?.ipProtection === 'PENDING') return 'pending';
  return 'unknown';
}

export const NETWORK_CATALOG_FIELD_HINTS = {
  lanInterface:
    'Opcional. Nombre de referencia de una interfaz o bridge, por ejemplo bridge-clientes. Las redes y sus gateways se registran en Redes IPv4. Si el router tiene varias interfaces, este campo solo guarda una referencia.',
  organizationSite:
    'Opcional. Sede física donde está el equipo. Se administra en Organización > Sedes registradas; puede ser una base técnica o una sede de monitoreo operativo.',
  commercialNode:
    'Opcional. Nodo del catálogo de cobertura comercial al que presta servicio el router.',
  networkName:
    'Etiqueta para distinguir esta red dentro del router, por ejemplo Clientes sector norte. Un router puede tener varias redes, cada una con su nombre.',
  cidr: 'Bloque de direcciones para los servicios, por ejemplo 192.168.10.0/24. Es distinto de la dirección de administración del router. Usa una máscara entre /16 y /30.',
  gateway:
    'IP de la puerta de enlace configurada para esta red, por ejemplo 192.168.10.1. Confírmala en el router: el bloque CIDR y la dirección de administración no permiten deducirla.',
  excludedIps:
    'Opcional. IP del bloque reservadas para equipos u otros usos que no se asignarán a servicios. El gateway, la dirección de red y la de difusión (broadcast) ya se omiten automáticamente. Hasta 256 IP separadas por comas.',
} as const;

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

export function getInterfaceKindLabel(kind: RouterInterfaceKind): string {
  switch (kind) {
    case 'PHYSICAL':
      return 'Física';
    case 'BRIDGE':
      return 'Puente (bridge)';
    case 'VLAN':
      return 'VLAN';
    case 'OTHER':
      return 'Otra';
  }
}

export function getInterfaceStatusLabel(status: RouterInterfaceStatus): string {
  return status === 'ACTIVE' ? 'Activa' : 'Inactiva';
}

export function getOrganizationSiteTypeLabel(siteType: OrganizationSiteTypeValue): string {
  switch (siteType) {
    case OrganizationSiteType.OFFICE:
      return 'Oficina';
    case OrganizationSiteType.WAREHOUSE:
      return 'Bodega';
    case OrganizationSiteType.TECH_BASE:
      return 'Base técnica física';
    case OrganizationSiteType.CUSTOMER_SERVICE:
      return 'Atención al cliente';
    case OrganizationSiteType.COLLECTION_POINT:
      return 'Punto de recaudo';
    case OrganizationSiteType.NOC:
      return 'Centro de operaciones de red';
    case OrganizationSiteType.MIXED:
      return 'Uso mixto';
  }
}

export function getReservationAvailabilityLabel(
  availability: ReservationAvailability,
  interfaceName?: string | null,
): string {
  if (availability.available) return 'Disponible para reservas.';
  switch (availability.reason) {
    case 'ROUTER_INACTIVE':
      return 'Sin reservas nuevas: el router está inactivo.';
    case 'NETWORK_INACTIVE':
      return 'Sin reservas nuevas: la red está inactiva.';
    case 'INTERFACE_INACTIVE':
      return `Sin reservas nuevas: la interfaz ${interfaceName || 'asociada'} está inactiva.`;
    case null:
      return 'La disponibilidad para reservas no está disponible.';
  }
}

export function getNetworkApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
  if (error.status === 403) return 'No tienes acceso al catálogo de red.';
  const messages: Partial<Record<NetworkErrorCode | NetworkGlobalErrorCode, string>> = {
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
    IP_PROTECTION_PENDING:
      'Todavía no puedes registrar direcciones en esta interfaz. Puedes crear la red con bloque y puerta de enlace.',
    IP_PROTECTED_BY_INFRASTRUCTURE:
      'Esta dirección corresponde a infraestructura registrada y no se puede asignar a un servicio. Elige otra dirección.',
    ADDRESS_NOT_USABLE: 'La dirección no puede registrarse. Revisa la IP y el prefijo.',
    INTERFACE_NOT_AVAILABLE: 'Activa la interfaz antes de registrar o cambiar sus direcciones.',
    INTERFACE_ADDRESS_IS_GATEWAY:
      'Esta dirección se usa como puerta de enlace de una red. Revisa su configuración antes de cambiarla.',
    INTERFACE_ADDRESS_DUPLICATED: 'La interfaz ya tiene registrada esa dirección.',
    ADDRESS_RELEASE_CONFIRMATION_REQUIRED:
      'Confirma que la IP anterior dejará de estar protegida antes de guardar.',
    RESOURCE_NOT_FOUND: 'La referencia seleccionada no está disponible para esta operación.',
    VALIDATION_ERROR: 'Revisa los datos ingresados e intenta nuevamente.',
    SITE_OR_NODE_INACTIVE:
      'La sede física o el nodo comercial ya no está disponible. Elige una opción activa.',
    CATALOG_REFERENCE_INACTIVE:
      'El router o la interfaz ya no está disponible. Activa el registro correspondiente y vuelve a intentarlo.',
    INTERFACE_NAME_IN_USE: 'Ya existe una interfaz con ese nombre en este router. Usa otro nombre.',
    EXCLUDED_IP_IN_USE:
      'Esta IP está asignada a un servicio y no se puede excluir. Revisa ese servicio o elige otra IP.',
    EXCLUDED_IP_OUTSIDE_BLOCK:
      'Cada IP excluida debe estar dentro del bloque de esta red. Corrige la lista de exclusiones.',
    LEGACY_LAN_NOT_AVAILABLE:
      'No hay una referencia LAN anterior para convertir. Registra la interfaz desde el detalle del router.',
    LEGACY_LAN_ALREADY_CONVERTED:
      'La referencia LAN anterior ya se convirtió en una interfaz. Actualiza la lista para ver el cambio.',
    NETWORK_PREFIX_NOT_ASSIGNABLE:
      'Este prefijo no permite crear un rango para servicios. Usa un bloque entre /16 y /30.',
    NETWORK_CONFIRMATION_MISMATCH:
      'Los datos confirmados no coinciden con la IP y el prefijo de origen. Revisa la dirección, el bloque y la puerta de enlace.',
    ROUTER_NAME_IN_USE: 'Ya existe un router con ese nombre. Elige otro nombre.',
    CONTROL_METHOD_IN_USE:
      'Hay redes que usan ese método de control. Conserva el método o cambia esas redes antes de quitarlo.',
    GATEWAY_INVALID:
      'La puerta de enlace debe estar dentro del bloque y no puede ser la dirección de red o difusión. Revisa el bloque y la IP.',
    ASSIGNABLE_RANGE_INVALID:
      'El rango para servicios debe quedar dentro del bloque y su inicio no puede superar el final. Revisa sus límites.',
  };
  const mappedMessage = messages[error.code as NetworkErrorCode | NetworkGlobalErrorCode];
  if (mappedMessage) return mappedMessage;
  if ([400, 409, 422].includes(error.status)) return fallback;
  return fallback;
}
