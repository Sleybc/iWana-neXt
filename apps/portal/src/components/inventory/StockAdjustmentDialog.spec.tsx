import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  StockLocationStatus,
  StockLocationType,
} from '@iwana/shared';
import { inventoryApi, type InventoryItemRecord, type StockLocationRecord } from '@/lib/api-client';
import { StockAdjustmentDialog } from './StockAdjustmentDialog';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      createAdjustment: jest.fn(),
    },
  };
});

const createAdjustmentMock = inventoryApi.createAdjustment as jest.Mock;

function makeItem(overrides: Partial<InventoryItemRecord> = {}): InventoryItemRecord {
  return {
    id: 'item-001',
    tenantId: 'tenant-001',
    sku: 'CAB-01',
    name: 'Cable UTP',
    description: null,
    brand: null,
    model: null,
    itemKind: InventoryItemKind.STOCK,
    category: InventoryItemCategory.OTHER,
    categoryId: 'cat-001',
    categoryName: 'Otros',
    categoryCode: 'OTH',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    unitOfMeasure: 'UND',
    baseCost: '0',
    minimumStock: '5',
    purchasable: true,
    inventoryControlled: true,
    assetControlled: false,
    preferredSupplierRefId: null,
    supplierSku: null,
    purchaseUnitOfMeasure: null,
    purchaseToBaseUomFactor: null,
    standardCost: '0',
    lastPurchaseCost: null,
    reorderPoint: '10',
    targetStock: '20',
    minimumOrderQty: '1',
    orderMultiple: null,
    leadTimeDays: null,
    usefulLifeMonths: null,
    commercialReferenceId: null,
    status: InventoryItemStatus.ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLocation(): StockLocationRecord {
  return {
    id: 'loc-001',
    tenantId: 'tenant-001',
    code: 'BC',
    name: 'Bodega central',
    type: StockLocationType.MAIN_WAREHOUSE,
    status: StockLocationStatus.ACTIVE,
    responsibleRefId: null,
    maxCapacity: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('StockAdjustmentDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
      configurable: true,
    });
  });

  it('submits a signed outbound adjustment', async () => {
    const user = userEvent.setup();
    createAdjustmentMock.mockResolvedValue({
      movement: { movementNumber: 'MOV-000123' },
      lines: [],
    });
    const onRegistered = jest.fn();
    const onClose = jest.fn();

    render(
      <StockAdjustmentDialog
        open
        items={[makeItem()]}
        locations={[makeLocation()]}
        preselectedItemId="item-001"
        onClose={onClose}
        onAdjustmentRegistered={onRegistered}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Dirección' }));
    await user.click(await screen.findByRole('option', { name: 'Salida' }));
    await user.clear(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '2');
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }));

    await waitFor(() => {
      expect(createAdjustmentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-001',
          locationId: 'loc-001',
          quantityDelta: -2,
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
        }),
      );
    });
    expect(onRegistered).toHaveBeenCalledWith('MOV-000123');
    expect(onClose).toHaveBeenCalled();
  });
});
