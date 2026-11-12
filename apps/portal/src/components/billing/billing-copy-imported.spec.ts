import {
  DOCUMENT_STATES,
  documentCoveredRange,
  documentReference,
  formatOptionalBillingDate,
} from './billing-copy';

/** ADR-110 D5: el documento IMPORTADO se rotula «Histórico importado» y no tiene periodo. */
describe('billing-copy — documentos importados de UISP', () => {
  it('rotula el estado IMPORTADO sin vocabulario técnico', () => {
    expect(DOCUMENT_STATES.IMPORTADO).toEqual({ label: 'Histórico importado', variant: 'neutral' });
  });

  it('sin periodo muestra «Sin periodo» y usa el número de origen como referencia', () => {
    expect(formatOptionalBillingDate(null)).toBe('Sin periodo');
    expect(documentCoveredRange({ coveredStart: null, periodEnd: null })).toBe('Sin periodo');
    expect(
      documentReference({ number: null, externalNumber: 'UISP-2023-1', periodStart: null }),
    ).toBe('UISP-2023-1');
    expect(
      documentReference({ number: 'DC-000001', externalNumber: null, periodStart: null }),
    ).toBe('DC-000001');
    expect(documentReference({ number: null, periodStart: null })).toBe('Sin periodo');
  });

  it('con periodo conserva el formato de fecha de facturación', () => {
    expect(documentCoveredRange({ coveredStart: '2026-11-01', periodEnd: '2026-11-30' })).toMatch(
      / al /u,
    );
    expect(formatOptionalBillingDate('2026-11-01')).not.toBe('Sin periodo');
  });
});
