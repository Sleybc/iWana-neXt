import {
  formatExpedienteStatus,
  getExpedienteTimelineKindMeta,
  getStatusMeta,
} from './expediente-ui';

describe('expediente-ui status labels', () => {
  it('debe mostrar Listo para instalación para LISTO_PARA_INSTALACION', () => {
    expect(getStatusMeta('LISTO_PARA_INSTALACION').label).toBe('Listo para instalación');
    expect(formatExpedienteStatus('LISTO_PARA_INSTALACION')).toBe('Listo para instalación');
  });

  it('debe mantener compatibilidad con estados legacy al formatear', () => {
    expect(formatExpedienteStatus('VIABLE_COMERCIALMENTE')).toBe('Validando cobertura');
  });

  it('debe resolver metadatos visuales para eventos de seguimiento', () => {
    expect(getExpedienteTimelineKindMeta('contact')).toEqual({
      label: 'Intento de contacto',
      accentClassName: 'border-l-iwana-primary',
    });

    expect(getExpedienteTimelineKindMeta('responsibility')).toEqual({
      label: 'Cambio de responsable',
      accentClassName: 'border-l-iwana-secondary-700',
    });
  });
});
