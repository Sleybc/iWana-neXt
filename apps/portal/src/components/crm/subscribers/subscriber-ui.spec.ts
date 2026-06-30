import { formatLocationLabel, formatSubscriberLocation } from './subscriber-ui';

describe('subscriber-ui location formatting', () => {
  it('should format known municipality codes using the catalog label', () => {
    expect(formatLocationLabel('SAN_ANTONIO_DEL_TEQUENDAMA')).toBe('San Antonio del Tequendama');
    expect(formatLocationLabel('EL_COLEGIO')).toBe('El Colegio');
    expect(formatLocationLabel('VIOTA')).toBe('Viotá');
  });

  it('should format unknown snake case values with sentence case in Spanish', () => {
    expect(formatLocationLabel('PUERTO_DE_LA_CRUZ')).toBe('Puerto de la Cruz');
  });

  it('should format subscriber location with city priority and department fallback', () => {
    expect(formatSubscriberLocation('SAN_ANTONIO_DEL_TEQUENDAMA', 'CUNDINAMARCA')).toBe(
      'San Antonio del Tequendama',
    );
    expect(formatSubscriberLocation(null, 'CUNDINAMARCA')).toBe('Cundinamarca');
    expect(formatSubscriberLocation('', '')).toBe('Sin ubicación');
  });
});
