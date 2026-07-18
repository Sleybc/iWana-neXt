import { render, screen, waitFor } from '@testing-library/react';
import { StockMovementOrigin } from '@iwana/shared';
import { inventoryApi } from '@/lib/api-client';
import { StockKardexPanel } from './StockKardexPanel';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      listMovements: jest.fn(),
    },
  };
});

const listMovementsMock = inventoryApi.listMovements as jest.Mock;

describe('StockKardexPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads and renders kardex movements', async () => {
    listMovementsMock.mockResolvedValue({
      data: [
        {
          id: 'mov-001',
          movementNumber: 'MOV-000001',
          origin: StockMovementOrigin.PURCHASE_RECEIPT,
          originContext: 'inventory.goods-receipt',
          originRefId: null,
          adjustmentReason: null,
          notes: null,
          actorUserId: null,
          isReversal: false,
          createdAt: '2026-07-01T10:00:00.000Z',
          lines: [
            {
              id: 'line-001',
              itemId: 'item-001',
              itemName: 'Cable',
              itemSku: 'CAB-01',
              locationId: 'loc-001',
              locationName: 'Central',
              lotId: null,
              lotNumber: null,
              serializedAssetId: null,
              quantity: '5.00',
              unitCost: null,
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    render(<StockKardexPanel items={[]} locations={[]} />);

    await waitFor(() => {
      expect(screen.getByText('MOV-000001')).toBeInTheDocument();
    });
    expect(listMovementsMock).toHaveBeenCalled();
  });
});
