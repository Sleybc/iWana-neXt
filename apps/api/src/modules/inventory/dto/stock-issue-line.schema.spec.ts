import { StockIssueType } from '@iwana/shared';
import { CreateStockIssueSchema } from './index';

const ASSET_A = '11111111-1111-4111-8111-111111111111';
const ASSET_B = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_LOCATION_ID = '44444444-4444-4444-8444-444444444444';

function buildCreatePayload(lines: unknown[]) {
  return {
    type: StockIssueType.SALE_DISPATCH,
    sourceLocationId: SOURCE_LOCATION_ID,
    commercialRefId: 'REF-001',
    lines,
  };
}

describe('StockIssueLineSchema seriales múltiples (MOD12 S2 · B1)', () => {
  it('normaliza serializedAssetId singular a arreglo de un elemento (compatibilidad S1)', () => {
    const parsed = CreateStockIssueSchema.parse(
      buildCreatePayload([{ itemId: ITEM_ID, requestedQty: 1, serializedAssetId: ASSET_A }]),
    );
    const line = parsed.lines[0];

    expect(line?.serializedAssetIds).toEqual([ASSET_A]);
    // El singular se descarta al normalizar: retenerlo junto al arreglo hacía
    // que un segundo parse de esta misma salida chocara con el superRefine que
    // prohíbe ambos campos a la vez.
    expect(line?.serializedAssetId).toBeUndefined();
  });

  it('es idempotente: parsear la salida ya normalizada no la rechaza', () => {
    const first = CreateStockIssueSchema.parse(
      buildCreatePayload([{ itemId: ITEM_ID, requestedQty: 1, serializedAssetId: ASSET_A }]),
    );

    // Los controllers re-parsean el body que el ZodValidationPipe ya validó
    // (p. ej. `inventory.controller.ts` en `POST /inventory/issues`), así que
    // el esquema debe aceptar su propia salida.
    const second = CreateStockIssueSchema.safeParse(first);

    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.data.lines[0]?.serializedAssetIds).toEqual([ASSET_A]);
    }
  });

  it('acepta serializedAssetIds como arreglo de uuids', () => {
    const parsed = CreateStockIssueSchema.parse(
      buildCreatePayload([
        { itemId: ITEM_ID, requestedQty: 2, serializedAssetIds: [ASSET_A, ASSET_B] },
      ]),
    );
    const line = parsed.lines[0];

    expect(line?.serializedAssetIds).toEqual([ASSET_A, ASSET_B]);
  });

  it('rechaza serializedAssetIds vacío cuando se envía', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([{ itemId: ITEM_ID, requestedQty: 1, serializedAssetIds: [] }]),
    );

    expect(result.success).toBe(false);
  });

  it('rechaza seriales repetidos dentro de la línea', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([
        { itemId: ITEM_ID, requestedQty: 2, serializedAssetIds: [ASSET_A, ASSET_A] },
      ]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('repetirse'))).toBe(true);
    }
  });

  it('rechaza ambos campos serial a la vez con 400 en español (A2)', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([
        {
          itemId: ITEM_ID,
          requestedQty: 1,
          serializedAssetId: ASSET_A,
          serializedAssetIds: [ASSET_A],
        },
      ]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('envíe solo uno de los dos campos'),
        ),
      ).toBe(true);
    }
  });

  it('acepta singular nulo junto al arreglo (nulo equivale a ausente)', () => {
    const parsed = CreateStockIssueSchema.parse(
      buildCreatePayload([
        {
          itemId: ITEM_ID,
          requestedQty: 1,
          serializedAssetId: null,
          serializedAssetIds: [ASSET_A],
        },
      ]),
    );

    expect(parsed.lines[0]?.serializedAssetIds).toEqual([ASSET_A]);
  });

  it('mantiene la línea no serializada sin serializedAssetIds', () => {
    const parsed = CreateStockIssueSchema.parse(
      buildCreatePayload([{ itemId: ITEM_ID, requestedQty: 3 }]),
    );
    const line = parsed.lines[0];

    expect(line?.serializedAssetIds).toBeUndefined();
  });

  it('CA-S2.1-BE04: rechaza en el borde la cantidad fraccionaria con grupo', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([
        { itemId: ITEM_ID, requestedQty: 2.5, serializedAssetIds: [ASSET_A, ASSET_B] },
      ]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('número entero'))).toBe(
        true,
      );
    }
  });

  it('CA-S2.1-BE04: rechaza en el borde la cantidad distinta del tamaño del grupo', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([
        { itemId: ITEM_ID, requestedQty: 3, serializedAssetIds: [ASSET_A, ASSET_B] },
      ]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('(2 seriales)'))).toBe(
        true,
      );
    }
  });

  it('CA-S2.1-BE04: el singular sigue despachando como grupo de 1 con cantidad 1', () => {
    const parsed = CreateStockIssueSchema.parse(
      buildCreatePayload([{ itemId: ITEM_ID, requestedQty: 1, serializedAssetId: ASSET_A }]),
    );

    expect(parsed.lines[0]?.serializedAssetIds).toEqual([ASSET_A]);
  });
});

/**
 * Incidente 2026-09-12: un 400 del borde con mensajes por defecto de zod (en
 * inglés, p. ej. "Invalid uuid") no era identificable para el operador del
 * portal. Estos casos fijan el mensaje en español de cada rechazo de formato.
 */
describe('StockIssueLineSchema mensajes del borde en español (paridad portal)', () => {
  it('rechaza itemId no uuid con mensaje en español', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([{ itemId: 'item-1', requestedQty: 1 }]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('El ítem de la línea no es válido.'),
        ),
      ).toBe(true);
    }
  });

  it('rechaza lotId con número de lote (no uuid) con mensaje en español', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([{ itemId: ITEM_ID, requestedQty: 300, lotId: 'LOT-GR-000003-1' }]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('El lote de la línea no es válido.'),
        ),
      ).toBe(true);
    }
  });

  it('rechaza seriales no uuid en el grupo con mensaje en español', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([
        { itemId: ITEM_ID, requestedQty: 1, serializedAssetIds: ['serial-sin-uuid'] },
      ]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('Hay un serial no válido en el grupo de seriales'),
        ),
      ).toBe(true);
    }
  });

  it('rechaza cantidad vacía con mensaje en español de mayor a cero', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([{ itemId: ITEM_ID, requestedQty: '' }]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('La cantidad solicitada debe ser mayor a cero.'),
        ),
      ).toBe(true);
    }
  });

  it('rechaza cantidad no numérica con mensaje en español de número válido', () => {
    const result = CreateStockIssueSchema.safeParse(
      buildCreatePayload([{ itemId: ITEM_ID, requestedQty: 'abc' }]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('La cantidad solicitada debe ser un número válido.'),
        ),
      ).toBe(true);
    }
  });

  it('rechaza bodega de origen no uuid con mensaje en español', () => {
    const result = CreateStockIssueSchema.safeParse({
      type: StockIssueType.SALE_DISPATCH,
      sourceLocationId: 'loc-1',
      commercialRefId: 'REF-001',
      lines: [{ itemId: ITEM_ID, requestedQty: 1 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('La bodega de origen no es válida.'),
        ),
      ).toBe(true);
    }
  });

  it('rechaza destino no uuid con mensaje en español', () => {
    const result = CreateStockIssueSchema.safeParse({
      type: StockIssueType.TECHNICIAN_CUSTODY,
      sourceLocationId: SOURCE_LOCATION_ID,
      destinationLocationId: 'loc-2',
      lines: [{ itemId: ITEM_ID, requestedQty: 1 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('La ubicación de destino no es válida.'),
        ),
      ).toBe(true);
    }
  });
});
