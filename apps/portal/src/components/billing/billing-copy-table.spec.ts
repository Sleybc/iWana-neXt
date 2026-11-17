import { documentShortNumber, documentStatusBadges } from './billing-copy';

describe('documentShortNumber', () => {
  it('quita los ceros de relleno del consecutivo propio', () => {
    expect(documentShortNumber({ number: 'DC-000002' })).toBe('DC-2');
    expect(documentShortNumber({ number: 'DC-001203' })).toBe('DC-1203');
  });

  it('deja tal cual el número de origen importado y no inventa uno para un borrador', () => {
    expect(documentShortNumber({ number: null, externalNumber: 'UISP-0778' })).toBe('UISP-0778');
    expect(documentShortNumber({ number: null, externalNumber: null })).toBeNull();
  });
});

describe('documentStatusBadges', () => {
  const labels = (input: Parameters<typeof documentStatusBadges>[0]) =>
    documentStatusBadges(input).map((badge) => badge.label);

  it('una emitida muestra su estado de pago', () => {
    expect(labels({ status: 'EMITIDO', paymentState: 'PAGADO' })).toEqual(['Pagada']);
    expect(labels({ status: 'EMITIDO', paymentState: 'VENCIDO' })).toEqual(['Vencida']);
    expect(labels({ status: 'EMITIDO', paymentState: null })).toEqual(['Emitida']);
  });

  it('una importada muestra su pago y la etiqueta «Importada»', () => {
    expect(labels({ status: 'IMPORTADO', paymentState: 'PAGADO' })).toEqual([
      'Pagada',
      'Importada',
    ]);
  });

  it('borrador y anulada muestran el estado del documento', () => {
    expect(labels({ status: 'BORRADOR', paymentState: null })).toEqual(['Borrador']);
    expect(labels({ status: 'ANULADO', paymentState: 'PAGADO' })).toEqual(['Anulada']);
  });
});
