import { PurchaseRequestLineSourceKind } from '@iwana/shared';
import {
  addCatalogSelectionToDraft,
  applyBulkQuantityToDraftLines,
  applyBulkSupplierToDraftLines,
  createEmptyPurchaseDraft,
  removeDraftLine,
} from './purchase-request-draft';

describe('purchase-request-draft', () => {
  it('adds multiple selected products into the draft with quantity 1 defaults', () => {
    const draft = createEmptyPurchaseDraft();

    const next = addCatalogSelectionToDraft(
      draft,
      [
        {
          id: 'item-1',
          sku: 'ONT-001',
          name: 'ONT WiFi 6',
          unitOfMeasure: 'unidad',
          purchaseUnitOfMeasure: 'caja',
          preferredSupplierRefId: 'supplier-1',
          preferredSupplierName: 'Proveedor Alfa',
        },
        {
          id: 'item-2',
          sku: 'CAB-010',
          name: 'Cable drop',
          unitOfMeasure: 'metro',
          purchaseUnitOfMeasure: null,
          preferredSupplierRefId: null,
          preferredSupplierName: null,
        },
      ],
      PurchaseRequestLineSourceKind.INVENTORY_ITEM,
    );

    expect(next.lines).toHaveLength(2);
    expect(next.lines[0]).toMatchObject({
      inventoryItemId: 'item-1',
      quantityRequested: '1',
      unitOfMeasure: 'caja',
    });
    expect(next.lines[1]).toMatchObject({
      inventoryItemId: 'item-2',
      quantityRequested: '1',
      unitOfMeasure: 'metro',
    });
  });

  it('removes a draft line without mutating the original order', () => {
    const draft = addCatalogSelectionToDraft(
      createEmptyPurchaseDraft(),
      [
        {
          id: 'item-1',
          sku: 'ONT-001',
          name: 'ONT WiFi 6',
          unitOfMeasure: 'unidad',
          purchaseUnitOfMeasure: null,
          preferredSupplierRefId: null,
          preferredSupplierName: null,
        },
      ],
      PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION,
    );

    const next = removeDraftLine(draft, draft.lines[0]!.id);

    expect(draft.lines).toHaveLength(1);
    expect(next.lines).toHaveLength(0);
  });
});

describe('purchase-request-draft bulk actions', () => {
  it('applies bulk quantity to selected draft lines only', () => {
    const draft = addCatalogSelectionToDraft(
      addCatalogSelectionToDraft(
        createEmptyPurchaseDraft(),
        [
          {
            id: 'item-1',
            sku: 'ONT-001',
            name: 'ONT WiFi 6',
            unitOfMeasure: 'unidad',
            purchaseUnitOfMeasure: null,
            preferredSupplierRefId: null,
            preferredSupplierName: null,
          },
          {
            id: 'item-2',
            sku: 'CAB-010',
            name: 'Cable drop',
            unitOfMeasure: 'metro',
            purchaseUnitOfMeasure: null,
            preferredSupplierRefId: null,
            preferredSupplierName: null,
          },
        ],
        PurchaseRequestLineSourceKind.INVENTORY_ITEM,
      ),
      [],
      PurchaseRequestLineSourceKind.INVENTORY_ITEM,
    );

    const next = applyBulkQuantityToDraftLines(draft, [draft.lines[0]!.id], '5');

    expect(next.lines[0]?.quantityRequested).toBe('5');
    expect(next.lines[1]?.quantityRequested).toBe('1');
  });

  it('applies bulk supplier to selected draft lines only', () => {
    const draft = addCatalogSelectionToDraft(
      createEmptyPurchaseDraft(),
      [
        {
          id: 'item-1',
          sku: 'ONT-001',
          name: 'ONT WiFi 6',
          unitOfMeasure: 'unidad',
          purchaseUnitOfMeasure: null,
          preferredSupplierRefId: null,
          preferredSupplierName: null,
        },
      ],
      PurchaseRequestLineSourceKind.INVENTORY_ITEM,
    );

    const next = applyBulkSupplierToDraftLines(
      draft,
      [draft.lines[0]!.id],
      'supplier-9',
      'Proveedor Beta',
    );

    expect(next.lines[0]).toMatchObject({
      suggestedPartyRefId: 'supplier-9',
      suggestedPartyName: 'Proveedor Beta',
    });
  });
});
