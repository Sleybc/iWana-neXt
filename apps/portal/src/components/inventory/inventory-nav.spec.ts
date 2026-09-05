import { INVENTORY_NAV_GROUPS, filterInventoryNavGroups, isInventoryNavId } from './inventory-nav';

describe('inventory-nav', () => {
  it('reagrupa los 11 destinos en 5 grupos por eje de responsabilidad (CA-2A-01)', () => {
    const ids = INVENTORY_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));

    expect(INVENTORY_NAV_GROUPS.map((group) => group.id)).toEqual([
      'overview',
      'masters',
      'operation',
      'supply',
      'traceability',
    ]);
    expect(INVENTORY_NAV_GROUPS.map((group) => group.label)).toEqual([
      'Vista general',
      'Maestros',
      'Operación',
      'Abastecimiento',
      'Seguimiento',
    ]);
    expect(ids).toEqual([
      'overview',
      'catalog',
      'locations',
      'stock',
      'issues',
      'counts',
      'purchasing',
      'suppliers',
      'assets',
      'movements',
      'writeoffs',
    ]);
    expect(ids).toHaveLength(11);
    expect(INVENTORY_NAV_GROUPS.flatMap((group) => group.items).every((item) => item.icon)).toBe(
      true,
    );
  });

  it('el grupo overview va anclado primero, con hideLabel y un solo ítem (spec v1.3 §2.2)', () => {
    const [overview] = INVENTORY_NAV_GROUPS;

    expect(overview?.id).toBe('overview');
    expect(overview?.label).toBe('Vista general');
    expect(overview?.hideLabel).toBe(true);
    expect(overview?.items.map((item) => item.id)).toEqual(['overview']);
  });

  it('reconoce ids del menú de módulo', () => {
    expect(isInventoryNavId('overview')).toBe(true);
    expect(isInventoryNavId('writeoffs')).toBe(true);
    expect(isInventoryNavId('summary')).toBe(false);
  });

  describe('CA-GATE-06: gate por grupo Abastecimiento (v1.3, cierra D-3)', () => {
    it('con inventory.purchasing.read muestra los 5 grupos y los 11 destinos', () => {
      expect(filterInventoryNavGroups(true)).toEqual(INVENTORY_NAV_GROUPS);
      expect(
        filterInventoryNavGroups(true).flatMap((group) => group.items.map((item) => item.id)),
      ).toHaveLength(11);
    });

    it('sin permiso excluye el grupo supply completo (9 destinos restantes)', () => {
      const filtered = filterInventoryNavGroups(false);
      const ids = filtered.flatMap((group) => group.items.map((item) => item.id));

      expect(filtered.map((group) => group.id)).toEqual([
        'overview',
        'masters',
        'operation',
        'traceability',
      ]);
      expect(ids).not.toContain('purchasing');
      expect(ids).not.toContain('suppliers');
      expect(ids).toHaveLength(9);
      expect(ids).toEqual([
        'overview',
        'catalog',
        'locations',
        'stock',
        'issues',
        'counts',
        'assets',
        'movements',
        'writeoffs',
      ]);
    });
  });
});
