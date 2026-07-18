import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockBalanceCondition, StockLocationStatus, StockLocationType } from '@iwana/shared';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { StockLocationsMatrix } from './StockLocationsMatrix';

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
    quantityReserved: '3.00',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StockLocationsMatrix', () => {
  it('muestra existencia, reservado y disponible (no rotula onHand como disponible)', async () => {
    const user = userEvent.setup();

    render(
      <StockLocationsMatrix
        locations={[makeLocation()]}
        balances={[makeBalance()]}
        items={[makeItem()]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Existencia' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reservado' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Disponible' })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ver existencias/i }));

    expect(screen.getAllByRole('columnheader', { name: 'Existencia' }).length).toBeGreaterThan(1);
    expect(screen.getAllByRole('columnheader', { name: 'Reservado' }).length).toBeGreaterThan(1);
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
  });
});
