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
    expect(line?.serializedAssetId).toBe(ASSET_A);
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

  it('mantiene la línea no serializada sin serializedAssetIds', () => {
    const parsed = CreateStockIssueSchema.parse(
      buildCreatePayload([{ itemId: ITEM_ID, requestedQty: 3 }]),
    );
    const line = parsed.lines[0];

    expect(line?.serializedAssetIds).toBeUndefined();
  });
});
