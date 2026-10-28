import { resolveReservationsPaused } from './network-reservations-state';

describe('resolveReservationsPaused', () => {
  it('mantiene la pausa desactivada cuando la clave de entorno está ausente', () => {
    expect(resolveReservationsPaused(undefined)).toBe(false);
  });

  it.each([
    [true, true],
    [false, false],
    ['true', true],
    [' false ', false],
  ])('resuelve la clave gobernada %s como %s', (value, expected) => {
    expect(resolveReservationsPaused(value)).toBe(expected);
  });

  it('rechaza valores malformados para no iniciar con una pausa ambigua', () => {
    expect(() => resolveReservationsPaused('enabled')).toThrow(
      'network.reservationsPaused debe ser un booleano.',
    );
  });
});
