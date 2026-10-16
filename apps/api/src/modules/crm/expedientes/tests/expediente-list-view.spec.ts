import { ExpedienteStatus } from '@iwana/shared';
import { parseExpedienteListView, resolveExpedienteStatusesForView } from '../expediente-list-view';

describe('expediente-list-view', () => {
  it('omite la vista cuando el filtro no existe o no está reconocido', () => {
    expect(parseExpedienteListView()).toBeUndefined();
    expect(parseExpedienteListView('')).toBeUndefined();
    expect(parseExpedienteListView('unknown')).toBeUndefined();
  });

  it('resuelve cada vista a su partición semántica de estados', () => {
    expect(parseExpedienteListView('open')).toBe('open');
    expect(resolveExpedienteStatusesForView('open')).toEqual([
      ExpedienteStatus.NUEVO_POTENCIAL,
      ExpedienteStatus.PRECALIFICADO,
      ExpedienteStatus.VALIDANDO_COBERTURA,
      ExpedienteStatus.EN_COTIZACION,
      ExpedienteStatus.LISTO_PARA_INSTALACION,
    ]);
    expect(resolveExpedienteStatusesForView('converted')).toEqual([
      ExpedienteStatus.INSTALACION_AGENDADA,
    ]);
    expect(resolveExpedienteStatusesForView('archive')).toEqual([
      ExpedienteStatus.CLIENTE_ACTIVO,
      ExpedienteStatus.DESCARTADO,
    ]);
    expect(resolveExpedienteStatusesForView('all')).toBeNull();
  });
});
