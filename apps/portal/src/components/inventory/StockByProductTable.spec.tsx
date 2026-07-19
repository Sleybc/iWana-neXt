import { render, screen } from '@testing-library/react';
import { StockBalanceCondition, StockLocationStatus, StockLocationType } from '@iwana/shared';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { StockByProductTable } from './StockByProductTable';

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
    minimumStock: '5',
    reorderPoint: '8',
    targetStock: '20',
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

describe('StockByProductTable', () => {
  it('muestra el trío existencia / reservado / disponible con encabezados accesibles', () => {
    render(
      <StockByProductTable
        items={[makeItem()]}
        balances={[makeBalance()]}
        locations={[makeLocation()]}
        onViewDetail={jest.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Existencia' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reservado' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Disponible' })).toBeInTheDocument();

    // Existencia 10 − reservado 4 = disponible 6.
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('clasifica por disponible: bajo mínimo aunque la existencia lo supere', () => {
    render(
      <StockByProductTable
        items={[makeItem()]}
        balances={[makeBalance({ quantityOnHand: '10.00', quantityReserved: '7.00' })]}
        locations={[makeLocation()]}
        onViewDetail={jest.fn()}
      />,
    );

    // Disponible 3 < mínimo 5, aunque la existencia (10) esté por encima.
    expect(screen.getByText('Bajo mínimo')).toBeInTheDocument();
  });

  it('explica de dónde sale el material reservado', () => {
    render(
      <StockByProductTable
        items={[makeItem()]}
        balances={[makeBalance()]}
        locations={[makeLocation()]}
        onViewDetail={jest.fn()}
      />,
    );

    expect(screen.getByText(/salidas pendientes de despacho/i)).toBeInTheDocument();
  });
});
