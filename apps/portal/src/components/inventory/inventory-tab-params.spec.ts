import {
  extractInventoryTabBase,
  isInventoryTabParam,
  resolveInventoryTab,
  shouldOpenLocationCreateFromUrl,
} from './inventory-tab-params';

describe('inventory-tab-params', () => {
  describe('resolveInventoryTab', () => {
    it('resuelve la pestaña base cuando el parámetro incluye subruta', () => {
      expect(resolveInventoryTab('locations/Crear bodega')).toBe('locations');
      expect(resolveInventoryTab('issues')).toBe('issues');
      expect(resolveInventoryTab('stock')).toBe('stock');
      expect(resolveInventoryTab(null)).toBe('catalog');
    });
  });

  describe('shouldOpenLocationCreateFromUrl', () => {
    it('detecta crear bodega por sufijo o action=create', () => {
      expect(shouldOpenLocationCreateFromUrl('locations/Crear bodega', null)).toBe(true);
      expect(shouldOpenLocationCreateFromUrl('locations', 'create')).toBe(true);
      expect(shouldOpenLocationCreateFromUrl('locations', null)).toBe(false);
      expect(shouldOpenLocationCreateFromUrl('catalog', 'create')).toBe(false);
    });
  });

  describe('isInventoryTabParam', () => {
    it('acepta tab base y subrutas de bodegas', () => {
      expect(isInventoryTabParam('locations')).toBe(true);
      expect(isInventoryTabParam('locations/Crear bodega')).toBe(true);
      expect(isInventoryTabParam('invalid')).toBe(false);
    });
  });

  describe('extractInventoryTabBase', () => {
    it('extrae solo el segmento base', () => {
      expect(extractInventoryTabBase('locations/crear-bodega')).toBe('locations');
    });
  });
});
