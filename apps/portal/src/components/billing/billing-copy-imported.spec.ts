import {
  additionalNotice,
  canReceiveCourtesy,
  DOCUMENT_STATES,
  documentCoveredRange,
  documentReference,
  formatOptionalBillingDate,
} from './billing-copy';

/** ADR-110 D5: la factura IMPORTADO se rotula «Importada de UISP» y no tiene periodo. */
describe('billing-copy — documentos importados de UISP', () => {
  it('rotula el estado IMPORTADO sin vocabulario técnico', () => {
    expect(DOCUMENT_STATES.IMPORTADO).toEqual({ label: 'Importada de UISP', variant: 'neutral' });
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

describe('canReceiveCourtesy (spec MOD14 2026-11-12 R5)', () => {
  it('ofrece la cortesía en un borrador aunque no tenga saldo calculado', () => {
    expect(canReceiveCourtesy({ status: 'BORRADOR' })).toBe(true);
  });

  it('en emitido o importado solo con saldo pendiente mayor que cero', () => {
    expect(canReceiveCourtesy({ status: 'EMITIDO', pendingAmount: '10.00' })).toBe(true);
    expect(canReceiveCourtesy({ status: 'IMPORTADO', pendingAmount: '0.01' })).toBe(true);
    expect(canReceiveCourtesy({ status: 'EMITIDO', pendingAmount: '0.00' })).toBe(false);
    expect(canReceiveCourtesy({ status: 'IMPORTADO', pendingAmount: '0.00' })).toBe(false);
    expect(canReceiveCourtesy({ status: 'EMITIDO' })).toBe(false);
  });

  it('nunca en un documento anulado', () => {
    expect(canReceiveCourtesy({ status: 'ANULADO', pendingAmount: '10.00' })).toBe(false);
  });
});

describe('additionalNotice', () => {
  it('explica que los adicionales no tienen precio guardado y no se cobraron', () => {
    expect(additionalNotice(1)).toBe(
      'Este contrato tiene 1 adicional sin precio guardado en el contrato; por eso no se cobró en esta factura',
    );
    expect(additionalNotice(2)).toContain('2 adicionales sin precio guardado');
  });
});
