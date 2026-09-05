import {
  areQuoteTaxesValid,
  buildQuoteTaxesPayload,
  computeQuoteTaxPreview,
  createInitialQuoteTaxState,
  parseQuoteTaxRate,
  resolveQuoteOfferTotal,
  resolveQuotePayableAmount,
  roundHalfUpToCents,
  type QuoteTaxState,
} from './quote-tax-calc';

function withApplies(
  overrides: Partial<Record<keyof QuoteTaxState, Partial<QuoteTaxState[keyof QuoteTaxState]>>> = {},
): QuoteTaxState {
  const base = createInitialQuoteTaxState();
  return {
    IVA_19: { ...base.IVA_19, ...overrides.IVA_19 },
    RETE_FUENTE_SERVICIOS: { ...base.RETE_FUENTE_SERVICIOS, ...overrides.RETE_FUENTE_SERVICIOS },
    RETE_ICA: { ...base.RETE_ICA, ...overrides.RETE_ICA },
    RETE_IVA: { ...base.RETE_IVA, ...overrides.RETE_IVA },
  };
}

describe('quote-tax-calc', () => {
  it('redondea HALF_UP a centavos', () => {
    expect(roundHalfUpToCents(0.414)).toBe(0.41);
    expect(roundHalfUpToCents(0.415)).toBe(0.42);
    expect(roundHalfUpToCents(1.005)).toBe(1.01);
    expect(roundHalfUpToCents(19)).toBe(19);
    expect(roundHalfUpToCents(2.85)).toBe(2.85);
  });

  it('acepta tasas entre 0 y 100 inclusive', () => {
    expect(parseQuoteTaxRate('0')).toBe(0);
    expect(parseQuoteTaxRate('100')).toBe(100);
    expect(parseQuoteTaxRate('0.414')).toBe(0.414);
    expect(parseQuoteTaxRate('')).toBeNull();
    expect(parseQuoteTaxRate('-1')).toBeNull();
    expect(parseQuoteTaxRate('101')).toBeNull();
  });

  it('CA-25-03: el estado inicial deja los cuatro tributos apagados con default de catálogo', () => {
    const state = createInitialQuoteTaxState([
      {
        code: 'IVA_19',
        name: 'IVA 19%',
        category: 'VAT',
        baseRate: 19,
        treatment: 'STANDARD',
        context: 'PURCHASE',
      },
      {
        code: 'RETE_ICA',
        name: 'ReteICA',
        category: 'MUNICIPAL',
        baseRate: 0.414,
        treatment: 'STANDARD',
        context: 'PURCHASE',
      },
    ]);

    expect(state.IVA_19.applies).toBe(false);
    expect(state.RETE_FUENTE_SERVICIOS.applies).toBe(false);
    expect(state.RETE_ICA.applies).toBe(false);
    expect(state.RETE_IVA.applies).toBe(false);
    expect(state.IVA_19.rate).toBe('19');
    expect(state.RETE_FUENTE_SERVICIOS.rate).toBe('4');
    expect(state.RETE_ICA.rate).toBe('0.414');
    expect(state.RETE_IVA.rate).toBe('15');
  });

  it('CA-25-04: preview con los cuatro tributos sobre base 100', () => {
    const preview = computeQuoteTaxPreview({
      amount: 100,
      shippingCost: 0,
      taxes: withApplies({
        IVA_19: { applies: true, rate: '19' },
        RETE_FUENTE_SERVICIOS: { applies: true, rate: '4' },
        RETE_ICA: { applies: true, rate: '0.414' },
        RETE_IVA: { applies: true, rate: '15' },
      }),
    });

    expect(preview.lines.find((line) => line.label === 'IVA')?.taxAmount).toBe(19);
    expect(preview.lines.find((line) => line.label === 'Retención en la fuente')?.taxAmount).toBe(
      4,
    );
    expect(preview.lines.find((line) => line.label === 'Rete ICA')?.taxAmount).toBe(0.41);
    expect(preview.lines.find((line) => line.label === 'Rete IVA')?.taxAmount).toBe(2.85);
    expect(preview.payable).toBe(111.74);
  });

  it('CA-25-05: Rete IVA queda en 0 si el IVA no aplica', () => {
    const preview = computeQuoteTaxPreview({
      amount: 100,
      shippingCost: 10,
      taxes: withApplies({
        RETE_IVA: { applies: true, rate: '15' },
      }),
    });

    expect(preview.lines.find((line) => line.label === 'Rete IVA')?.taxAmount).toBe(0);
    expect(preview.payable).toBe(110);
  });

  it('CA-25-06: el envío no entra en las bases tributarias', () => {
    const preview = computeQuoteTaxPreview({
      amount: 100,
      shippingCost: 50,
      taxes: withApplies({
        IVA_19: { applies: true, rate: '19' },
      }),
    });

    const iva = preview.lines.find((line) => line.label === 'IVA');
    expect(iva?.baseAmount).toBe(100);
    expect(iva?.taxAmount).toBe(19);
    expect(preview.payable).toBe(169);
  });

  it('no afirma el neto cuando una tasa encendida es inválida', () => {
    const taxes = withApplies({
      IVA_19: { applies: true, rate: '101' },
    });
    expect(areQuoteTaxesValid(taxes)).toBe(false);
    expect(computeQuoteTaxPreview({ amount: 100, shippingCost: 0, taxes }).payable).toBeNull();
  });

  it('envía solo los tributos encendidos en el payload', () => {
    expect(
      buildQuoteTaxesPayload(
        withApplies({
          IVA_19: { applies: true, rate: '19' },
          RETE_ICA: { applies: true, rate: '0.414' },
        }),
      ),
    ).toEqual([
      { code: 'IVA_19', applies: true, rate: 19 },
      { code: 'RETE_ICA', applies: true, rate: 0.414 },
    ]);
    expect(buildQuoteTaxesPayload(createInitialQuoteTaxState())).toEqual([]);
  });

  it('resuelve el neto persistido o cae a base + envío en cotizaciones legacy', () => {
    expect(
      resolveQuotePayableAmount({
        amount: '100',
        shippingCost: '10',
        payableAmount: '125.50',
      }),
    ).toBe(125.5);
    expect(resolveQuotePayableAmount({ amount: '100', shippingCost: '10' })).toBe(110);
    expect(
      resolveQuotePayableAmount({
        amount: '100',
        shippingCost: '40',
        shippingArrangement: 'PAY_CARRIER',
      }),
    ).toBe(100);
    expect(
      resolveQuoteOfferTotal({
        amount: '100',
        shippingCost: '40',
        payableAmount: '119',
        shippingArrangement: 'PAY_CARRIER',
      }),
    ).toBe(159);
  });
});
