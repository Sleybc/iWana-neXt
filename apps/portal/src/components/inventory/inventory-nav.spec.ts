import { INVENTORY_NAV_GROUPS, filterInventoryNavGroups, isInventoryNavId } from './inventory-nav';

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

  describe('CA-GATE-06: gate de pestaña Compras', () => {
    it('con inventory.purchasing.read muestra todas las pestañas', () => {
      expect(filterInventoryNavGroups(true)).toEqual(INVENTORY_NAV_GROUPS);
    });

    it('sin permiso oculta la pestaña Compras y conserva el resto', () => {
      const filtered = filterInventoryNavGroups(false);
      const ids = filtered.flatMap((group) => group.items.map((item) => item.id));

      expect(ids).not.toContain('purchasing');
      expect(ids).toHaveLength(10);
      // Los grupos y el resto del orden quedan intactos (mismo contrato visual)
      expect(filtered.map((group) => group.label)).toEqual(['Operación', 'Seguimiento']);
      expect(ids).toEqual([
        'overview',
        'catalog',
        'stock',
        'suppliers',
        'locations',
        'issues',
        'counts',
        'assets',
        'movements',
        'writeoffs',
      ]);
    });
  });
});
