import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryTrackingMode, SerializedAssetStatus, StockBalanceCondition } from '@iwana/shared';
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
            currentStatus: SerializedAssetStatus.AVAILABLE,
            currentLocationId: 'loc-1',
          },
          {
            id: 'asset-2',
            tenantId: 'tenant-1',
            inventoryItemId: 'item-serial',
            serialNumber: 'SN-002',
            assetTag: null,
            currentStatus: SerializedAssetStatus.AVAILABLE,
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
    expect(screen.getByLabelText('Cantidad')).toHaveValue('0');
    expect(screen.getByRole('button', { name: 'Agregar al borrador' })).toBeDisabled();

    const serialInput = screen.getByPlaceholderText('Buscar serial disponible');
    await user.click(serialInput);
    await user.click(await screen.findByRole('option', { name: /SN-001/ }));
    // Tras agregar, el picker cierra el listado: el operador vuelve a buscar
    // escribiendo (clic sobre el input ya enfocado no reabre el listbox).
    await user.type(serialInput, 'SN');
    await user.click(await screen.findByRole('option', { name: /SN-002/ }));

    expect(screen.getByLabelText('Cantidad')).toHaveValue('2');
    // El copy G1 exacto viaja en la región viva junto a la cantidad readonly.
    expect(screen.getByRole('status')).toHaveTextContent(SERIAL_QTY_HELP_TEXT);
    expect(screen.getByRole('status')).not.toHaveTextContent('Cantidad:');

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
    // El servidor devuelve el serial excluido: solo `excludeIds` (filtro cliente
    // en `searchPickableSerializedAssets`) puede sacarlo de las opciones.
    inventoryApi.listAssets.mockResolvedValueOnce({
      data: [
        {
          id: 'asset-1',
          tenantId: 'tenant-1',
          inventoryItemId: 'item-serial',
          serialNumber: 'SN-001',
          assetTag: null,
          currentStatus: SerializedAssetStatus.AVAILABLE,
          currentLocationId: 'loc-1',
        },
        {
          id: 'asset-9',
          tenantId: 'tenant-1',
          inventoryItemId: 'item-serial',
          serialNumber: 'SN-009',
          assetTag: null,
          currentStatus: SerializedAssetStatus.AVAILABLE,
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
    });
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
          limit: 100,
          page: 1,
        }),
      );
    });

    // `excludeIds=['asset-9']` lo saca de las opciones aunque el servidor lo
    // devuelva; la presencia de SN-001 prueba que la lista sí cargó.
    expect(await screen.findByRole('option', { name: /SN-001/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /SN-009/ })).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Cantidad')).toHaveValue('1');

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
    // `requestClose` de OperationalSidePeek hace `await` sobre la guardia, así
    // que el aviso se pinta en una microtarea posterior al `keydown`. El default
    // de 1000 ms no alcanza en el runner Linux; la espera va por aserción
    // porque `configure()` a nivel de módulo no sobrevive al reparto de workers
    // de Jest (medido: verde con inline en 536a2bd5, rojo con configure en 3b0f74da).
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      /cambios sin guardar/i,
    );
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

  it('con busy deshabilita los controles del panel y la cantidad (CA-S2.1-FE05)', async () => {
    const user = userEvent.setup();
    render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="create"
        busy
        line={buildLine({
          itemId: 'item-serial',
          productLabel: 'Router Onu Gpon',
          trackingMode: InventoryTrackingMode.SERIALIZED,
          availableSerialCount: 2,
        })}
      />,
    );

    expect(screen.getByPlaceholderText('Buscar serial disponible')).toBeDisabled();
    expect(screen.getByLabelText('Cantidad')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Agregar al borrador' })).toBeDisabled();

    // El escaneo no puede dismissed el panel a mitad del envío.
    await user.keyboard('{Escape}');
    expect(baseProps.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('revertir los cambios limpia la guardia: Escape cierra sin aviso (sucio por comparación)', async () => {
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

    const quantityInput = screen.getByLabelText('Cantidad');
    await user.clear(quantityInput);
    await user.type(quantityInput, '4');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/cambios sin guardar/i);

    await user.clear(quantityInput);
    await user.type(quantityInput, '1');
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('la guardia nombra ambos botones del pie (copy C5 con PROD-UX)', async () => {
    const user = userEvent.setup();
    render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="edit"
        onOpenChange={jest.fn()}
        line={buildLine()}
      />,
    );

    await user.click(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '4');
    await user.keyboard('{Escape}');

    // Misma cadena async que el caso anterior.
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('Agregar al borrador');
    expect(alert).toHaveTextContent('Guardar cambios');
    expect(alert).toHaveTextContent('Cancelar');
  });

  it('el re-etiquetado tardío actualiza el rótulo sin perder la captura (CA-S2.1-FE03)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="edit"
        serialLabelsById={{}}
        onConfirm={jest.fn()}
        line={buildLine({
          condition: StockBalanceCondition.REFURBISHED,
          serializedAssetIds: ['asset-1'],
          trackingMode: InventoryTrackingMode.SERIALIZED,
          availableSerialCount: 4,
        })}
      />,
    );

    expect(screen.getByText('ASSET-1')).toBeInTheDocument();

    // El operador cambia la condición mientras llega la etiqueta real.
    await user.click(await screen.findByRole('combobox', { name: 'Condición' }));
    // El desplegable del Select monta sus opciones en un tick posterior al click.
    await user.click(await screen.findByRole('option', { name: /Nuevo/ }, { timeout: 5000 }));

    rerender(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="edit"
        serialLabelsById={{ 'asset-1': 'SN-001' }}
        onConfirm={jest.fn()}
        line={buildLine({
          condition: StockBalanceCondition.REFURBISHED,
          serializedAssetIds: ['asset-1'],
          trackingMode: InventoryTrackingMode.SERIALIZED,
          availableSerialCount: 4,
        })}
      />,
    );

    // El rótulo tardío llega sin reconstruir la condición elegida.
    expect(screen.getByText('SN-001')).toBeInTheDocument();
    expect(screen.getByLabelText('Condición')).toHaveTextContent('Nuevo');
  });

  it('con lotes sin elegir muestra la pista explícita en vez del aviso de exceso (CA-S2.1-FE04)', () => {
    render(
      <StockIssueLineSidePeek
        {...baseProps}
        mode="create"
        line={buildLine({
          requestedQty: '2',
          lots: [
            {
              lotId: 'lote-a',
              lotNumber: 'LOTE-A',
              expiryDate: null,
              condition: StockBalanceCondition.NEW,
              available: '30',
            },
            {
              lotId: 'lote-b',
              lotNumber: 'LOTE-B',
              expiryDate: null,
              condition: StockBalanceCondition.NEW,
              available: '20',
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText('Elige un lote para ver el disponible de la línea.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Supera el material disponible/)).not.toBeInTheDocument();
  });
});
