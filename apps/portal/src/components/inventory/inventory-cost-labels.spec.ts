import {
  formatInventoryCostOrNone,
  formatInventoryCurrency,
  formatInventoryMoney,
  INVENTORY_AVERAGE_COST_LABEL,
  INVENTORY_ESTIMATED_VALUE_LABEL,
  INVENTORY_LAST_PURCHASE_COST_LABEL,
  INVENTORY_NO_COST_LABEL,
  INVENTORY_UNIT_COST_LABEL,
  resolveInventoryValuationUnitCost,
} from './inventory-labels';

describe('vocabulario de costeo F4 (system-vocabulary-review)', () => {
  it('expone labels canónicos sin «móvil», «medio» ni averageCost crudo', () => {
    expect(INVENTORY_AVERAGE_COST_LABEL).toBe('Costo promedio');
    expect(INVENTORY_LAST_PURCHASE_COST_LABEL).toBe('Último costo de compra');
    expect(INVENTORY_UNIT_COST_LABEL).toBe('Costo unitario');
    expect(INVENTORY_ESTIMATED_VALUE_LABEL).toBe('Valor estimado de inventario');
    expect(INVENTORY_NO_COST_LABEL).toBe('Sin costo');

    const labels = [
      INVENTORY_AVERAGE_COST_LABEL,
      INVENTORY_LAST_PURCHASE_COST_LABEL,
      INVENTORY_UNIT_COST_LABEL,
      INVENTORY_ESTIMATED_VALUE_LABEL,
      INVENTORY_NO_COST_LABEL,
    ];
    for (const label of labels) {
      const lower = label.toLowerCase();
      expect(lower).not.toMatch(/\bm[oó]vil\b/);
      expect(lower).not.toMatch(/\bcosto medio\b/);
      expect(lower).not.toContain('averagecost');
      expect(lower).not.toContain('average cost');
    }
  });

  it('resuelve la cadena D-F4-8 priorizando averageCost', () => {
    expect(
      resolveInventoryValuationUnitCost({
        averageCost: '100',
        lastPurchaseCost: '90',
        standardCost: '80',
        baseCost: '70',
      }),
    ).toBe('100');

    expect(
      resolveInventoryValuationUnitCost({
        averageCost: '0',
        lastPurchaseCost: '90',
        standardCost: '80',
        baseCost: '70',
      }),
    ).toBe('90');

    expect(
      resolveInventoryValuationUnitCost({
        averageCost: '0',
        lastPurchaseCost: null,
        standardCost: '0',
        baseCost: '0',
      }),
    ).toBeNull();
  });

  it('formatea costo o muestra Sin costo', () => {
    expect(formatInventoryCostOrNone('150000')).toBe(formatInventoryCurrency('150000'));
    expect(formatInventoryCostOrNone(null)).toBe(INVENTORY_NO_COST_LABEL);
    expect(formatInventoryCostOrNone('0')).toBe(INVENTORY_NO_COST_LABEL);
    expect(formatInventoryCostOrNone('')).toBe(INVENTORY_NO_COST_LABEL);
  });

  it('CA-25-01: formatInventoryMoney muestra 2 decimales y no altera el formato entero', () => {
    const money = formatInventoryMoney(1234.5);
    const currency = formatInventoryCurrency(1234.5);
    expect(money.replace(/\u00a0/g, ' ')).toMatch(/1\.234,50/);
    expect(currency.replace(/\u00a0/g, ' ')).not.toMatch(/,50/);
  });
});
