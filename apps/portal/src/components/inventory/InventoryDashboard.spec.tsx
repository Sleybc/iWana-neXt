import { render, screen } from '@testing-library/react';
import { InventoryResponsibleType, SerializedAssetStatus } from '@iwana/shared';
import type { InventoryDashboardSummary } from '@/lib/api-client';
import { InventoryDashboard } from './InventoryDashboard';
import {
  formatInventoryCurrency,
  INVENTORY_ESTIMATED_VALUE_HELP_TEXT,
  INVENTORY_ESTIMATED_VALUE_LABEL,
} from './inventory-labels';

const summary: InventoryDashboardSummary = {
  itemsCount: 3,
  locationsCount: 2,
  serializedAssetsCount: 4,
  balancesCount: 5,
  totalOnHand: 17,
  estimatedTotalValue: 2_500_000,
  balancesByLocation: [
    {
      locationId: 'loc-1',
      locationCode: 'BOD-01',
      locationName: 'Bodega principal',
      totalOnHand: 10,
      uniqueItems: 2,
    },
  ],
  balancesByCategory: [
    {
      categoryId: 'cat-cpe',
      categoryCodePrefix: 'CPE',
      categoryName: 'CPE',
      totalOnHand: 8,
      uniqueItems: 1,
      estimatedValue: 1_200_000,
    },
  ],
  serializedAssetsByStatus: [{ status: SerializedAssetStatus.AVAILABLE, count: 2 }],
  serializedAssetsByResponsibleType: [
    { responsibleType: InventoryResponsibleType.WAREHOUSE, count: 2 },
  ],
};

describe('InventoryDashboard', () => {
  it('muestra la tarjeta de valor estimado de inventario (CA-F4-05)', () => {
    render(<InventoryDashboard summary={summary} />);

    expect(screen.getByText(INVENTORY_ESTIMATED_VALUE_LABEL)).toBeInTheDocument();
    expect(screen.getByText(INVENTORY_ESTIMATED_VALUE_HELP_TEXT)).toBeInTheDocument();
    const estimatedValue = screen.getByText(
      (_, element) => element?.textContent === formatInventoryCurrency(2_500_000),
    );
    expect(estimatedValue).toBeInTheDocument();
    expect(estimatedValue).toHaveClass('tabular-nums');
  });

  it('expone cinco KPI de salud y omite censo y rankings de workspace', () => {
    render(<InventoryDashboard summary={summary} />);

    expect(screen.getByText('Material disponible')).toBeInTheDocument();
    expect(screen.getByText('Bodegas y campo')).toBeInTheDocument();
    expect(screen.getByText('Activos con serial')).toBeInTheDocument();
    expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    expect(screen.queryByText('Material registrado')).not.toBeInTheDocument();
    expect(screen.queryByText('Bodegas con más material')).not.toBeInTheDocument();
    expect(screen.queryByText('Categorías con más material')).not.toBeInTheDocument();
  });
});
