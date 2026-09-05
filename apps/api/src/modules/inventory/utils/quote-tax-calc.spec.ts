import { TaxCategory, TaxContext, TaxQuoteEffect, TaxTreatment } from '@iwana/shared';
import {
  computeQuoteTaxes,
  QuoteTaxCalcError,
  QuoteTaxCatalogSnapshot,
  roundHalfUpToCents,
} from './quote-tax-calc';

function catalogEntry(
  overrides: Partial<QuoteTaxCatalogSnapshot> &
    Pick<QuoteTaxCatalogSnapshot, 'code' | 'name' | 'category'>,
): QuoteTaxCatalogSnapshot {
  return {
    id: `def-${overrides.code}`,
    baseRate: null,
    treatment: TaxTreatment.STANDARD,
    context: TaxContext.PURCHASE,
    isActive: true,
    ...overrides,
  };
}

const PURCHASE_CATALOG: QuoteTaxCatalogSnapshot[] = [
  catalogEntry({
    code: 'IVA_19',
    name: 'IVA 19%',
    category: TaxCategory.VAT,
    baseRate: '19',
    context: TaxContext.BOTH,
  }),
  catalogEntry({
    code: 'IVA_EXCLUIDO',
    name: 'IVA excluido',
    category: TaxCategory.VAT,
    baseRate: null,
    treatment: TaxTreatment.EXCLUDED,
    context: TaxContext.BOTH,
  }),
  catalogEntry({
    code: 'RETE_FUENTE_SERVICIOS',
    name: 'Retención en la fuente — Servicios',
    category: TaxCategory.WITHHOLDING,
    baseRate: '4',
  }),
  catalogEntry({
    code: 'RETE_ICA',
    name: 'ReteICA — Bogotá',
    category: TaxCategory.MUNICIPAL,
    baseRate: '0.414',
  }),
  catalogEntry({
    code: 'RETE_IVA',
    name: 'Rete IVA',
    category: TaxCategory.WITHHOLDING,
    baseRate: '15',
  }),
  catalogEntry({
    code: 'ESTAMPILLA_DEPARTAMENTAL',
    name: 'Estampilla departamental',
    category: TaxCategory.STAMP,
    baseRate: null,
    context: TaxContext.BOTH,
    isActive: true,
  }),
];

describe('roundHalfUpToCents', () => {
  it('redondea HALF_UP a centavos (1.005 → 1.01, sin trampa IEEE)', () => {
    expect(roundHalfUpToCents(1.005)).toBe(1.01);
    expect(roundHalfUpToCents(0.414)).toBe(0.41);
    expect(roundHalfUpToCents(2.85)).toBe(2.85);
    expect(roundHalfUpToCents(-1.005)).toBe(-1.01);
  });
});

describe('computeQuoteTaxes', () => {
  it('CA-25-04: IVA 19, ReteFte 4, ReteICA 0.414, ReteIVA 15% del IVA → neto 111.74', () => {
    const result = computeQuoteTaxes({
      amount: 100,
      shippingCost: 0,
      catalog: PURCHASE_CATALOG,
      taxes: [
        { code: 'IVA_19', applies: true, rate: 19 },
        { code: 'RETE_FUENTE_SERVICIOS', applies: true, rate: 4 },
        { code: 'RETE_ICA', applies: true, rate: 0.414 },
        { code: 'RETE_IVA', applies: true, rate: 15 },
      ],
    });

    expect(result.taxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taxCode: 'IVA_19',
          effect: TaxQuoteEffect.ADD,
          baseAmount: 100,
          taxAmount: 19,
        }),
        expect.objectContaining({
          taxCode: 'RETE_FUENTE_SERVICIOS',
          effect: TaxQuoteEffect.WITHHOLD,
          baseAmount: 100,
          taxAmount: 4,
        }),
        expect.objectContaining({
          taxCode: 'RETE_ICA',
          effect: TaxQuoteEffect.WITHHOLD,
          baseAmount: 100,
          taxAmount: 0.41,
        }),
        expect.objectContaining({
          taxCode: 'RETE_IVA',
          effect: TaxQuoteEffect.WITHHOLD,
          baseAmount: 19,
          taxAmount: 2.85,
        }),
      ]),
    );
    expect(result.payableAmount).toBe(111.74);
  });

  it('CA-25-07: ignora montos tributarios extra del cliente y recalcula', () => {
    const sneaky = {
      code: 'IVA_19',
      applies: true,
      rate: 19,
      taxAmount: 999,
      baseAmount: 1,
    };
    const result = computeQuoteTaxes({
      amount: 100,
      shippingCost: 0,
      catalog: PURCHASE_CATALOG,
      taxes: [sneaky],
    });

    expect(result.taxes[0]).toEqual(
      expect.objectContaining({ taxCode: 'IVA_19', baseAmount: 100, taxAmount: 19 }),
    );
    expect(result.payableAmount).toBe(119);
  });

  it('CA-25-05: sin IVA, Rete IVA applies true → taxAmount 0', () => {
    const result = computeQuoteTaxes({
      amount: 100,
      shippingCost: 0,
      catalog: PURCHASE_CATALOG,
      taxes: [{ code: 'RETE_IVA', applies: true, rate: 15 }],
    });

    expect(result.taxes).toEqual([
      expect.objectContaining({
        taxCode: 'RETE_IVA',
        baseAmount: 0,
        taxAmount: 0,
        effect: TaxQuoteEffect.WITHHOLD,
      }),
    ]);
    expect(result.payableAmount).toBe(100);
  });

  it('CA-25-05: IVA aplica con monto 0, Rete IVA → taxAmount 0', () => {
    const result = computeQuoteTaxes({
      amount: 100,
      shippingCost: 0,
      catalog: PURCHASE_CATALOG,
      taxes: [
        { code: 'IVA_19', applies: true, rate: 0 },
        { code: 'RETE_IVA', applies: true, rate: 15 },
      ],
    });

    expect(result.taxes.find((line) => line.taxCode === 'RETE_IVA')?.taxAmount).toBe(0);
  });

  it('CA-25-06: el envío no entra en las bases; amount de productos intacto', () => {
    const result = computeQuoteTaxes({
      amount: 100,
      shippingCost: 50,
      catalog: PURCHASE_CATALOG,
      taxes: [{ code: 'IVA_19', applies: true, rate: 19 }],
    });

    const iva = result.taxes.find((line) => line.taxCode === 'IVA_19');
    expect(iva?.baseAmount).toBe(100);
    expect(iva?.taxAmount).toBe(19);
    expect(result.payableAmount).toBe(169);
  });

  it('applies=false no genera línea', () => {
    const result = computeQuoteTaxes({
      amount: 100,
      shippingCost: 0,
      catalog: PURCHASE_CATALOG,
      taxes: [
        { code: 'IVA_19', applies: false, rate: 19 },
        { code: 'RETE_FUENTE_SERVICIOS', applies: true, rate: 4 },
      ],
    });

    expect(result.taxes).toHaveLength(1);
    expect(result.taxes[0]?.taxCode).toBe('RETE_FUENTE_SERVICIOS');
    expect(result.payableAmount).toBe(96);
  });

  it('rate 0 es válido y produce taxAmount 0', () => {
    const result = computeQuoteTaxes({
      amount: 100,
      shippingCost: 10,
      catalog: PURCHASE_CATALOG,
      taxes: [{ code: 'IVA_19', applies: true, rate: 0 }],
    });

    expect(result.taxes[0]).toEqual(
      expect.objectContaining({ taxCode: 'IVA_19', rate: 0, taxAmount: 0 }),
    );
    expect(result.payableAmount).toBe(110);
  });

  it('legacy taxes omitido/vacío: taxes=[] y payable=amount+shipping', () => {
    const empty = computeQuoteTaxes({
      amount: 100,
      shippingCost: 25,
      catalog: PURCHASE_CATALOG,
      taxes: [],
    });
    expect(empty.taxes).toEqual([]);
    expect(empty.payableAmount).toBe(125);
  });

  it('tasa omitida usa catalog.baseRate', () => {
    const result = computeQuoteTaxes({
      amount: 100,
      shippingCost: 0,
      catalog: PURCHASE_CATALOG,
      taxes: [{ code: 'IVA_19', applies: true }],
    });
    expect(result.taxes[0]?.rate).toBe(19);
    expect(result.taxes[0]?.taxAmount).toBe(19);
  });

  it('IVA_EXCLUIDO con applies y sin rate exige tasa', () => {
    expect(() =>
      computeQuoteTaxes({
        amount: 100,
        shippingCost: 0,
        catalog: PURCHASE_CATALOG,
        taxes: [{ code: 'IVA_EXCLUIDO', applies: true }],
      }),
    ).toThrow(QuoteTaxCalcError);
  });

  it('rechaza códigos duplicados, inactivos, fuera de PURCHASE y STAMP si applies', () => {
    expect(() =>
      computeQuoteTaxes({
        amount: 100,
        shippingCost: 0,
        catalog: PURCHASE_CATALOG,
        taxes: [
          { code: 'IVA_19', applies: true, rate: 19 },
          { code: 'IVA_19', applies: true, rate: 5 },
        ],
      }),
    ).toThrow(/duplicados/);

    expect(() =>
      computeQuoteTaxes({
        amount: 100,
        shippingCost: 0,
        catalog: PURCHASE_CATALOG,
        taxes: [{ code: 'NO_EXISTE', applies: true, rate: 1 }],
      }),
    ).toThrow(/catálogo de compras/);

    const inactiveCatalog = [
      catalogEntry({
        code: 'IVA_19',
        name: 'IVA 19%',
        category: TaxCategory.VAT,
        baseRate: '19',
        isActive: false,
        context: TaxContext.BOTH,
      }),
    ];
    expect(() =>
      computeQuoteTaxes({
        amount: 100,
        shippingCost: 0,
        catalog: inactiveCatalog,
        taxes: [{ code: 'IVA_19', applies: true, rate: 19 }],
      }),
    ).toThrow(/inactivos/);

    const salesOnly = [
      catalogEntry({
        code: 'IVA_19',
        name: 'IVA 19%',
        category: TaxCategory.VAT,
        baseRate: '19',
        context: TaxContext.SALES,
      }),
    ];
    expect(() =>
      computeQuoteTaxes({
        amount: 100,
        shippingCost: 0,
        catalog: salesOnly,
        taxes: [{ code: 'IVA_19', applies: true, rate: 19 }],
      }),
    ).toThrow(/catálogo de compras/);

    expect(() =>
      computeQuoteTaxes({
        amount: 100,
        shippingCost: 0,
        catalog: PURCHASE_CATALOG,
        taxes: [{ code: 'ESTAMPILLA_DEPARTAMENTAL', applies: true, rate: 1 }],
      }),
    ).toThrow(/no se puede aplicar/);
  });
});
