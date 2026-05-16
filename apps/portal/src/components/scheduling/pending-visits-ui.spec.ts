import { formatVisitRequestLocationLabel, formatVisitRequestTerritory } from './pending-visits-ui';

describe('pending-visits-ui territory formatting', () => {
  it('should format municipality codes using business labels', () => {
    expect(formatVisitRequestLocationLabel('EL_COLEGIO')).toBe('El Colegio');
    expect(formatVisitRequestLocationLabel('SAN_ANTONIO_DEL_TEQUENDAMA')).toBe(
      'San Antonio del Tequendama',
    );
  });

  it('should format unknown snake case sectors with sentence case', () => {
    expect(formatVisitRequestLocationLabel('LOS_MANGOS_DEL_SUR')).toBe('Los Mangos del Sur');
  });

  it('should compose municipality and sector for the inbox and detail panel', () => {
    expect(formatVisitRequestTerritory('EL_COLEGIO', 'LOS_MANGOS_DEL_SUR')).toBe(
      'El Colegio · Los Mangos del Sur',
    );
    expect(formatVisitRequestTerritory('', '')).toBe('Municipio no definido');
  });
});
