import { render, screen } from '@testing-library/react';
import {
  InventoryItemKind,
  InventoryTrackingMode,
  StockBalanceCondition,
  StockLocationStatus,
  StockLocationType,
} from '@iwana/shared';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { StockTransferDialog } from './StockTransferDialog';

function makeLocation(overrides: Partial<StockLocationRecord> = {}): StockLocationRecord {
  return {
    id: 'loc-001',
    tenantId: 'tenant-001',
    code: 'BOD-01',
    name: 'Bodega principal',
    type: StockLocationType.MAIN_WAREHOUSE,
    status: StockLocationStatus.ACTIVE,
    responsibleRefId: null,
    maxCapacity: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<InventoryItemRecord> = {}): InventoryItemRecord {
  return {
    id: 'item-001',
    tenantId: 'tenant-001',
    sku: 'CAB-01',
    name: 'Cable drop',
    unitOfMeasure: 'm',
    itemKind: InventoryItemKind.STOCK,
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    minimumStock: '0',
    reorderPoint: '0',
    targetStock: '0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as InventoryItemRecord;
}

function makeBalance(overrides: Partial<StockBalanceRecord> = {}): StockBalanceRecord {
  return {
    id: 'bal-001',
    tenantId: 'tenant-001',
    itemId: 'item-001',
    locationId: 'loc-001',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '10.00',
    quantityReserved: '4.00',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(balances: StockBalanceRecord[]) {
  return render(
    <StockTransferDialog
      open
      items={[makeItem()]}
      locations={[makeLocation()]}
      balances={balances}
      isSubmitting={false}
      error={null}
      onClose={jest.fn()}
      onSubmit={jest.fn()}
    />,
  );
}

describe('StockTransferDialog', () => {
  it('ofrece el producto cuando queda material disponible tras las reservas', () => {
    renderDialog([makeBalance()]);

    expect(screen.getByRole('option', { name: 'CAB-01 · Cable drop' })).toBeInTheDocument();
  });

  it('no ofrece productos cuyo material está totalmente reservado', () => {
    renderDialog([makeBalance({ quantityOnHand: '10.00', quantityReserved: '10.00' })]);

    expect(screen.queryByRole('option', { name: 'CAB-01 · Cable drop' })).not.toBeInTheDocument();
    expect(screen.getByText('Sin material disponible para salida')).toBeInTheDocument();
  });
});
