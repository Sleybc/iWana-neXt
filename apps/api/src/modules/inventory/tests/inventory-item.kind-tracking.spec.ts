import {
  InventoryItemKind,
  InventoryTrackingMode,
  INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE,
} from '@iwana/shared';
import { CreateInventoryItemSchema, UpdateInventoryItemSchema } from '../dto';

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

function baseCreate(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Onu Tp Link',
    categoryId: CATEGORY_ID,
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    unitOfMeasure: 'UNIT',
    ...overrides,
  };
}

/**
 * Fase S2 · CA-S2-01 — coherencia del maestro: el cruce `itemKind` ↔
 * `trackingMode` es autoritativo en backend (refineInventoryItemMaster). El
 * copy del rechazo nombra los campos como los ve el operador, nunca enums.
 */
describe('refineInventoryItemMaster — cruce itemKind ↔ trackingMode (S2, CA-S2-01)', () => {
  it('rechaza Tipo de producto "Con serial" con Control de material "Consumible" en create', () => {
    const result = CreateInventoryItemSchema.safeParse(
      baseCreate({
        itemKind: InventoryItemKind.SERIALIZED,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Se esperaba rechazo del cruce itemKind/trackingMode.');
    }
    const issue = result.error.issues.find((entry) => entry.path[0] === 'trackingMode');
    expect(issue).toBeDefined();
    expect(issue?.message).toBe(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE);
    expect(issue?.message).toContain('Tipo de producto');
    expect(issue?.message).toContain('Control de material');
  });

  it('rechaza Control de material "Con serial" con itemKind por defecto (no serializado) en create', () => {
    // Sin itemKind explícito el default es STOCK: la combinación contradice el cruce.
    const result = CreateInventoryItemSchema.safeParse(
      baseCreate({ trackingMode: InventoryTrackingMode.SERIALIZED }),
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Se esperaba rechazo del cruce itemKind/trackingMode.');
    }
    expect(result.error.issues[0]?.message).toBe(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE);
  });

  it('rechaza Control de material "Activo fijo" con Tipo de producto "Consumible" en create', () => {
    const result = CreateInventoryItemSchema.safeParse(
      baseCreate({
        itemKind: InventoryItemKind.CONSUMABLE,
        trackingMode: InventoryTrackingMode.FIXED_ASSET,
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Se esperaba rechazo del cruce itemKind/trackingMode.');
    }
    expect(result.error.issues[0]?.message).toBe(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE);
  });

  it.each([
    {
      itemKind: InventoryItemKind.SERIALIZED,
      trackingMode: InventoryTrackingMode.SERIALIZED,
    },
    {
      itemKind: InventoryItemKind.SERIALIZED,
      trackingMode: InventoryTrackingMode.FIXED_ASSET,
    },
  ])('acepta itemKind SERIALIZED con trackingMode serializado (%s)', (combination) => {
    const result = CreateInventoryItemSchema.safeParse(baseCreate(combination));
    expect(result.success).toBe(true);
  });

  it.each([InventoryItemKind.STOCK, InventoryItemKind.CONSUMABLE, InventoryItemKind.SERVICE])(
    'acepta itemKind %s con Control de material "Consumible"',
    (itemKind) => {
      const result = CreateInventoryItemSchema.safeParse(baseCreate({ itemKind }));
      expect(result.success).toBe(true);
    },
  );

  it('mantiene intacta la regla vigente trackingMode → assetControlled', () => {
    const rejected = CreateInventoryItemSchema.safeParse(
      baseCreate({
        itemKind: InventoryItemKind.SERIALIZED,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        assetControlled: false,
      }),
    );
    expect(rejected.success).toBe(false);
    if (!rejected.success) {
      const assetIssue = rejected.error.issues.find((entry) => entry.path[0] === 'assetControlled');
      expect(assetIssue?.message).toContain('requieren control de activo');
    }

    const accepted = CreateInventoryItemSchema.safeParse(
      baseCreate({
        itemKind: InventoryItemKind.SERIALIZED,
        trackingMode: InventoryTrackingMode.FIXED_ASSET,
        assetControlled: true,
      }),
    );
    expect(accepted.success).toBe(true);
  });

  it('en update con la contradicción explícita en el payload rechaza (CA-S2-01)', () => {
    const kindFirst = UpdateInventoryItemSchema.safeParse({
      itemKind: InventoryItemKind.SERIALIZED,
      trackingMode: InventoryTrackingMode.CONSUMABLE,
    });
    expect(kindFirst.success).toBe(false);
    if (!kindFirst.success) {
      expect(kindFirst.error.issues[0]?.message).toBe(
        INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE,
      );
    }

    const trackingFirst = UpdateInventoryItemSchema.safeParse({
      trackingMode: InventoryTrackingMode.SERIALIZED,
      itemKind: InventoryItemKind.CONSUMABLE,
    });
    expect(trackingFirst.success).toBe(false);
    if (!trackingFirst.success) {
      expect(trackingFirst.error.issues[0]?.message).toBe(
        INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE,
      );
    }
  });

  it('en update parcial con un solo campo no se pronuncia (lo revalida el merge del servicio)', () => {
    // itemKind SERIALIZED solo: el estado fusionado con el trackingMode guardado
    // lo revalida InventoryItemService.update (ajuste G1).
    const kindOnly = UpdateInventoryItemSchema.safeParse({
      itemKind: InventoryItemKind.SERIALIZED,
    });
    expect(kindOnly.success).toBe(true);

    const trackingOnly = UpdateInventoryItemSchema.safeParse({
      trackingMode: InventoryTrackingMode.CONSUMABLE,
    });
    expect(trackingOnly.success).toBe(true);
  });

  it('en update con la pareja coherente acepta', () => {
    const result = UpdateInventoryItemSchema.safeParse({
      itemKind: InventoryItemKind.SERIALIZED,
      trackingMode: InventoryTrackingMode.FIXED_ASSET,
    });
    expect(result.success).toBe(true);
  });
});
