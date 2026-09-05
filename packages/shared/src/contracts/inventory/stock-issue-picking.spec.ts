import { StockBalanceCondition } from '../../enums/inventory';
import type { StockIssueLineInput, StockIssueLineRecord } from './stock-issue-picking';

const ASSET_A = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

describe('contrato stock-issue-picking (MOD12 S2 §5.1)', () => {
  it('expone serializedAssetIds en la línea de entrada y en la lectura del detalle', () => {
    const input: StockIssueLineInput = {
      itemId: ITEM_ID,
      requestedQty: 2,
      serializedAssetIds: [ASSET_A],
    };

    const record: StockIssueLineRecord = {
      id: '55555555-5555-4555-8555-555555555555',
      tenantId: '66666666-6666-4666-8666-666666666666',
      issueId: '77777777-7777-4777-8777-777777777777',
      itemId: ITEM_ID,
      requestedQty: '2.00',
      dispatchedQty: null,
      lotId: null,
      serializedAssetId: ASSET_A,
      serializedAssetIds: [ASSET_A],
      condition: StockBalanceCondition.NEW,
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
    };

    expect(input.serializedAssetIds).toEqual([ASSET_A]);
    expect(input.serializedAssetId).toBeUndefined();
    // Cantidades de lectura como cadena decimal, coherente con S1.
    expect(record.requestedQty).toBe('2.00');
    expect(record.serializedAssetIds).toEqual([ASSET_A]);
  });

  it('mantiene serializedAssetId singular como campo de transición opcional en la entrada', () => {
    const legacyInput: StockIssueLineInput = {
      itemId: ITEM_ID,
      requestedQty: 1,
      serializedAssetId: ASSET_A,
    };

    expect(legacyInput.serializedAssetId).toBe(ASSET_A);
    expect(legacyInput.serializedAssetIds).toBeUndefined();
  });
});
