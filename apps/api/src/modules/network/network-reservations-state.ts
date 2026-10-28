export const NETWORK_RESERVATIONS_PAUSED = 'NETWORK_RESERVATIONS_PAUSED';

/** Default seguro cuando la clave de configuración gobernada no está presente. */
export function resolveReservationsPaused(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  throw new Error('network.reservationsPaused debe ser un booleano.');
}
