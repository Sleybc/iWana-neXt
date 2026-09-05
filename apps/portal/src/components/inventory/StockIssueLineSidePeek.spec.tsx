import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryTrackingMode, StockBalanceCondition } from '@iwana/shared';
import { SERIAL_QTY_HELP_TEXT, StockIssueLineSidePeek } from './StockIssueLineSidePeek';
import type { StockIssueDraftLine } from './stock-issue-draft';

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
            inventoryItemId: 'item-serial',
            serialNumber: 'SN-001',
            assetTag: null,
            currentStatus: 'AVAILABLE',
            currentLocationId: 'loc-1',
          },
          {
            id: 'asset-2',
            tenantId: 'tenant-1',
            inventoryItemId: 'item-serial',
            serialNumber: 'SN-002',
            assetTag: null,
            currentStatus: 'AVAILABLE',
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
      getAsset: jest.fn().mockRejectedValue(new Error('no usado')),
    },
  };
});

function buildLine(overrides: Partial<StockIssueDraftLine> = {}): StockIssueDraftLine {
  return {
    id: 'line-1',
    itemId: 'item-1',
    sku: 'CAB-010',
    productLabel: 'Cable drop',
    requestedQty: '1',
    unitOfMeasure: 'METER',
    isManual: false,
    condition: StockBalanceCondition.NEW,
    lotId: '',
    serializedAssetId: '',
    serializedAssetLabel: '',
    serializedAssetIds: [],
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
  open: true,
  onOpenChange: jest.fn(),
  sourceLocationId: 'loc-1',
  excludedSerializedAssetIds: [] as string[],
  serialLabelsById: {} as Record<string, string>,
  onConfirm: jest.fn(),
};

describe('StockIssueLineSidePeek', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('abre con los valores del producto: cabecera, condición y lote preseleccionado', () => {
    render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="create"
        line={buildLine({
          sku: 'ONT-001',
          productLabel: 'ONT WiFi 6',
          unitOfMeasure: 'UNIT',
          condition: StockBalanceCondition.NEW,
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
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'ONT WiFi 6' })).toBeInTheDocument();
    expect(screen.getByText(/SKU ONT-001/)).toBeInTheDocument();
    expect(screen.getByLabelText('Condición')).toHaveTextContent('Nuevo · 8');
    expect(screen.getByLabelText('Lote')).toHaveTextContent('LOTE-A · vence 20/05/2026 · 8');
    expect(screen.getByRole('button', { name: 'Agregar al borrador' })).toBeEnabled();
  });

  it('para el serializado la cantidad es el número de seriales elegidos y se anuncia', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="create"
        onConfirm={onConfirm}
        line={buildLine({
          id: 'line-serial',
          itemId: 'item-serial',
          sku: 'SER-9',
          productLabel: 'Router Onu Gpon',
          unitOfMeasure: 'UNIT',
          trackingMode: InventoryTrackingMode.SERIALIZED,
          availableSerialCount: 2,
        })}
      />,
    );

    // Sin seriales la confirmación queda bloqueada y la cantidad es 0.
    expect(screen.getByRole('status')).toHaveTextContent('Cantidad: 0.');
    expect(screen.getByRole('button', { name: 'Agregar al borrador' })).toBeDisabled();

    const serialInput = screen.getByPlaceholderText('Buscar serial disponible');
    await user.click(serialInput);
    await user.click(await screen.findByRole('option', { name: /SN-001/ }));
    // Tras agregar, el picker cierra el listado: el operador vuelve a buscar
    // escribiendo (clic sobre el input ya enfocado no reabre el listbox).
    await user.type(serialInput, 'SN');
    await user.click(await screen.findByRole('option', { name: /SN-002/ }));

    expect(screen.getByRole('status')).toHaveTextContent('Cantidad: 2');
    // El copy G1 exacto viaja en la región viva junto al conteo.
    expect(screen.getByRole('status')).toHaveTextContent(SERIAL_QTY_HELP_TEXT);

    await user.click(screen.getByRole('button', { name: 'Agregar al borrador' }));
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          serializedAssetIds: ['asset-1', 'asset-2'],
          requestedQty: '2',
        }),
      );
    });
  });

  it('el multiselector se acota al ítem y la bodega y excluye seriales de otras líneas', async () => {
    const user = userEvent.setup();
    const { inventoryApi } = jest.requireMock('@/lib/api-client') as {
      inventoryApi: { listAssets: jest.Mock };
    };
    render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="create"
        excludedSerializedAssetIds={['asset-9']}
        line={buildLine({
          itemId: 'item-serial',
          productLabel: 'Router Onu Gpon',
          unitOfMeasure: 'UNIT',
          trackingMode: InventoryTrackingMode.SERIALIZED,
          availableSerialCount: 3,
        })}
      />,
    );

    await user.click(screen.getByPlaceholderText('Buscar serial disponible'));
    await waitFor(() => {
      expect(inventoryApi.listAssets).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-serial',
          locationId: 'loc-1',
          status: 'AVAILABLE,AVAILABLE_REFURBISHED',
        }),
        undefined,
      );
    });
  });

  it('Guardar cambios reabre con los valores actuales y confirma sobre la línea', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="edit"
        onConfirm={onConfirm}
        serialLabelsById={{ 'asset-1': 'SN-001' }}
        line={buildLine({
          condition: StockBalanceCondition.REFURBISHED,
          requestedQty: '3',
          serializedAssetId: 'asset-1',
          serializedAssetIds: ['asset-1'],
          trackingMode: InventoryTrackingMode.SERIALIZED,
          availableSerialCount: 4,
        })}
      />,
    );

    // Reabre con los valores actuales de la fila (CA-S2-08).
    expect(screen.getByLabelText('Condición')).toHaveTextContent('Reacondicionado');
    expect(screen.getByText('SN-001')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cantidad: 1');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        condition: StockBalanceCondition.REFURBISHED,
        serializedAssetIds: ['asset-1'],
      }),
    );
  });

  it('Escape no descarta la captura sucia; Cancelar es la salida deliberada', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="create"
        onOpenChange={onOpenChange}
        line={buildLine()}
      />,
    );

    await user.click(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '4');
    await user.keyboard('{Escape}');

    // La guardia bloquea el cierre y lo explica; el panel sigue abierto.
    expect(await screen.findByRole('alert')).toHaveTextContent(/cambios sin guardar/i);
    expect(screen.getByRole('dialog', { name: /Cable drop/ })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('avisa cuando la cantidad supera el disponible en origen y bloquea la confirmación', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="create"
        onConfirm={onConfirm}
        line={buildLine()}
      />,
    );

    const quantityInput = screen.getByLabelText('Cantidad');
    await user.clear(quantityInput);
    await user.type(quantityInput, '99');

    expect(screen.getByText(/Supera el material disponible en origen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar al borrador' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
