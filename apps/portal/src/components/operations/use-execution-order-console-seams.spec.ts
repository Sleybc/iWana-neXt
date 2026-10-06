import { act, renderHook } from '@testing-library/react';
import { tasksApi, inventoryApi, type ExecutionOrderDetailResponse } from '@/lib/api-client';
import { useExecutionOrderConsoleAdapter } from './use-execution-order-console-adapter';
import { useExecutionOrderCustody } from './use-execution-order-custody';
import { useExecutionOrderEvidence } from './use-execution-order-evidence';
import { useExecutionOrderRefresh } from './use-execution-order-refresh';

jest.mock('./use-execution-order-custody');
jest.mock('./use-execution-order-evidence');
jest.mock('./use-execution-order-refresh');
jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  inventoryApi: { getExecutorCustody: jest.fn(), listItems: jest.fn(), listLocations: jest.fn() },
  tasksApi: {
    executionOrders: {
      get: jest.fn(),
      listActivities: jest.fn(),
      listItemUsage: jest.fn(),
      listEvidence: jest.fn(),
    },
  },
}));

const detail = {
  id: 'seam-order',
  version: 4,
  status: 'IN_PROGRESS',
  syncState: 'IN_SYNC',
  completion: { progress: 0 },
  allowedActions: ['REGISTER_EVIDENCE', 'REGISTER_ITEM_USAGE'],
  template: {
    key: 'snapshot',
    version: 1,
    label: 'Trabajo',
    requirements: [
      { key: 'signature', kind: 'EVIDENCE', required: true, evidenceType: 'SIGNATURE' },
    ],
  },
} as ExecutionOrderDetailResponse;
const applyCustody = jest.fn();
const slot = {
  loadOnOpen: jest.fn(),
  markUnavailable: jest.fn(),
  reset: jest.fn(),
  openAction: jest.fn(),
  loadMore: jest.fn(),
};
describe('B0 contratos de integración de slots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    slot.loadOnOpen.mockResolvedValue(applyCustody);
    slot.loadMore.mockResolvedValue(undefined);
    jest.mocked(useExecutionOrderCustody).mockReturnValue(slot);
    jest.mocked(useExecutionOrderEvidence).mockReturnValue(jest.fn());
    jest.mocked(useExecutionOrderRefresh).mockReturnValue(jest.fn());
    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(detail);
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue([]);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue([]);
    jest.mocked(tasksApi.executionOrders.listEvidence).mockResolvedValue([]);
  });
  async function mountDetail() {
    const result = renderHook(() => useExecutionOrderConsoleAdapter());
    await act(async () => result.result.current.openExecutionOrder(detail.id));
    return result;
  }
  it('R2 recibe snapshot congelado con evidenceType y callbacks de análisis', async () => {
    await mountDetail();
    const context = jest.mocked(useExecutionOrderEvidence).mock.calls.at(-1)![0];
    expect(context.selectedExecutionOrder?.template?.requirements?.[0]).toMatchObject({
      key: 'signature',
      evidenceType: 'SIGNATURE',
    });
    expect(context.setIsAnalyzingEvidence).toEqual(expect.any(Function));
    expect(context.refreshExecutionOrder).toEqual(expect.any(Function));
  });
  it('R3 sustituye la política de custodia sin tocar el adaptador: carga, apertura, paginación y cierre', async () => {
    const result = await mountDetail();
    // El adaptador no conoce la política: no consulta inventario ni custodia por su cuenta.
    expect(inventoryApi.getExecutorCustody).not.toHaveBeenCalled();
    expect(inventoryApi.listItems).not.toHaveBeenCalled();
    expect(slot.loadOnOpen).toHaveBeenCalledTimes(1);
    expect(slot.loadOnOpen.mock.calls[0]![0]).toEqual(expect.any(Promise));
    expect(applyCustody).toHaveBeenCalledTimes(1);
    expect(slot.markUnavailable).not.toHaveBeenCalled();
    const action = {
      kind: 'consumption',
      requirementKey: 'material',
      itemCategory: 'CPE',
      action: 'REGISTER_ITEM_USAGE',
    } as const;
    act(() => result.result.current.openRequirementAction(action));
    expect(slot.openAction).toHaveBeenCalledWith(action);
    await act(async () => result.result.current.loadMoreExecutorCustody());
    expect(slot.loadMore).toHaveBeenCalledTimes(1);
    act(() => result.result.current.closeExecutionOrder());
    expect(slot.reset).toHaveBeenCalledTimes(1);
    const context = jest.mocked(useExecutionOrderCustody).mock.calls.at(-1)![0];
    expect(context.selectedExecutionOrder).toBeNull();
    expect(context.setError).toEqual(expect.any(Function));
    expect(context.setLoadingMore).toEqual(expect.any(Function));
    expect(context.assetsMeta).toBeDefined();
    expect(context.requestSequence.current).toBeGreaterThan(0);
  });
  it('R3 no recibe aplicación del resultado si el detalle no llegó: se marca no disponible', async () => {
    jest.mocked(tasksApi.executionOrders.get).mockRejectedValue(new Error('sin detalle'));
    const result = renderHook(() => useExecutionOrderConsoleAdapter());
    await act(async () => result.result.current.openExecutionOrder('seam-fail'));
    expect(applyCustody).not.toHaveBeenCalled();
    expect(slot.markUnavailable).toHaveBeenCalled();
  });
  it('R3 no aplica un resultado tardío de una apertura anterior', async () => {
    let resolveFirst!: (value: ExecutionOrderDetailResponse) => void;
    jest
      .mocked(tasksApi.executionOrders.get)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ ...detail, id: 'seam-second' } as ExecutionOrderDetailResponse);
    const result = renderHook(() => useExecutionOrderConsoleAdapter());
    let first!: Promise<void>;
    act(() => {
      first = result.result.current.openExecutionOrder('seam-first');
    });
    await act(async () => result.result.current.openExecutionOrder('seam-second'));
    expect(applyCustody).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFirst(detail);
      await first;
    });
    expect(applyCustody).toHaveBeenCalledTimes(1);
    expect(result.result.current.selectedExecutionOrder?.id).toBe('seam-second');
  });
  it('R4 recibe setters por recurso, señal de material abierto y refresco de custodia', async () => {
    const result = await mountDetail();
    const action = {
      kind: 'consumption',
      requirementKey: 'material',
      itemCategory: 'CPE',
      action: 'REGISTER_ITEM_USAGE',
    } as const;
    act(() => result.result.current.openRequirementAction(action));
    const context = jest.mocked(useExecutionOrderRefresh).mock.calls.at(-1)![0];
    expect(context.activeConsumptionRequirement.current).toEqual(action);
    act(() => {
      context.setLoadingDetail(true);
      context.setLoadingEvidence(true);
      context.setSuccess('Actualizado');
      context.refreshOpenCustody();
    });
    expect(result.result.current.isLoadingExecutionOrder).toBe(true);
    expect(result.result.current.isLoadingMoreExecutionOrderEvidence).toBe(true);
    expect(result.result.current.executionOrderSuccess).toBe('Actualizado');
    expect(slot.openAction).toHaveBeenLastCalledWith(action);
    act(() => result.result.current.openRequirementAction(null));
    expect(context.activeConsumptionRequirement.current).toBeNull();
  });
});
