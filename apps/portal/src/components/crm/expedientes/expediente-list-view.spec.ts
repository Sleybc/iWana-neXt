import {
  getDefaultExpedienteView,
  getExpedienteViewLabel,
  getOriginViewFromStatus,
  parseExpedienteViewFromSearchParams,
} from './expediente-list-view';

describe('expediente list view', () => {
  it('should default to open and map archive statuses', () => {
    expect(getDefaultExpedienteView()).toBe('open');
    expect(getExpedienteViewLabel('archive')).toBe('Archivo');
    expect(getOriginViewFromStatus('CLIENTE_ACTIVO')).toBe('archive');
  });

  it('hidrata view desde searchParams (CA-V2-05 / I-7)', () => {
    expect(parseExpedienteViewFromSearchParams(new URLSearchParams('view=open'))).toBe('open');
    expect(parseExpedienteViewFromSearchParams(new URLSearchParams('view=converted'))).toBe(
      'converted',
    );
    expect(parseExpedienteViewFromSearchParams(new URLSearchParams('view=nope'))).toBe('open');
  });

  it('should map all view labels correctly', () => {
    expect(getExpedienteViewLabel('open')).toBe('Abiertas');
    expect(getExpedienteViewLabel('converted')).toBe('Convertidas');
    expect(getExpedienteViewLabel('all')).toBe('Todo CRM');
  });

  it('should map all open statuses to open view', () => {
    const openStatuses = [
      'NUEVO_POTENCIAL',
      'PRECALIFICADO',
      'VALIDANDO_COBERTURA',
      'EN_COTIZACION',
      'LISTO_PARA_INSTALACION',
    ];
    for (const s of openStatuses) {
      expect(getOriginViewFromStatus(s)).toBe('open');
    }
  });

  it('should map converted and archive statuses correctly', () => {
    expect(getOriginViewFromStatus('INSTALACION_AGENDADA')).toBe('converted');
    expect(getOriginViewFromStatus('DESCARTADO')).toBe('archive');
  });
});
