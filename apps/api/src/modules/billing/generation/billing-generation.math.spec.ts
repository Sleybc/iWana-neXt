import { computeBillingPeriod, prorate } from '@iwana/shared';
import { buildAdditionalLine, buildPlanLine } from './billing-generation.math';

describe('billing generation math', () => {
  it.each([28, 29, 30, 31])(
    'BR-2.4 cobra el precio exacto en un periodo completo MES_30 de %i días',
    (days) => {
      expect(
        buildPlanLine({
          price: '31000.00',
          coveredDays: days,
          periodDays: days,
          method: 'MES_30',
          treatment: 'STANDARD',
          ratePercent: 19,
          legalBasis: 'ET-468',
          description: 'Plan',
        }).baseAmount,
      ).toBe('31000.00');
    },
  );
  it('builds a rounded taxable plan line', () => {
    expect(
      buildPlanLine({
        price: '100.00',
        coveredDays: 31,
        periodDays: 31,
        method: 'DIAS_REALES',
        treatment: 'STANDARD',
        ratePercent: 19,
        legalBasis: 'ET-468',
        description: 'Plan mensual',
      }),
    ).toEqual({
      kind: 'PLAN',
      description: 'Plan mensual',
      quantity: '1.0000',
      unitPrice: '100.00',
      baseAmount: '100.00',
      taxAmount: '19.00',
      total: '119.00',
      vatTreatment: 'STANDARD',
      vatRate: '19.0000',
      vatLegalBasis: 'ET-468',
      position: 0,
    });
  });

  it('prorates a terminated period on civil days and never returns a negative amount', () => {
    const period = computeBillingPeriod(1, 2026, 2);
    expect(period).toEqual({ periodStart: '2026-02-01', periodEnd: '2026-02-28' });
    expect(prorate('28000.00', 14, 28, 'DIAS_REALES')).toBe(14000);
    expect(prorate('28000.00', 0, 28, 'DIAS_REALES')).toBe(0);
  });

  const base = {
    price: '100.00',
    coveredDays: 30,
    periodDays: 30,
    method: 'MES_30' as const,
    treatment: 'STANDARD',
    ratePercent: 19 as const,
    legalBasis: 'ET-468',
    description: 'Plan',
  };

  it.each([
    [
      'precio no numérico',
      { price: 'no-es-precio' },
      'El precio mensual debe ser válido y no negativo.',
    ],
    ['precio negativo', { price: '-1.00' }, 'El precio mensual debe ser válido y no negativo.'],
    [
      'días cubiertos fraccionarios',
      { coveredDays: 1.5 },
      'Los días cubiertos deben ser un entero no negativo.',
    ],
    [
      'días cubiertos negativos',
      { coveredDays: -1 },
      'Los días cubiertos deben ser un entero no negativo.',
    ],
    ['periodo en cero', { periodDays: 0 }, 'Los días del periodo deben ser un entero positivo.'],
    ['IVA no soportado', { ratePercent: 5 as never }, 'El porcentaje de IVA no está soportado.'],
  ])('rechaza %s', (_label, patch, message) => {
    expect(() => buildPlanLine({ ...base, ...patch })).toThrow(new RangeError(message));
  });

  it('el tramo prorrateado se cobra en pesos enteros (COP sin centavos)', () => {
    // 55.000 × 2/31 = 3.548,39 → 3.548: el saldo debe poder pagarse exacto.
    const line = buildPlanLine({
      price: '55000.00',
      coveredDays: 2,
      periodDays: 31,
      method: 'DIAS_REALES',
      treatment: 'EXEMPT',
      ratePercent: 0,
      legalBasis: null,
      description: 'Plan de servicio',
    });
    expect(line.kind).toBe('PRORRATEO');
    expect(line.baseAmount).toBe('3548.00');
    expect(line.total).toBe('3548.00');
  });
});

describe('buildAdditionalLine (spec MOD14 2026-11-12 bloque C, R3/CA-2)', () => {
  const base = {
    itemId: 'item-1',
    name: 'IP fija',
    unitPrice: '30000.00',
    coveredDays: 16,
    periodDays: 31,
    method: 'DIAS_REALES' as const,
    treatment: 'STANDARD',
    ratePercent: 19 as const,
    legalBasis: 'ET_468',
    position: 2,
  };

  it('servicio: prorratea como el plan en pesos enteros, con su IVA y enlace al ítem', () => {
    expect(buildAdditionalLine({ ...base, itemType: 'SERVICE' })).toEqual({
      kind: 'ADICIONAL',
      description: 'IP fija',
      quantity: '1.0000',
      unitPrice: '30000.00',
      baseAmount: '15484.00',
      taxAmount: '2941.96',
      total: '18425.96',
      vatTreatment: 'STANDARD',
      vatRate: '19.0000',
      vatLegalBasis: 'ET_468',
      position: 2,
      additionalItemId: 'item-1',
    });
  });

  it('servicio en periodo completo cobra el precio exacto', () => {
    expect(buildAdditionalLine({ ...base, itemType: 'SERVICE', coveredDays: 31 })?.baseAmount).toBe(
      '30000.00',
    );
  });

  it('producto: precio completo aunque el periodo sea parcial; exento sin IVA', () => {
    const line = buildAdditionalLine({
      ...base,
      itemType: 'PRODUCT',
      name: null,
      treatment: 'EXEMPT',
      ratePercent: 0,
      legalBasis: 'ET_476_7',
    });
    expect(line).toMatchObject({
      kind: 'ADICIONAL',
      description: 'Producto adicional',
      baseAmount: '30000.00',
      taxAmount: '0.00',
      vatRate: '0.0000',
    });
  });

  it('sin nombre el servicio usa la descripción genérica', () => {
    expect(buildAdditionalLine({ ...base, itemType: 'SERVICE', name: '  ' })?.description).toBe(
      'Servicio adicional',
    );
  });

  it('precio cero o tramo que redondea a cero no genera línea', () => {
    expect(buildAdditionalLine({ ...base, itemType: 'PRODUCT', unitPrice: '0.00' })).toBeNull();
    expect(
      buildAdditionalLine({ ...base, itemType: 'SERVICE', unitPrice: '10.00', coveredDays: 1 }),
    ).toBeNull();
  });

  it('rechaza un precio inválido', () => {
    expect(() => buildAdditionalLine({ ...base, itemType: 'PRODUCT', unitPrice: '-1' })).toThrow(
      RangeError,
    );
    expect(() => buildAdditionalLine({ ...base, itemType: 'PRODUCT', unitPrice: 'x' })).toThrow(
      RangeError,
    );
  });
});
