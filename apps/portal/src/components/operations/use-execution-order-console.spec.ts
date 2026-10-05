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
      uploadEvidenceAsset: jest.fn(),
      getEvidenceAsset: jest.fn(),
      registerEvidence: jest.fn(),
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
    const expiresAt = '2026-10-06T12:00:00.000Z';
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
    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(order);
    jest.mocked(tasksApi.executionOrders.uploadEvidenceAsset).mockResolvedValue({
      intentId: 'intent-002',
      mediaAssetId: 'asset-002',
      status: 'PENDING_ANALYSIS',
      expiresAt: '2026-10-06T12:00:00.000Z',
    });
    jest.mocked(tasksApi.executionOrders.getEvidenceAsset).mockResolvedValue({
      intentId: 'intent-002',
      mediaAssetId: 'asset-002',
      status,
      expiresAt: '2026-10-06T12:00:00.000Z',
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
    jest
      .mocked(tasksApi.executionOrders.get)
      .mockResolvedValue({ id: 'eo-evidence-003', version: 4 } as never);
    jest.mocked(tasksApi.executionOrders.uploadEvidenceAsset).mockResolvedValue({
      intentId: 'intent-003',
      mediaAssetId: 'asset-003',
      status: 'PENDING_ANALYSIS',
      expiresAt: '2026-10-06T12:00:00.000Z',
    });
    jest.mocked(tasksApi.executionOrders.getEvidenceAsset).mockResolvedValue({
      intentId: 'intent-003',
      mediaAssetId: 'asset-003',
      status: 'PENDING_ANALYSIS',
      expiresAt: '2026-10-06T12:00:00.000Z',
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
});
