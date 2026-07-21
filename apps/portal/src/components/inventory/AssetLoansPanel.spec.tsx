import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetLoanRecord, InventoryItemRecord, SerializedAssetRecord } from '@/lib/api-client';
import { AssetLoansPanel } from './AssetLoansPanel';
import { ASSET_LOAN_STATUS_LABELS, formatInventoryOpaqueRef } from './inventory-labels';

const SUBSCRIBER_REF = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CONTRACT_REF = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const mockAssets = [
  {
    id: 'asset-001',
    inventoryItemId: 'item-001',
    serialNumber: 'SN-001',
    assetTag: null,
  },
] as SerializedAssetRecord[];

const mockItems = [
  {
    id: 'item-001',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
  },
] as InventoryItemRecord[];

const mockLoans: AssetLoanRecord[] = [
  {
    id: 'loan-001',
    serializedAssetId: 'asset-001',
    subscriberRefId: SUBSCRIBER_REF,
    contractRefId: CONTRACT_REF,
    installedAt: '2026-06-01T10:00:00.000Z',
    removedAt: null,
    executionOrderRefId: 'eo-001',
    stockMovementId: 'mov-001',
    status: 'abierto',
  },
];

describe('AssetLoansPanel · bandeja comodatos Fase 05B', () => {
  it('lista comodatos con referencias opacas y acceso a ficha 360', () => {
    const onOpenAssetDetail = jest.fn();

    render(
      <AssetLoansPanel
        loans={mockLoans}
        assets={mockAssets}
        items={mockItems}
        isLoading={false}
        error={null}
        statusFilter="all"
        onStatusFilterChange={jest.fn()}
        onOpenAssetDetail={onOpenAssetDetail}
        onRefresh={jest.fn()}
      />,
    );

    expect(screen.getByText('ONT-001 · SN-001')).toBeInTheDocument();
    expect(
      screen.getByText(formatInventoryOpaqueRef('subscriber', SUBSCRIBER_REF)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatInventoryOpaqueRef('contract', CONTRACT_REF)),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('asset-loan-row-loan-001')).getByText('Abierto'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver ficha 360' }));
    expect(onOpenAssetDetail).toHaveBeenCalledWith('asset-001');
  });

  it('muestra estado vacío cuando no hay comodatos', () => {
    render(
      <AssetLoansPanel
        loans={[]}
        assets={mockAssets}
        items={mockItems}
        isLoading={false}
        error={null}
        statusFilter="all"
        onStatusFilterChange={jest.fn()}
        onOpenAssetDetail={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );

    expect(screen.getByText('Sin comodatos registrados')).toBeInTheDocument();
  });

  it('filtra por estado con Select de @iwana/ui', async () => {
    const user = userEvent.setup();
    const onStatusFilterChange = jest.fn();

    render(
      <AssetLoansPanel
        loans={mockLoans}
        assets={mockAssets}
        items={mockItems}
        isLoading={false}
        error={null}
        statusFilter="all"
        onStatusFilterChange={onStatusFilterChange}
        onOpenAssetDetail={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );

    expect(screen.getByTestId('asset-loans-status-filter')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: ASSET_LOAN_STATUS_LABELS.cerrado }));

    expect(onStatusFilterChange).toHaveBeenCalledWith('cerrado');
  });
});
