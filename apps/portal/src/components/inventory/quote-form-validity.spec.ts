import { getQuoteSaveBlockers } from './quote-form-validity';

describe('getQuoteSaveBlockers', () => {
  const ready = {
    quoteNumber: 'COT-1',
    usesQuoteLines: true,
    hasQuotedLines: true,
    quoteAmountValid: false,
    shippingValid: true,
    taxesValid: true,
  };

  it('no bloquea cuando la oferta está completa', () => {
    expect(getQuoteSaveBlockers(ready)).toEqual([]);
  });

  it('pide el número de cotización aunque el resto ya esté listo', () => {
    expect(getQuoteSaveBlockers({ ...ready, quoteNumber: '  ' })).toEqual([
      'Indica el número de cotización para guardar.',
    ]);
  });

  it('pide al menos un costo unitario cuando hay líneas', () => {
    expect(getQuoteSaveBlockers({ ...ready, hasQuotedLines: false })).toEqual([
      'Indica el costo unitario de al menos un producto.',
    ]);
  });
});
