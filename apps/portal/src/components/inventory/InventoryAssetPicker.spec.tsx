import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { inventoryApi } from '@/lib/api-client';
import { InventoryAssetPicker } from './InventoryAssetPicker';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      listAssets: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'asset-1',
            tenantId: 'tenant-1',
            inventoryItemId: 'item-1',
            serialNumber: 'SN-001',
            assetTag: 'TAG-001',
            currentStatus: 'AVAILABLE',
            currentLocationId: 'loc-1',
          },
          {
            id: 'asset-2',
            tenantId: 'tenant-1',
            inventoryItemId: 'item-1',
            serialNumber: 'SN-002',
            assetTag: null,
            currentStatus: 'AVAILABLE_REFURBISHED',
            currentLocationId: 'loc-1',
          },
        ],
        meta: {
          nextCursor: null,
          total: 2,
          totalIsEstimate: false,
          page: null,
          limit: 50,
          totalPages: null,
          hasMore: false,
          mode: 'cursor',
          capabilities: { randomAccess: false, sortableFields: [] },
          sort: null,
        },
      }),
      searchAssetsForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    },
  };
});

const listAssetsMock = inventoryApi.listAssets as jest.Mock;
const searchAssetsMock = inventoryApi.searchAssetsForPicker as jest.Mock;

describe('InventoryAssetPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('con ítem + bodega consume listAssets con estados disponibles (B2)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <InventoryAssetPicker
        id="picker-serial"
        value={null}
        minChars={0}
        itemId="item-1"
        locationId="loc-1"
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(listAssetsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          locationId: 'loc-1',
          status: 'AVAILABLE,AVAILABLE_REFURBISHED',
        }),
        undefined,
      );
    });
    expect(searchAssetsMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: /SN-001/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /SN-002/ })).toBeInTheDocument();
  });

  it('excluye los seriales usados en otras líneas', async () => {
    const user = userEvent.setup();

    render(
      <InventoryAssetPicker
        id="picker-serial"
        value={null}
        minChars={0}
        itemId="item-1"
        locationId="loc-1"
        excludeIds={['asset-1']}
        onChange={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /SN-001/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: /SN-002/ })).toBeInTheDocument();
  });

  it('sin alcance conserva el buscador global', async () => {
    const user = userEvent.setup();

    render(<InventoryAssetPicker id="picker-serial" value={null} onChange={jest.fn()} />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'SN');

    await waitFor(() => {
      expect(searchAssetsMock).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'SN' }),
        expect.anything(),
      );
    });
    expect(listAssetsMock).not.toHaveBeenCalled();
  });
});
