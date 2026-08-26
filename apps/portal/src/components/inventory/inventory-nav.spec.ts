import { INVENTORY_NAV_GROUPS, isInventoryNavId } from './inventory-nav';

describe('inventory-nav', () => {
  it('expone vista general y diez destinos operativos en dos grupos', () => {
    const ids = INVENTORY_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));

    expect(INVENTORY_NAV_GROUPS.map((group) => group.label)).toEqual(['Operación', 'Seguimiento']);
    expect(ids).toEqual([
      'overview',
      'catalog',
      'stock',
      'purchasing',
      'suppliers',
      'locations',
      'issues',
      'counts',
      'assets',
      'movements',
      'writeoffs',
    ]);
    expect(ids).toHaveLength(11);
    expect(INVENTORY_NAV_GROUPS.flatMap((group) => group.items).every((item) => item.icon)).toBe(
      true,
    );
  });

  it('reconoce ids del menú de módulo', () => {
    expect(isInventoryNavId('overview')).toBe(true);
    expect(isInventoryNavId('writeoffs')).toBe(true);
    expect(isInventoryNavId('summary')).toBe(false);
  });
});
