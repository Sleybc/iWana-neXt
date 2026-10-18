import {
  CONTRACT_STATUS_META,
  SUBSCRIBER_STATUS_META,
  formatLocationLabel,
  formatSubscriberLocation,
} from './subscriber-ui';

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

describe('QW5 — escala de estados del contrato', () => {
  it.each([
    ['DRAFT', 'Borrador', 'neutral'],
    ['ACTIVE', 'Activo', SUBSCRIBER_STATUS_META.ACTIVE.variant],
    ['SUSPENDED', 'Suspendido', SUBSCRIBER_STATUS_META.SUSPENDED.variant],
    ['TERMINATED', 'Terminado', SUBSCRIBER_STATUS_META.CANCELLED.variant],
    ['ARCHIVED', 'Archivado', 'neutral'],
  ] as const)('mapea %s al badge %s', (status, label, variant) => {
    expect(CONTRACT_STATUS_META[status]).toEqual({ label, variant });
  });
});
