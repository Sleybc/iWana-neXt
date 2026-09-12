import { fireEvent, render, screen } from '@testing-library/react';
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
    },
  };
});

function buildLine(overrides: Partial<StockIssueDraftLine> = {}): StockIssueDraftLine {
  return {
    id: 'line-1',
    itemId: 'item-1',
    sku: 'CAB-010',
    productLabel: 'Cable drop',
    requestedQty: '2',
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
  selectedLineIds: [] as string[],
  serialLabelsById: {} as Record<string, string>,
  onItemChange: jest.fn(),
  onQuantityChange: jest.fn(),
  onModifyLine: jest.fn(),
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

  it('CA-S2-09: no hay columna Condición editable; la condición se lee en el detalle', () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        lines={[buildLine({ condition: StockBalanceCondition.REFURBISHED })]}
      />,
    );

    // La condición es dato (badge tonal), no control; no queda ningún Select.
    expect(screen.getByText('Reacondicionado')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Condición/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'Condición' })).not.toBeInTheDocument();
  });

  it('el detalle muestra lote como dato y la unidad usa la etiqueta ADR-085', () => {
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

    expect(screen.getByText(/Lote LOTE-A/)).toBeInTheDocument();
    expect(screen.getByText('Metro')).toBeInTheDocument();
  });

  it('la línea serializada configurada muestra su serial y la cantidad fija', () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        serialLabelsById={{ 'asset-1': 'SN-001' }}
        lines={[
          buildLine({
            id: 'line-serial',
            itemId: 'item-serial',
            sku: 'SER-9',
            productLabel: 'Router Onu Gpon',
            unitOfMeasure: 'UNIT',
            trackingMode: InventoryTrackingMode.SERIALIZED,
            serializedAssetId: 'asset-1',
            serializedAssetIds: ['asset-1'],
            requestedQty: '1',
            availableSerialCount: 3,
          }),
        ]}
      />,
    );

    expect(screen.getByText('SN-001')).toBeInTheDocument();
    // La cantidad del serializado es dato, no entrada.
    expect(screen.queryByLabelText(/Cantidad Router Onu Gpon/)).not.toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('la vía rápida sin seriales deja el badge de falta configurar (mitigación G1)', () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        lines={[
          buildLine({
            id: 'line-serial',
            itemId: 'item-serial',
            sku: 'SER-9',
            productLabel: 'Router Onu Gpon',
            unitOfMeasure: 'UNIT',
            trackingMode: InventoryTrackingMode.SERIALIZED,
            availableSerialCount: 2,
          }),
        ]}
      />,
    );

    expect(screen.getByText('Falta configurar seriales')).toBeInTheDocument();
  });

  it('varios seriales se muestran como badge de conteo con lista truncada y total accesible', () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        serialLabelsById={{ 'asset-1': 'SN-001', 'asset-2': 'SN-002' }}
        lines={[
          buildLine({
            id: 'line-serial',
            itemId: 'item-serial',
            productLabel: 'Router Onu Gpon',
            unitOfMeasure: 'UNIT',
            trackingMode: InventoryTrackingMode.SERIALIZED,
            serializedAssetId: 'asset-1',
            serializedAssetIds: ['asset-1', 'asset-2'],
            requestedQty: '2',
            availableSerialCount: 5,
          }),
        ]}
      />,
    );

    // Badge solo conteo; la lista visible se trunca con `title` y el total va en el aria-label.
    expect(screen.getByText('2 seriales')).toBeInTheDocument();
    expect(screen.getByLabelText('2 seriales: SN-001, SN-002')).toBeInTheDocument();
  });

  it('con más de dos seriales la lista visible se trunca con el total en el título', () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        serialLabelsById={{ 'asset-1': 'SN-001', 'asset-2': 'SN-002', 'asset-3': 'SN-003' }}
        lines={[
          buildLine({
            id: 'line-serial',
            trackingMode: InventoryTrackingMode.SERIALIZED,
            serializedAssetIds: ['asset-1', 'asset-2', 'asset-3'],
            requestedQty: '3',
            availableSerialCount: 5,
          }),
        ]}
      />,
    );

    expect(screen.getByText('3 seriales')).toBeInTheDocument();
    expect(screen.getByText('SN-001, SN-002, +1 más')).toBeInTheDocument();
    expect(screen.getByLabelText('3 seriales: SN-001, SN-002, SN-003')).toHaveAttribute(
      'title',
      'SN-001, SN-002, SN-003',
    );
  });

  it('con busy deshabilita cantidad, Modificar y Quitar (CA-S2.1-FE05)', () => {
    render(<StockIssueDraftLinesTable {...baseProps} busy lines={[buildLine()]} />);

    expect(screen.getByLabelText('Cantidad Cable drop')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modificar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quitar' })).toBeDisabled();
  });

  it('cada fila tiene Modificar y Quitar visibles con sus callbacks', async () => {
    const user = userEvent.setup();
    const onModifyLine = jest.fn();
    const onRemove = jest.fn();
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        onModifyLine={onModifyLine}
        onRemove={onRemove}
        lines={[buildLine()]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Modificar' }));
    expect(onModifyLine).toHaveBeenCalledWith('line-1');

    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(onRemove).toHaveBeenCalledWith('line-1');
  });

  it('Modificar queda inoperante solo mientras la línea manual no tenga producto', () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        lines={[buildLine({ id: 'line-manual', isManual: true, itemId: '', productLabel: '' })]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Modificar' })).toBeDisabled();
  });

  it('el error de envío se pinta inline en la fila con role alert', () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        lines={[buildLine()]}
        lineErrors={{
          'line-1': {
            message: 'Selecciona los seriales de Cable drop.',
            controlId: 'issue-draft-modify-line-1',
          },
        }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona los seriales de Cable drop.');
  });

  it('la cantidad del consumible sigue siendo editable en la fila', () => {
    const onQuantityChange = jest.fn();
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        onQuantityChange={onQuantityChange}
        lines={[buildLine()]}
      />,
    );

    // La línea es controlada por el borrador: un cambio del operador notifica
    // el valor completo tecleado.
    fireEvent.change(screen.getByLabelText('Cantidad Cable drop'), {
      target: { value: '5' },
    });
    expect(onQuantityChange).toHaveBeenCalledWith('line-1', '5');
  });

  it('la edición de cantidad es por tipeo: sin botones de incremento en la fila', () => {
    render(<StockIssueDraftLinesTable {...baseProps} lines={[buildLine()]} />);

    expect(screen.queryByLabelText('Más unidades de Cable drop')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Menos unidades de Cable drop')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad Cable drop')).toBeEnabled();
  });

  it('el input de cantidad respeta el estado busy', () => {
    render(<StockIssueDraftLinesTable {...baseProps} busy lines={[buildLine()]} />);

    expect(screen.getByLabelText('Cantidad Cable drop')).toBeDisabled();
  });

  it('la línea serializada muestra la cantidad como texto: la fija el grupo de seriales', () => {
    render(
      <StockIssueDraftLinesTable
        {...baseProps}
        lines={[
          buildLine({
            productLabel: 'Router Onu Gpon',
            unitOfMeasure: 'UNIT',
            trackingMode: InventoryTrackingMode.SERIALIZED,
            serializedAssetId: 'asset-1',
            serializedAssetIds: ['asset-1'],
            requestedQty: '1',
            availableSerialCount: 3,
          }),
        ]}
      />,
    );

    expect(screen.queryByLabelText('Cantidad Router Onu Gpon')).not.toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
