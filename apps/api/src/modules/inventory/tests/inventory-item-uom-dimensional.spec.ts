import { InventoryTrackingMode } from '@iwana/shared';
import { CreateInventoryItemSchema, UpdateInventoryItemSchema } from '../dto';

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

function baseCreate(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Cable drop',
    categoryId: CATEGORY_ID,
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    unitOfMeasure: 'UNIT',
    ...overrides,
  };
}

/**
 * Validación dimensional autoritativa en backend (ADR-085 D2 · F5b).
 * El cliente puede guiar, no decidir: estos rechazos nacen del DTO.
 */
describe('refineInventoryItemMaster — validación dimensional (F5b)', () => {
  it('CA-F5B-05: acepta conversión dentro de COUNT (caja → unidad)', () => {
    const result = CreateInventoryItemSchema.safeParse(
      baseCreate({ purchaseUnitOfMeasure: 'BOX', purchaseToBaseUomFactor: 100 }),
    );
    expect(result.success).toBe(true);
  });

  it('acepta conversión dentro de LENGTH (kilómetro → metro)', () => {
    const result = CreateInventoryItemSchema.safeParse(
      baseCreate({
        unitOfMeasure: 'METER',
        purchaseUnitOfMeasure: 'KILOMETER',
        purchaseToBaseUomFactor: 1000,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('CA-F5B-04: rechaza factor entre dimensiones distintas (metro → litro)', () => {
    const result = CreateInventoryItemSchema.safeParse(
      baseCreate({
        unitOfMeasure: 'METER',
        purchaseUnitOfMeasure: 'LITER',
        purchaseToBaseUomFactor: 1,
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Se esperaba rechazo dimensional.');
    }
    const issue = result.error.issues.find(
      (entry) => (entry.path[0] as string) === 'purchaseUnitOfMeasure',
    );
    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/dimensiones distintas/);
    expect(issue?.message).toMatch(/misma dimensión/);
  });

  it('rechaza unidad de compra sin factor (nunca se asume 1 implícito)', () => {
    const result = CreateInventoryItemSchema.safeParse(
      baseCreate({ purchaseUnitOfMeasure: 'BOX', purchaseToBaseUomFactor: null }),
    );
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Se esperaba rechazo por factor ausente.');
    }
    expect(result.error.issues[0]?.message).toMatch(/mayor que cero/);
  });

  it('exige factor 1 cuando ambas unidades coinciden', () => {
    const rejected = CreateInventoryItemSchema.safeParse(
      baseCreate({ purchaseUnitOfMeasure: 'UNIT', purchaseToBaseUomFactor: 2 }),
    );
    expect(rejected.success).toBe(false);
    if (!rejected.success) {
      expect(rejected.error.issues[0]?.message).toMatch(/debe ser 1/);
    }

    const accepted = CreateInventoryItemSchema.safeParse(
      baseCreate({ purchaseUnitOfMeasure: 'UNIT', purchaseToBaseUomFactor: 1 }),
    );
    expect(accepted.success).toBe(true);
  });

  it('en update parcial sin la unidad base no se pronuncia (lo revalida el merge del servicio)', () => {
    const result = UpdateInventoryItemSchema.safeParse({
      purchaseUnitOfMeasure: 'BOX',
      purchaseToBaseUomFactor: 100,
    });
    expect(result.success).toBe(true);
  });

  it('en update con ambas unidades rechaza la mezcla dimensional', () => {
    const result = UpdateInventoryItemSchema.safeParse({
      unitOfMeasure: 'METER',
      purchaseUnitOfMeasure: 'LITER',
      purchaseToBaseUomFactor: 1,
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Se esperaba rechazo dimensional en update.');
    }
    expect(result.error.issues[0]?.message).toMatch(/dimensiones distintas/);
  });
});
