import { formatExpedienteDisplayRef, formatExpedienteShortLabel } from './expediente-labels';

describe('expediente-labels', () => {
  it('devuelve una referencia corta sin exponer el UUID completo', () => {
    expect(formatExpedienteShortLabel('fcda817a-6340-4b83-bdd3-8bb4caa6cae9')).toBe('FCDA817A');
    expect(formatExpedienteDisplayRef('fcda817a-6340-4b83-bdd3-8bb4caa6cae9')).toBe(
      'Oportunidad FCDA817A',
    );
  });

  it('usa fallback legible cuando no hay id disponible', () => {
    expect(formatExpedienteDisplayRef(null)).toBe('Oportunidad NO-DISP');
  });
});
