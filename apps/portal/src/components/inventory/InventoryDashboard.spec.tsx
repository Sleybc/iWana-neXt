import { render, screen } from '@testing-library/react';
import { InventoryResponsibleType, SerializedAssetStatus } from '@iwana/shared';
import type { InventoryDashboardSummary } from '@/lib/api-client';
import { InventoryDashboard } from './InventoryDashboard';
import { formatInventoryCurrency } from './inventory-labels';

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
  it('muestra la tarjeta de valor estimado de inventario', () => {
    render(<InventoryDashboard summary={summary} />);

    expect(screen.getByText('Valor estimado de inventario')).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === formatInventoryCurrency(2_500_000)),
    ).toBeInTheDocument();
  });

  it('incluye el valor estimado en el breakdown de categorías', () => {
    render(<InventoryDashboard summary={summary} />);

    const expectedSecondary = `CPE · 1 productos · ${formatInventoryCurrency(1_200_000)}`;
    expect(
      screen.getByText((_, element) => element?.textContent === expectedSecondary),
    ).toBeInTheDocument();
  });
});
