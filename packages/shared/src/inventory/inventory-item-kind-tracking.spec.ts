import { INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE } from './inventory-item-kind-tracking';

/**
 * Única fuente del copy S2 · CA-S2-01: el mensaje vive en `@iwana/shared`
 * (`inventory/inventory-item-kind-tracking.ts`) y aquí solo se fija para que
 * ningún spec futuro reintroduzca un literal duplicado.
 */
describe('INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE (fuente única del copy)', () => {
  it('nombra los campos como los ve el operador, nunca enums crudos', () => {
    expect(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE).toContain('Tipo de producto');
    expect(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE).toContain('Control de material');
    expect(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE).toContain('Con serial');
  });
});
