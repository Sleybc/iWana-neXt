import { act, renderHook } from '@testing-library/react';
import { InventoryTrackingMode, StockBalanceCondition } from '@iwana/shared';
import { useStockIssueLineForm } from './useStockIssueLineForm';
import type { StockIssueDraftLine } from './stock-issue-draft';

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

describe('useStockIssueLineForm (S2.1 C1)', () => {
  it('nace limpio y marca sucio por comparación, no por pestillo', () => {
    const { result } = renderHook(() => useStockIssueLineForm(buildLine(), {}));

    expect(result.current.dirty).toBe(false);

    act(() => {
      result.current.setRequestedQty('4');
    });
    expect(result.current.dirty).toBe(true);

    // Revertir deja el formulario limpio: no hay pestillo que quede armado.
    act(() => {
      result.current.setRequestedQty('1');
    });
    expect(result.current.dirty).toBe(false);
  });

  it('en serializados la cantidad efectiva es el tamaño del grupo', () => {
    const { result } = renderHook(() =>
      useStockIssueLineForm(
        buildLine({
          trackingMode: InventoryTrackingMode.SERIALIZED,
          serializedAssetIds: ['asset-1', 'asset-2'],
          availableSerialCount: 4,
        }),
        { 'asset-1': 'SN-001', 'asset-2': 'SN-002' },
      ),
    );

    expect(result.current.serialized).toBe(true);
    expect(result.current.effectiveQty).toBe('2');
    expect(result.current.dirty).toBe(false);

    act(() => {
      result.current.setSerials([{ id: 'asset-1', label: 'SN-001' }]);
    });
    expect(result.current.effectiveQty).toBe('1');
    expect(result.current.dirty).toBe(true);
  });

  it('el cambio de línea reinicia la captura con su snapshot', () => {
    const { result, rerender } = renderHook(({ line }) => useStockIssueLineForm(line, {}), {
      initialProps: { line: buildLine({ id: 'line-1', requestedQty: '1' }) },
    });

    act(() => {
      result.current.setRequestedQty('9');
    });
    expect(result.current.dirty).toBe(true);

    rerender({ line: buildLine({ id: 'line-2', requestedQty: '3' }) });

    expect(result.current.requestedQty).toBe('3');
    expect(result.current.dirty).toBe(false);
  });

  it('el re-etiquetado tardío actualiza el rótulo sin reconstruir la captura (CA-S2.1-FE03)', () => {
    const { result, rerender } = renderHook(
      ({ labels }) =>
        useStockIssueLineForm(
          buildLine({
            trackingMode: InventoryTrackingMode.SERIALIZED,
            serializedAssetIds: ['asset-1'],
            availableSerialCount: 2,
          }),
          labels,
        ),
      { initialProps: { labels: {} as Record<string, string> } },
    );

    // Sin etiqueta resuelta, el rótulo corto del id.
    expect(result.current.serials).toEqual([{ id: 'asset-1', label: 'ASSET-1' }]);

    act(() => {
      result.current.setSerials([
        { id: 'asset-1', label: 'ASSET-1' },
        { id: 'asset-2', label: 'ASSET-2' },
      ]);
    });

    rerender({ labels: { 'asset-1': 'SN-001', 'asset-2': 'SN-002' } });

    // La selección y el orden se conservan; solo cambia el rótulo por id.
    expect(result.current.serials).toEqual([
      { id: 'asset-1', label: 'SN-001' },
      { id: 'asset-2', label: 'SN-002' },
    ]);
    expect(result.current.dirty).toBe(true);
  });

  it('la guardia de cierre nombra ambos botones del pie (copy C5)', () => {
    const { result } = renderHook(() => useStockIssueLineForm(buildLine(), {}));

    expect(result.current.handleBeforeClose()).toBe(true);
    expect(result.current.closeNotice).toBe('');

    act(() => {
      result.current.setRequestedQty('4');
    });

    let blocked = true;
    act(() => {
      blocked = result.current.handleBeforeClose();
    });
    expect(blocked).toBe(false);
    expect(result.current.closeNotice).toContain('Agregar al borrador');
    expect(result.current.closeNotice).toContain('Guardar cambios');
    expect(result.current.closeNotice).toContain('Cancelar');
  });
});
