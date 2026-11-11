// MOD05 Cierre de venta fase 2 · bloque D (CA-4, CA-5, D-F1): línea «Instalación».
import { buildInstallationLine } from './billing-generation.math';

const exempt = { treatment: 'EXENTO', ratePercent: 0 as const, legalBasis: 'ET_481_H' };
const taxed = { treatment: 'STANDARD', ratePercent: 19 as const, legalBasis: 'ET-468' };

describe('buildInstallationLine — bloque D', () => {
  it.each([null, undefined, '0', '0.00'])('sin cargo (%p) no hay línea', (fee) => {
    expect(buildInstallationLine({ fee, permanenceDiscount: null, ...exempt })).toBeNull();
  });

  it('sin permanencia cobra el cargo completo, exento (estrato 1-3)', () => {
    expect(buildInstallationLine({ fee: '80000.00', permanenceDiscount: null, ...exempt })).toEqual(
      {
        kind: 'INSTALACION',
        description: 'Instalación',
        quantity: '1.0000',
        unitPrice: '80000.00',
        baseAmount: '80000.00',
        taxAmount: '0.00',
        total: '80000.00',
        vatTreatment: 'EXENTO',
        vatRate: '0.0000',
        vatLegalBasis: 'ET_481_H',
        position: 1,
      },
    );
  });

  it('con IVA 19 % (estrato 4+ o empresa) aplica la misma tarifa del servicio', () => {
    const line = buildInstallationLine({ fee: '80000.00', permanenceDiscount: null, ...taxed })!;
    expect(line).toMatchObject({
      baseAmount: '80000.00',
      taxAmount: '15200.00',
      total: '95200.00',
      vatTreatment: 'STANDARD',
      vatRate: '19.0000',
      vatLegalBasis: 'ET-468',
    });
  });

  it('con permanencia parcial cobra cargo menos descontado y muestra el descuento', () => {
    const line = buildInstallationLine({
      fee: '80000.00',
      permanenceDiscount: '50000.00',
      ...taxed,
    })!;
    expect(line.unitPrice).toBe('80000.00');
    expect(line.baseAmount).toBe('30000.00');
    expect(line.taxAmount).toBe('5700.00');
    expect(line.total).toBe('35700.00');
    expect(line.description).toMatch(
      /^Instalación \(cargo .*80\.000,00.*descuento por permanencia .*50\.000,00/u,
    );
  });

  it('con descuento total la línea sale en cero con el descuento visible', () => {
    const line = buildInstallationLine({
      fee: '80000.00',
      permanenceDiscount: '80000.00',
      ...taxed,
    })!;
    expect(line).toMatchObject({ baseAmount: '0.00', taxAmount: '0.00', total: '0.00' });
    expect(line.description).toContain('descuento por permanencia');
  });

  it('un descuento mayor al cargo se acota: la base nunca es negativa', () => {
    const line = buildInstallationLine({ fee: '100.00', permanenceDiscount: '150.00', ...exempt })!;
    expect(line.baseAmount).toBe('0.00');
  });

  it.each([
    [{ fee: '-1', permanenceDiscount: null, ...exempt }],
    [{ fee: 'abc', permanenceDiscount: null, ...exempt }],
    [{ fee: '100', permanenceDiscount: '-5', ...exempt }],
    [{ fee: '100', permanenceDiscount: null, ...exempt, ratePercent: 5 as never }],
  ])('rechaza entradas inválidas %#', (input) => {
    expect(() => buildInstallationLine(input)).toThrow(RangeError);
  });
});
