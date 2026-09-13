// apps/portal/src/components/operations/use-execution-order-console.spec.ts
// PROD-UX #3 (OLA 4.1): el reintento del drawer debe reutilizar el último
// identificador intentado cuando el detalle no llegó a cargar
// (`selectedExecutionOrder` null): antes el botón quedaba inerte porque el
// único origen del id era la OT seleccionada.
import { act, renderHook } from '@testing-library/react';
import { useExecutionOrderConsole } from './use-execution-order-console';
import { ApiError, inventoryApi, tasksApi } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  inventoryApi: {
    listItems: jest.fn().mockResolvedValue({ data: [] }),
    listLocations: jest.fn().mockResolvedValue({ data: [] }),
    getExecutorCustody: jest.fn(),
  },
  tasksApi: {
    executionOrders: {
      get: jest.fn(),
      listActivities: jest.fn().mockResolvedValue([]),
      listItemUsage: jest.fn().mockResolvedValue([]),
      listEvidence: jest.fn().mockResolvedValue([]),
    },
  },
}));

describe('useExecutionOrderConsole — reintento de apertura (OLA 4.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue([]);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue([]);
    jest.mocked(tasksApi.executionOrders.listEvidence).mockResolvedValue([]);
    jest.mocked(inventoryApi.listItems).mockResolvedValue({ data: [] } as never);
    jest.mocked(inventoryApi.listLocations).mockResolvedValue({ data: [] } as never);
  });

  it('retryExecutionOrder reutiliza el id intentado cuando el detalle no cargó', async () => {
    jest
      .mocked(tasksApi.executionOrders.get)
      .mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No disponible'));
    const { result } = renderHook(() => useExecutionOrderConsole());

    await act(async () => {
      await result.current.openExecutionOrder('eo-retry-001');
    });

    expect(result.current.selectedExecutionOrder).toBeNull();
    expect(result.current.executionOrderError).not.toBeNull();
    expect(tasksApi.executionOrders.get).toHaveBeenCalledWith('eo-retry-001');

    await act(async () => {
      await result.current.retryExecutionOrder();
    });

    expect(tasksApi.executionOrders.get).toHaveBeenCalledTimes(2);
    expect(tasksApi.executionOrders.get).toHaveBeenLastCalledWith('eo-retry-001');
  });
});
