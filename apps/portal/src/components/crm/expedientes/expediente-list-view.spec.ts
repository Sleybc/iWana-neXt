import {
  getDefaultExpedienteView,
  getExpedienteEmptyActionKind,
  getExpedienteEmptyCopy,
  getExpedienteViewIcon,
  getExpedienteViewLabel,
  getOriginViewFromStatus,
  parseExpedienteViewFromSearchParams,
} from './expediente-list-view';

describe('expediente list view', () => {
  it('should default to open and map archive statuses', () => {
    expect(getDefaultExpedienteView()).toBe('open');
    expect(getExpedienteViewLabel('archive')).toBe('Cerradas');
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
    expect(getExpedienteViewLabel('converted')).toBe('En instalación');
    expect(getExpedienteViewLabel('all')).toBe('Todas las vistas');
  });

  it('asigna un icono temático a cada pestaña', () => {
    expect(getExpedienteViewIcon('open')).toBeDefined();
    expect(getExpedienteViewIcon('converted')).toBeDefined();
    expect(getExpedienteViewIcon('archive')).toBeDefined();
    expect(getExpedienteViewIcon('open')).not.toBe(getExpedienteViewIcon('converted'));
    expect(getExpedienteViewIcon('converted')).not.toBe(getExpedienteViewIcon('archive'));
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

  it('describe vacíos accionables por vista', () => {
    expect(getExpedienteEmptyCopy('open', false).title).toBe('Aún no hay oportunidades abiertas');
    expect(getExpedienteEmptyCopy('converted', false).title).toBe(
      'Sin oportunidades en instalación',
    );
    expect(getExpedienteEmptyCopy('archive', false).title).toBe('Sin oportunidades cerradas');
    expect(getExpedienteEmptyCopy('open', true).title).toBe('No se encontraron resultados');
  });

  it('no ofrece alta en En instalación ni Cerradas', () => {
    expect(getExpedienteEmptyActionKind('open', false)).toBe('create');
    expect(getExpedienteEmptyActionKind('converted', false)).toBe('none');
    expect(getExpedienteEmptyActionKind('archive', false)).toBe('none');
    expect(getExpedienteEmptyActionKind('converted', true)).toBe('clear-filters');
    expect(getExpedienteEmptyActionKind('all', false)).toBe('clear-filters');
  });

  it('should map converted and archive statuses correctly', () => {
    expect(getOriginViewFromStatus('INSTALACION_AGENDADA')).toBe('converted');
    expect(getOriginViewFromStatus('DESCARTADO')).toBe('archive');
  });
});
