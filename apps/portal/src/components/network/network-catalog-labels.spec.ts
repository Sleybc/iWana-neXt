import { ApiError } from '@/lib/api-client';
import { getNetworkApiErrorMessage } from './network-catalog-labels';

const fallback = 'No pudimos guardar los cambios. Intenta nuevamente.';

describe('getNetworkApiErrorMessage', () => {
  it.each([
    [
      409,
      'SITE_OR_NODE_INACTIVE',
      'La sede física o el nodo comercial ya no está disponible. Elige una opción activa.',
    ],
    [
      409,
      'CATALOG_REFERENCE_INACTIVE',
      'El router o la interfaz ya no está disponible. Activa el registro correspondiente y vuelve a intentarlo.',
    ],
    [
      409,
      'INTERFACE_NAME_IN_USE',
      'Ya existe una interfaz con ese nombre en este router. Usa otro nombre.',
    ],
    [
      409,
      'EXCLUDED_IP_IN_USE',
      'Esta IP está asignada a un servicio y no se puede excluir. Revisa ese servicio o elige otra IP.',
    ],
    [
      400,
      'EXCLUDED_IP_OUTSIDE_BLOCK',
      'Cada IP excluida debe estar dentro del bloque de esta red. Corrige la lista de exclusiones.',
    ],
    [
      409,
      'LEGACY_LAN_NOT_AVAILABLE',
      'No hay una referencia LAN anterior para convertir. Registra la interfaz desde el detalle del router.',
    ],
    [
      409,
      'LEGACY_LAN_ALREADY_CONVERTED',
      'La referencia LAN anterior ya se convirtió en una interfaz. Actualiza la lista para ver el cambio.',
    ],
    [
      400,
      'NETWORK_PREFIX_NOT_ASSIGNABLE',
      'Este prefijo no permite crear un rango para servicios. Usa un bloque entre /16 y /30.',
    ],
    [
      400,
      'NETWORK_CONFIRMATION_MISMATCH',
      'Los datos confirmados no coinciden con la IP y el prefijo de origen. Revisa la dirección, el bloque y la puerta de enlace.',
    ],
    [409, 'ROUTER_NAME_IN_USE', 'Ya existe un router con ese nombre. Elige otro nombre.'],
    [
      409,
      'CONTROL_METHOD_IN_USE',
      'Hay redes que usan ese método de control. Conserva el método o cambia esas redes antes de quitarlo.',
    ],
    [
      400,
      'GATEWAY_INVALID',
      'La puerta de enlace debe estar dentro del bloque y no puede ser la dirección de red o difusión. Revisa el bloque y la IP.',
    ],
    [
      400,
      'ASSIGNABLE_RANGE_INVALID',
      'El rango para servicios debe quedar dentro del bloque y su inicio no puede superar el final. Revisa sus límites.',
    ],
  ])('muestra copy específico para %s (%s)', (status, code, expected) => {
    expect(getNetworkApiErrorMessage(new ApiError(status, code, 'detalle interno'), fallback)).toBe(
      expected,
    );
  });

  it('conserva el fallback de la pantalla para un código desconocido', () => {
    expect(
      getNetworkApiErrorMessage(new ApiError(409, 'UNKNOWN_CODE', 'detalle interno'), fallback),
    ).toBe(fallback);
  });
});
