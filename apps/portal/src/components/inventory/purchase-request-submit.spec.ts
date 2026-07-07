import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import { buildCreatePurchaseRequestPayload } from './purchase-request-submit';

describe('purchase-request-submit', () => {
  it('maps replenishment suggestion lines with inventory item ids', () => {
    const result = buildCreatePurchaseRequestPayload({
      title: 'Reposicion ONT',
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: PurchaseRequestPriority.NORMAL,
      requestingArea: 'Operaciones',
      justification: 'Reposicion preventiva por consumo de campo.',
      neededByDate: '',
      lines: [
        {
          sourceKind: PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION,
          inventoryItemId: 'item-1',
          productLabel: 'ONT-001 - ONT WiFi 6',
          freeTextDescription: '',
          quantityRequested: '2',
          unitOfMeasure: 'caja',
          suggestedPartyRefId: 'supplier-1',
          notes: '',
        },
      ],
    });

    expect(result.error).toBeNull();
    expect(result.payload?.lines[0]).toMatchObject({
      sourceKind: PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION,
      inventoryItemId: 'item-1',
      quantityRequested: 2,
    });
  });

  it('rejects requests without enough justification text', () => {
    const result = buildCreatePurchaseRequestPayload({
      title: 'Reposicion ONT',
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: PurchaseRequestPriority.NORMAL,
      requestingArea: 'Operaciones',
      justification: 'Corta',
      neededByDate: '',
      lines: [
        {
          sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
          inventoryItemId: 'item-1',
          productLabel: 'ONT-001 - ONT WiFi 6',
          freeTextDescription: '',
          quantityRequested: '1',
          unitOfMeasure: 'caja',
          suggestedPartyRefId: '',
          notes: '',
        },
      ],
    });

    expect(result.payload).toBeNull();
    expect(result.error).toMatch(/10 caracteres/i);
  });
});
