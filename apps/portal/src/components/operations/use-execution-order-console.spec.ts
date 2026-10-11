// apps/portal/src/components/operations/use-execution-order-console.spec.ts
// PROD-UX #3 (OLA 4.1): el reintento del drawer debe reutilizar el último
// identificador intentado cuando el detalle no llegó a cargar
// (`selectedExecutionOrder` null): antes el botón quedaba inerte porque el
// único origen del id era la OT seleccionada.
import { act, renderHook } from '@testing-library/react';
import { ExecutionOrderItemAction, InventoryDisposition } from '@iwana/shared';
import { useExecutionOrderConsole } from './use-execution-order-console';
import { ApiError, inventoryApi, tasksApi } from '@/lib/api-client';

function futureEvidenceExpiry(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

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
      uploadEvidenceAsset: jest.fn(),
      getEvidenceAsset: jest.fn(),
      registerEvidence: jest.fn(),
      registerItemUsage: jest.fn(),
    },
  },
}));

describe('useExecutionOrderConsole — reintento de apertura (OLA 4.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue([]);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue([]);
    jest.mocked(tasksApi.executionOrders.listEvidence).mockResolvedValue([]);
    jest.mocked(tasksApi.executionOrders.uploadEvidenceAsset).mockReset();
    jest.mocked(tasksApi.executionOrders.getEvidenceAsset).mockReset();
    jest.mocked(tasksApi.executionOrders.registerEvidence).mockReset();
    jest.mocked(tasksApi.executionOrders.registerItemUsage).mockReset();
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

  it('espera a que el archivo quede disponible antes de registrar la evidencia', async () => {
    const expiresAt = futureEvidenceExpiry();
    const getEvidenceAsset = jest.mocked(tasksApi.executionOrders.getEvidenceAsset);
    const registerEvidenceOrder = tasksApi.executionOrders.registerEvidence;
    const order = { id: 'eo-evidence-001', version: 7 } as never;

    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(order);
    jest.mocked(tasksApi.executionOrders.uploadEvidenceAsset).mockResolvedValue({
      intentId: 'intent-001',
      mediaAssetId: 'asset-001',
      status: 'PENDING_ANALYSIS',
      expiresAt,
    });
    getEvidenceAsset
      .mockResolvedValueOnce({
        intentId: 'intent-001',
        mediaAssetId: 'asset-001',
        status: 'PENDING_ANALYSIS',
        expiresAt,
      })
      .mockResolvedValueOnce({
        intentId: 'intent-001',
        mediaAssetId: 'asset-001',
        status: 'AVAILABLE',
        expiresAt,
      });
    jest.mocked(registerEvidenceOrder).mockResolvedValue({} as never);

    const { result } = renderHook(() => useExecutionOrderConsole());
    await act(async () => {
      await result.current.openExecutionOrder('eo-evidence-001');
    });

    await act(async () => {
      await result.current.handleUploadEvidence(
        { name: 'evidencia.pdf', type: 'application/pdf' } as File,
        'installation-proof',
      );
    });

    expect(getEvidenceAsset).toHaveBeenCalledWith('eo-evidence-001', 'asset-001');
    const firstStatusReadOrder =
      getEvidenceAsset.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    const firstRegistrationOrder =
      jest.mocked(registerEvidenceOrder).mock.invocationCallOrder[0] ?? 0;
    expect(firstStatusReadOrder).toBeLessThan(firstRegistrationOrder);
    expect(registerEvidenceOrder).toHaveBeenCalledWith(
      'eo-evidence-001',
      expect.objectContaining({ mediaAssetId: 'asset-001', expiresAt }),
      7,
    );
  });

  it.each([
    [
      'REJECTED',
      'El archivo no superó la revisión y no se registró. Selecciona otro archivo para continuar.',
    ],
    [
      'EXPIRED',
      'El archivo venció antes de completar la revisión y no se registró. Vuelve a seleccionarlo para adjuntarlo.',
    ],
  ] as const)('muestra un error si el análisis termina en %s', async (status, message) => {
    const order = { id: 'eo-evidence-002', version: 3 } as never;
    const expiresAt = futureEvidenceExpiry();
    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(order);
    jest.mocked(tasksApi.executionOrders.uploadEvidenceAsset).mockResolvedValue({
      intentId: 'intent-002',
      mediaAssetId: 'asset-002',
      status: 'PENDING_ANALYSIS',
      expiresAt,
    });
    jest.mocked(tasksApi.executionOrders.getEvidenceAsset).mockResolvedValue({
      intentId: 'intent-002',
      mediaAssetId: 'asset-002',
      status,
      expiresAt,
    });

    const { result } = renderHook(() => useExecutionOrderConsole());
    await act(async () => {
      await result.current.openExecutionOrder('eo-evidence-002');
    });

    let uploadResult: boolean | undefined;
    await act(async () => {
      uploadResult = await result.current.handleUploadEvidence(
        { name: 'evidencia.pdf', type: 'application/pdf' } as File,
        'installation-proof',
      );
    });

    expect(uploadResult).toBe(false);
    expect(result.current.executionOrderError).toBe(message);
    expect(tasksApi.executionOrders.registerEvidence).not.toHaveBeenCalled();
  });

  it('limita a seis consultas y deja la evidencia sin registrar si sigue en análisis', async () => {
    const expiresAt = futureEvidenceExpiry();
    jest
      .mocked(tasksApi.executionOrders.get)
      .mockResolvedValue({ id: 'eo-evidence-003', version: 4 } as never);
    jest.mocked(tasksApi.executionOrders.uploadEvidenceAsset).mockResolvedValue({
      intentId: 'intent-003',
      mediaAssetId: 'asset-003',
      status: 'PENDING_ANALYSIS',
      expiresAt,
    });
    jest.mocked(tasksApi.executionOrders.getEvidenceAsset).mockResolvedValue({
      intentId: 'intent-003',
      mediaAssetId: 'asset-003',
      status: 'PENDING_ANALYSIS',
      expiresAt,
    });

    const { result } = renderHook(() => useExecutionOrderConsole());
    await act(async () => {
      await result.current.openExecutionOrder('eo-evidence-003');
    });

    let uploadResult: boolean | undefined;
    await act(async () => {
      uploadResult = await result.current.handleUploadEvidence(
        { name: 'evidencia.pdf', type: 'application/pdf' } as File,
        'installation-proof',
      );
    });

    expect(uploadResult).toBe(false);
    expect(tasksApi.executionOrders.getEvidenceAsset).toHaveBeenCalledTimes(6);
    expect(tasksApi.executionOrders.registerEvidence).not.toHaveBeenCalled();
    expect(result.current.executionOrderError).toContain('sigue en revisión');
  });

  it('registra las filas en serie con la versión leída antes de cada POST', async () => {
    const executionOrderId = 'eo-batch-001';
    const getExecutionOrder = jest.mocked(tasksApi.executionOrders.get);
    getExecutionOrder
      .mockResolvedValueOnce({ id: executionOrderId, version: 3 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 8 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 9 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 10 } as never);
    const registerItemUsage = jest.mocked(tasksApi.executionOrders.registerItemUsage);
    registerItemUsage.mockResolvedValue({} as never);
    const { result } = renderHook(() => useExecutionOrderConsole());

    await act(async () => {
      await result.current.openExecutionOrder(executionOrderId);
    });
    await act(async () => {
      await result.current.handleRegisterExecutionOrderItemUsageBatch([
        {
          key: 'item:drop',
          idempotencyKey: 'row-key-drop',
          payload: {
            itemId: 'drop',
            requirementKey: 'materials',
            technicianCustodyId: 'tech-1',
            quantity: 2,
            action: ExecutionOrderItemAction.INSTALL,
            finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          },
        },
        {
          key: 'item:patchcord',
          idempotencyKey: 'row-key-patchcord',
          payload: {
            itemId: 'patchcord',
            requirementKey: 'materials',
            technicianCustodyId: 'tech-1',
            quantity: 1,
            action: ExecutionOrderItemAction.INSTALL,
            finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          },
        },
      ]);
    });

    expect(registerItemUsage).toHaveBeenNthCalledWith(
      1,
      executionOrderId,
      expect.objectContaining({ itemId: 'drop' }),
      8,
      undefined,
      'row-key-drop',
    );
    expect(registerItemUsage).toHaveBeenNthCalledWith(
      2,
      executionOrderId,
      expect.objectContaining({ itemId: 'patchcord' }),
      9,
      undefined,
      'row-key-patchcord',
    );
    expect(getExecutionOrder.mock.invocationCallOrder[2]).toBeLessThan(
      registerItemUsage.mock.invocationCallOrder[1]!,
    );
    expect(registerItemUsage.mock.invocationCallOrder[0]).toBeLessThan(
      getExecutionOrder.mock.invocationCallOrder[2]!,
    );
  });

  it('refresca tras 412 y reintenta una sola vez con la misma clave de la fila', async () => {
    const executionOrderId = 'eo-batch-412';
    jest
      .mocked(tasksApi.executionOrders.get)
      .mockResolvedValueOnce({ id: executionOrderId, version: 3 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 8 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 9 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 10 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 11 } as never);
    const registerItemUsage = jest.mocked(tasksApi.executionOrders.registerItemUsage);
    registerItemUsage
      .mockRejectedValueOnce(new ApiError(412, 'VERSION_CONFLICT', 'Versión desactualizada'))
      .mockResolvedValueOnce({} as never);
    const { result } = renderHook(() => useExecutionOrderConsole());

    await act(async () => {
      await result.current.openExecutionOrder(executionOrderId);
    });
    let outcomes: Awaited<
      ReturnType<typeof result.current.handleRegisterExecutionOrderItemUsageBatch>
    > = [];
    await act(async () => {
      outcomes = await result.current.handleRegisterExecutionOrderItemUsageBatch([
        {
          key: 'item:drop',
          idempotencyKey: 'stable-row-key',
          payload: {
            itemId: 'drop',
            requirementKey: 'materials',
            technicianCustodyId: 'tech-1',
            quantity: 2,
            action: ExecutionOrderItemAction.INSTALL,
            finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          },
        },
      ]);
    });

    expect(outcomes).toEqual([{ key: 'item:drop', status: 'success' }]);
    expect(registerItemUsage).toHaveBeenCalledTimes(2);
    expect(registerItemUsage).toHaveBeenNthCalledWith(
      1,
      executionOrderId,
      expect.any(Object),
      8,
      undefined,
      'stable-row-key',
    );
    expect(registerItemUsage).toHaveBeenNthCalledWith(
      2,
      executionOrderId,
      expect.any(Object),
      10,
      undefined,
      'stable-row-key',
    );
  });

  it('detiene la fila tras un segundo 412 sin crear un tercer POST', async () => {
    const executionOrderId = 'eo-batch-double-412';
    jest
      .mocked(tasksApi.executionOrders.get)
      .mockResolvedValueOnce({ id: executionOrderId, version: 3 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 8 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 9 } as never)
      .mockResolvedValueOnce({ id: executionOrderId, version: 10 } as never);
    const registerItemUsage = jest.mocked(tasksApi.executionOrders.registerItemUsage);
    registerItemUsage
      .mockRejectedValueOnce(new ApiError(412, 'VERSION_CONFLICT', 'Versión desactualizada'))
      .mockRejectedValueOnce(new ApiError(412, 'VERSION_CONFLICT', 'Versión desactualizada'));
    const { result } = renderHook(() => useExecutionOrderConsole());

    await act(async () => {
      await result.current.openExecutionOrder(executionOrderId);
    });
    let outcomes: Awaited<
      ReturnType<typeof result.current.handleRegisterExecutionOrderItemUsageBatch>
    > = [];
    await act(async () => {
      outcomes = await result.current.handleRegisterExecutionOrderItemUsageBatch([
        {
          key: 'item:drop',
          idempotencyKey: 'stable-row-key',
          payload: {
            itemId: 'drop',
            requirementKey: 'materials',
            technicianCustodyId: 'tech-1',
            quantity: 2,
            action: ExecutionOrderItemAction.INSTALL,
            finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          },
        },
      ]);
    });

    expect(outcomes).toEqual([expect.objectContaining({ key: 'item:drop', status: 'error' })]);
    expect(registerItemUsage).toHaveBeenCalledTimes(2);
    expect(registerItemUsage).toHaveBeenNthCalledWith(
      2,
      executionOrderId,
      expect.any(Object),
      10,
      undefined,
      'stable-row-key',
    );
  });
});
