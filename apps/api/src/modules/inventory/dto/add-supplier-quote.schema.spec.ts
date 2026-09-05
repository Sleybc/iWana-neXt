import { AddSupplierQuoteSchema, UpdateSupplierQuoteSchema } from './index';

describe('AddSupplierQuoteSchema taxes', () => {
  const base = {
    partyRefId: 'party-001',
    quoteNumber: 'Q-001',
    amount: 100,
    currency: 'COP',
  };

  it('acepta taxes opcional y rate 0', () => {
    const parsed = AddSupplierQuoteSchema.parse({
      ...base,
      taxes: [{ code: 'IVA_19', applies: true, rate: 0 }],
    });
    expect(parsed.taxes).toEqual([{ code: 'IVA_19', applies: true, rate: 0 }]);
  });

  it('rechaza códigos duplicados', () => {
    const result = AddSupplierQuoteSchema.safeParse({
      ...base,
      taxes: [
        { code: 'IVA_19', applies: true, rate: 19 },
        { code: 'IVA_19', applies: false, rate: 5 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('duplicados'))).toBe(true);
    }
  });

  it('CA-25-07: descarta montos tributarios enviados por el cliente', () => {
    const parsed = AddSupplierQuoteSchema.parse({
      ...base,
      taxes: [
        {
          code: 'IVA_19',
          applies: true,
          rate: 19,
          taxAmount: 999,
          baseAmount: 1,
          payableAmount: 111.74,
        },
      ],
    });

    expect(parsed.taxes).toEqual([{ code: 'IVA_19', applies: true, rate: 19 }]);
    expect(parsed.taxes?.[0]).not.toHaveProperty('taxAmount');
    expect(parsed.taxes?.[0]).not.toHaveProperty('baseAmount');
    expect(parsed).not.toHaveProperty('payableAmount');
  });

  it('acepta las tres condiciones de envío y default ON_INVOICE', () => {
    expect(AddSupplierQuoteSchema.parse(base).shippingArrangement).toBe('ON_INVOICE');
    expect(
      AddSupplierQuoteSchema.parse({
        ...base,
        shippingArrangement: 'PAY_CARRIER',
        shippingCost: 40,
      }).shippingArrangement,
    ).toBe('PAY_CARRIER');
    expect(
      AddSupplierQuoteSchema.safeParse({ ...base, shippingArrangement: 'INCLUDED' }).success,
    ).toBe(false);
  });

  it('rechaza rate fuera de 0–100', () => {
    const result = AddSupplierQuoteSchema.safeParse({
      ...base,
      taxes: [{ code: 'IVA_19', applies: true, rate: 101 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateSupplierQuoteSchema', () => {
  const base = {
    quoteNumber: 'Q-001',
    amount: 100,
    currency: 'COP',
  };

  it('no admite cambiar proveedor ni invitación', () => {
    const parsed = UpdateSupplierQuoteSchema.parse({
      ...base,
      partyRefId: 'party-hijack',
      rfqInvitationId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed).not.toHaveProperty('partyRefId');
    expect(parsed).not.toHaveProperty('rfqInvitationId');
  });

  it('acepta las mismas reglas económicas que el alta', () => {
    const parsed = UpdateSupplierQuoteSchema.parse({
      ...base,
      shippingArrangement: 'PAY_CARRIER',
      shippingCost: 40,
      taxes: [{ code: 'IVA_19', applies: true, rate: 19 }],
    });
    expect(parsed.shippingArrangement).toBe('PAY_CARRIER');
    expect(parsed.taxes).toEqual([{ code: 'IVA_19', applies: true, rate: 19 }]);
  });
});
