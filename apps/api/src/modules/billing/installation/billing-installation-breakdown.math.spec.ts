import { InventoryDisposition } from '@iwana/shared';
import type { InventoryItemValuation } from '../../inventory/ports/installation-consumption-valuation-read.port';
import { BillingInstallationBreakdownItemSchema } from '@iwana/shared';
import {
  SERIAL_NUMBER_MAX_LENGTH,
  buildInstallationBreakdownItems,
  contractSerial,
  formatCents,
  resolveUnitValue,
  toCents,
} from './billing-installation-breakdown.math';

const CABLE = '11111111-1111-4111-8111-111111111111';
const ROUTER = '22222222-2222-4222-8222-222222222222';
const CONNECTOR = '33333333-3333-4333-8333-333333333333';
const UNKNOWN = '44444444-4444-4444-8444-444444444444';

function valuation(
  overrides: Partial<InventoryItemValuation> & { itemId: string },
): InventoryItemValuation {
  return {
    name: 'Artículo',
    unitOfMeasure: 'UND',
    averageCost: null,
    commercialProduct: null,
    ...overrides,
  };
}

const line = (itemId: string, quantity: number, serialNumber: string | null = null) => ({
  itemId,
  quantity,
  serialNumber,
  finalDisposition: serialNumber
    ? InventoryDisposition.INSTALLED_AT_CUSTOMER
    : InventoryDisposition.INTERNAL_CONSUMPTION,
});

describe('toCents / formatCents', () => {
  it.each([
    ['1500', 150000],
    ['1500.00', 150000],
    ['2500.12345', 250012],
    ['2500.125', 250013],
    ['0.005', 1],
    ['0.004', 0],
  ])('%s → %d centavos (mitad hacia arriba)', (value, cents) => {
    expect(toCents(value)).toBe(cents);
  });

  it.each([null, undefined, '', 'abc', '-5', '1e3', '12,5'])('rechaza %p', (value) => {
    expect(toCents(value as string | null | undefined)).toBeNull();
  });

  it('formatea con dos decimales', () => {
    expect(formatCents(1000048)).toBe('10000.48');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(0)).toBe('0.00');
  });
});

describe('resolveUnitValue (R2)', () => {
  it('prefiere el precio vigente del producto comercial', () => {
    expect(
      resolveUnitValue(
        valuation({
          itemId: CABLE,
          averageCost: '900.00000',
          commercialProduct: { id: 'p', name: 'Cable', isLoan: false, currentBasePrice: '1500.00' },
        }),
      ),
    ).toEqual({ source: 'PRECIO_COMERCIAL', cents: 150000 });
  });

  it('sin precio vigente cae al costo promedio', () => {
    expect(
      resolveUnitValue(
        valuation({
          itemId: CABLE,
          averageCost: '900.50000',
          commercialProduct: { id: 'p', name: 'Cable', isLoan: false, currentBasePrice: null },
        }),
      ),
    ).toEqual({ source: 'COSTO_PROMEDIO', cents: 90050 });
  });

  it('sin precio ni costo positivo queda sin valor', () => {
    expect(resolveUnitValue(valuation({ itemId: CABLE, averageCost: '0' }))).toEqual({
      source: 'SIN_VALOR',
      cents: null,
    });
    expect(resolveUnitValue(undefined)).toEqual({ source: 'SIN_VALOR', cents: null });
  });

  it('un precio comercial cero es un precio vigente (no cae al costo)', () => {
    expect(
      resolveUnitValue(
        valuation({
          itemId: CABLE,
          averageCost: '100',
          commercialProduct: { id: 'p', name: 'Cable', isLoan: false, currentBasePrice: '0.00' },
        }),
      ),
    ).toEqual({ source: 'PRECIO_COMERCIAL', cents: 0 });
  });
});

describe('buildInstallationBreakdownItems (R1, R2)', () => {
  const valuations = [
    valuation({
      itemId: CABLE,
      name: 'Cable drop',
      unitOfMeasure: 'M',
      commercialProduct: {
        id: 'prod-cable',
        name: 'Cable',
        isLoan: false,
        currentBasePrice: '1500.00',
      },
    }),
    valuation({
      itemId: ROUTER,
      name: 'Router WiFi',
      averageCost: '180000.00000',
      commercialProduct: {
        id: 'prod-router',
        name: 'Router',
        isLoan: false,
        currentBasePrice: '250000.00',
      },
    }),
    valuation({ itemId: CONNECTOR, name: 'Conector', averageCost: '2500.12345' }),
  ];

  it('agrupa por artículo, suma cantidades y congela valor unitario y total', () => {
    const items = buildInstallationBreakdownItems(
      [line(CABLE, 40), line(CONNECTOR, 4), line(CABLE, 20)],
      valuations,
      new Set(),
    );
    expect(items).toEqual([
      {
        position: 1,
        inventoryItemId: CABLE,
        description: 'Cable drop',
        unitOfMeasure: 'M',
        quantity: 60,
        serialNumbers: [],
        isLoan: false,
        commercialProductId: 'prod-cable',
        valueSource: 'PRECIO_COMERCIAL',
        unitReferenceValue: '1500.00',
        referenceValue: '90000.00',
      },
      {
        position: 2,
        inventoryItemId: CONNECTOR,
        description: 'Conector',
        unitOfMeasure: 'UND',
        quantity: 4,
        serialNumbers: [],
        isLoan: false,
        commercialProductId: null,
        valueSource: 'COSTO_PROMEDIO',
        unitReferenceValue: '2500.12',
        referenceValue: '10000.48',
      },
    ]);
  });

  it('separa el equipo en comodato (MOD12) del vendido y conserva sus seriales', () => {
    const items = buildInstallationBreakdownItems(
      [line(ROUTER, 1, 'SN-A'), line(ROUTER, 1, 'SN-B'), line(ROUTER, 1, 'SN-A')],
      valuations,
      new Set(['SN-A']),
    );
    expect(items.map((item) => [item.isLoan, item.quantity, item.serialNumbers])).toEqual([
      [true, 2, ['SN-A']],
      [false, 1, ['SN-B']],
    ]);
    expect(items[0]?.referenceValue).toBe('500000.00');
  });

  it('marca comodato por el producto comercial cuando no hay registro en MOD12', () => {
    const [item] = buildInstallationBreakdownItems(
      [line(ROUTER, 1, 'SN-C')],
      [
        valuation({
          itemId: ROUTER,
          commercialProduct: {
            id: 'prod-router',
            name: 'Router',
            isLoan: true,
            currentBasePrice: null,
          },
          averageCost: '180000',
        }),
      ],
      new Set(),
    );
    expect(item).toMatchObject({
      isLoan: true,
      valueSource: 'COSTO_PROMEDIO',
      referenceValue: '180000.00',
    });
  });

  it('artículo desconocido: descripción y unidad genéricas, sin valor', () => {
    const [item] = buildInstallationBreakdownItems([line(UNKNOWN, 2)], valuations, new Set());
    expect(item).toMatchObject({
      description: 'Artículo de inventario',
      unitOfMeasure: 'UND',
      valueSource: 'SIN_VALOR',
      unitReferenceValue: null,
      referenceValue: null,
      commercialProductId: null,
    });
  });

  it('ignora cantidades no enteras o no positivas y recorta textos largos', () => {
    const items = buildInstallationBreakdownItems(
      [line(CABLE, 0), line(CABLE, -1), line(CABLE, 1.5), line(CONNECTOR, 1)],
      [valuation({ itemId: CONNECTOR, name: 'x'.repeat(250), unitOfMeasure: 'u'.repeat(40) })],
      new Set(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.description).toHaveLength(200);
    expect(items[0]?.unitOfMeasure).toHaveLength(32);
  });

  it('sin consumo no produce ítems', () => {
    expect(buildInstallationBreakdownItems([], valuations, new Set())).toEqual([]);
  });
});

describe('seriales al contrato (BillingInstallationBreakdownItemSchema)', () => {
  it('recorta a 160, quita bordes y omite vacíos', () => {
    expect(contractSerial('  SN-1  ')).toBe('SN-1');
    expect(contractSerial('   ')).toBeNull();
    expect(contractSerial(null)).toBeNull();
    expect(contractSerial('X'.repeat(500))).toHaveLength(SERIAL_NUMBER_MAX_LENGTH);
  });

  it('un serial largo se congela recortado, deduplicado y serializable; el comodato usa el serial completo', () => {
    const long = `SN-${'9'.repeat(300)}`;
    const [item] = buildInstallationBreakdownItems(
      [line(ROUTER, 1, long), line(ROUTER, 1, `${long}  `), line(ROUTER, 1, '   ')],
      [valuation({ itemId: ROUTER, name: 'Router' })],
      new Set([long]),
    );
    expect(item?.serialNumbers).toEqual([long.slice(0, SERIAL_NUMBER_MAX_LENGTH)]);
    expect(item?.isLoan).toBe(true);
    expect(
      BillingInstallationBreakdownItemSchema.safeParse({
        executionOrderNumber: 'OT-1',
        position: item?.position,
        description: item?.description,
        quantity: `${item?.quantity}.00`,
        unitOfMeasure: item?.unitOfMeasure,
        unitReferenceValue: null,
        referenceValue: null,
        valueSource: 'SIN_VALOR',
        isLoan: item?.isLoan,
        serialNumbers: item?.serialNumbers,
      }).success,
    ).toBe(true);
  });
});
