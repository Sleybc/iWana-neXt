import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryTrackingMode, StockBalanceCondition } from '@iwana/shared';
import { StockIssueDraftLinesTable } from './StockIssueDraftLinesTable';
import type { StockIssueDraftLine } from './stock-issue-draft';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      getItem: jest.fn().mockRejectedValue(new Error('no usado')),
      listAssets: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'asset-1',
            tenantId: 'tenant-1',
            inventoryItemId: 'item-serial',
            serialNumber: 'SN-001',
            assetTag: null,
            currentStatus: 'AVAILABLE',
            currentLocationId: 'loc-1',
          },
        ],
        meta: {
          nextCursor: null,
          total: 1,
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
    },
  };
});

function buildLine(overrides: Partial<StockIssueDraftLine> = {}): StockIssueDraftLine {
  return {
    id: 'line-1',
    itemId: 'item-1',
    productLabel: 'CAB-010 · Cable drop',
    requestedQty: '2',
    unitOfMeasure: 'METER',
    isManual: false,
    condition: StockBalanceCondition.NEW,
    lotId: '',
    serializedAssetId: '',
    serializedAssetLabel: '',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    lots: [],
    availability: [
      {
        condition: StockBalanceCondition.NEW,
        quantityOnHand: '8',
        quantityReserved: '0',
        available: '8',
      },
    ],
    availableSerialCount: 0,
    ...overrides,
  };
}

const baseProps = {
  sourceLocationId: 'loc-1',
  selectedLineIds: [] as string[],
  showAvailableColumn: true,
  onItemChange: jest.fn(),
  onQuantityChange: jest.fn(),
  onConditionChange: jest.fn(),
  onLotChange: jest.fn(),
  onSerializedAssetChange: jest.fn(),
  onToggleLine: jest.fn(),
  onToggleAll: jest.fn(),
  onRemove: jest.fn(),
  onRemoveSelected: jest.fn(),
  onApplyBulkQuantity: jest.fn(),
};

describe('StockIssueDraftLinesTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CA-S1-04: la línea serializada ofrece el picker con id único, aunque venga de catálogo', async () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        lines={[
          buildLine({
            id: 'line-serial',
            itemId: 'item-serial',
            productLabel: 'SER-9 · Router Onu Gpon',
            requestedQty: '1',
            unitOfMeasure: 'UNIT',
            trackingMode: InventoryTrackingMode.SERIALIZED,
            availableSerialCount: 1,
          }),
        ]}
      />,
    );

    const serialInput = await screen.findByRole('combobox', {
      name: 'Serial SER-9 · Router Onu Gpon',
    });
    expect(serialInput).toHaveAttribute('id', 'issue-draft-serial-line-serial');
  });

  it('avisa sin seriales en bodega y deshabilita el picker', async () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        lines={[
          buildLine({
            id: 'line-serial',
            itemId: 'item-serial',
            productLabel: 'SER-9 · Router Onu Gpon',
            trackingMode: InventoryTrackingMode.SERIALIZED,
            availableSerialCount: 0,
          }),
        ]}
      />,
    );

    expect(
      await screen.findByText(
        'Este producto serializado no tiene seriales disponibles en esta bodega.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Serial SER-9 · Router Onu Gpon' })).toBeDisabled();
  });

  it('CA-S1-07: el lote muestra número real y vencimiento, y la unidad usa la etiqueta ADR-085', () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        lines={[
          buildLine({
            lotId: 'lote-a',
            lots: [
              {
                lotId: 'lote-a',
                lotNumber: 'LOTE-A',
                expiryDate: '2026-05-20',
                condition: StockBalanceCondition.NEW,
                available: '8',
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByRole('combobox', { name: /Lote CAB-010/ })).toHaveTextContent(
      'LOTE-A · vence 20/05/2026 · 8',
    );
    expect(screen.getByText('Metro')).toBeInTheDocument();
  });

  it('limita la condición a las que tienen disponible y muestra el inline por línea', async () => {
    const user = userEvent.setup();
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        lines={[
          buildLine({
            condition: StockBalanceCondition.REFURBISHED,
            availability: [
              {
                condition: StockBalanceCondition.NEW,
                quantityOnHand: '0',
                quantityReserved: '0',
                available: '0',
              },
              {
                condition: StockBalanceCondition.REFURBISHED,
                quantityOnHand: '3',
                quantityReserved: '0',
                available: '3',
              },
            ],
          }),
        ]}
        lineErrors={{
          'line-1': {
            message: 'Selecciona el serial del activo para CAB-010 · Cable drop.',
            controlId: 'issue-draft-qty-line-1',
          },
        }}
      />,
    );

    const conditionTrigger = screen.getByRole('combobox', { name: /Condición CAB-010/ });
    expect(conditionTrigger).toHaveTextContent('Reacondicionado · 3');

    await user.click(conditionTrigger);
    expect(await screen.findByRole('option', { name: 'Reacondicionado · 3' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Nuevo/ })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/serial/i);
  });
});
