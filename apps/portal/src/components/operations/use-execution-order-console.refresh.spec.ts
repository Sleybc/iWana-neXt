// apps/portal/src/components/operations/use-execution-order-console.refresh.spec.ts
// R4 (Ola 2b, CA-12): la consola completa (fachada + adaptador + política de
// refresco real) refresca selectivamente tras cada mutación. La custodia se
// sustituye por un doble porque su política es de R3; aquí solo importa cuándo
// la pide el refresco. Cada caso cuenta las lecturas que dispara la mutación.
import { act, renderHook } from '@testing-library/react';
import { inventoryApi, tasksApi, type ExecutionOrderDetailResponse } from '@/lib/api-client';
import { emptyPageListMeta } from '@/lib/list-meta';
import type { RequirementActionDescriptor } from './execution-order-actions';
import { useExecutionOrderConsole } from './use-execution-order-console';
import { useExecutionOrderCustody } from './use-execution-order-custody';

jest.mock('./use-execution-order-custody');
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
  inventoryApi: { getExecutorCustody: jest.fn(), listItems: jest.fn(), listLocations: jest.fn() },
  tasksApi: {
    executionOrders: {
      get: jest.fn(),
      listActivities: jest.fn(),
      listItemUsage: jest.fn(),
      listEvidence: jest.fn(),
      start: jest.fn(),
      registerFieldWork: jest.fn(),
      updateFieldWork: jest.fn(),
      deleteFieldWork: jest.fn(),
      registerItemUsage: jest.fn(),
      uploadEvidenceAsset: jest.fn(),
      getEvidenceAsset: jest.fn(),
      registerEvidence: jest.fn(),
      close: jest.fn(),
    },
  },
}));

const api = tasksApi.executionOrders;
const OPEN_VERSION = 4;
const consumptionAction: RequirementActionDescriptor = {
  kind: 'consumption',
  requirementKey: 'material',
  itemCategory: 'CPE',
  action: 'REGISTER_ITEM_USAGE',
};
const slot = {
  loadOnOpen: jest.fn(),
  markUnavailable: jest.fn(),
  reset: jest.fn(),
  openAction: jest.fn(),
  loadMore: jest.fn(),
};

/** Servidor simulado: cada mutación sube la versión y agrega su registro. */
const server = {
  version: OPEN_VERSION,
  activities: [] as string[],
  itemUsage: [] as string[],
  evidence: [] as string[],
};

const detailOf = (id: string) =>
  ({
    id,
    version: server.version,
    status: 'IN_PROGRESS',
  }) as unknown as ExecutionOrderDetailResponse;
const pageOf = (data: string[]) => ({ data, meta: emptyPageListMeta({ total: data.length }) });
const bump = (collection: keyof Pick<typeof server, 'activities' | 'itemUsage' | 'evidence'>) => {
  server.version += 1;
  server[collection] = [...server[collection], `${collection}-${server.version}`];
};

function readCounts() {
  return {
    detail: jest.mocked(api.get).mock.calls.length,
    activities: jest.mocked(api.listActivities).mock.calls.length,
    itemUsage: jest.mocked(api.listItemUsage).mock.calls.length,
    evidence: jest.mocked(api.listEvidence).mock.calls.length,
  };
}
const inventoryCalls = () =>
  jest.mocked(inventoryApi.getExecutorCustody).mock.calls.length +
  jest.mocked(inventoryApi.listItems).mock.calls.length +
  jest.mocked(inventoryApi.listLocations).mock.calls.length;

/** Abre OT-A y deja los contadores en cero para medir solo lo que dispara la mutación. */
async function mountOpen(id = 'eo-1') {
  const view = renderHook(() => useExecutionOrderConsole());
  await act(async () => view.result.current.openExecutionOrder(id));
  expect(view.result.current.selectedExecutionOrder?.version).toBe(OPEN_VERSION);
  jest.mocked(api.get).mockClear();
  jest.mocked(api.listActivities).mockClear();
  jest.mocked(api.listItemUsage).mockClear();
  jest.mocked(api.listEvidence).mockClear();
  Object.values(slot).forEach((fn) => fn.mockClear());
  return view;
}

describe('consola de OT — refresco selectivo tras cada mutación (R4, CA-12)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Object.assign(server, { version: OPEN_VERSION, activities: [], itemUsage: [], evidence: [] });
    slot.loadOnOpen.mockResolvedValue(() => undefined);
    slot.loadMore.mockResolvedValue(undefined);
    jest.mocked(useExecutionOrderCustody).mockReturnValue(slot);
    jest.mocked(api.get).mockImplementation(async (id) => detailOf(id));
    jest
      .mocked(api.listActivities)
      .mockImplementation(async () => pageOf(server.activities) as never);
    jest
      .mocked(api.listItemUsage)
      .mockImplementation(async () => pageOf(server.itemUsage) as never);
    jest.mocked(api.listEvidence).mockImplementation(async () => pageOf(server.evidence) as never);
    jest.mocked(api.start).mockImplementation(async () => void (server.version += 1) as never);
    jest.mocked(api.registerFieldWork).mockImplementation(async () => bump('activities') as never);
    jest.mocked(api.updateFieldWork).mockImplementation(async () => bump('activities') as never);
    jest.mocked(api.deleteFieldWork).mockImplementation(async () => bump('activities') as never);
    jest.mocked(api.registerItemUsage).mockImplementation(async () => bump('itemUsage') as never);
    jest.mocked(api.registerEvidence).mockImplementation(async () => bump('evidence') as never);
    jest.mocked(api.close).mockImplementation(async () => void (server.version += 1) as never);
    jest.mocked(api.uploadEvidenceAsset).mockResolvedValue({
      intentId: 'intent-1',
      mediaAssetId: 'asset-1',
      status: 'PENDING_ANALYSIS',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    jest.mocked(api.getEvidenceAsset).mockResolvedValue({
      intentId: 'intent-1',
      mediaAssetId: 'asset-1',
      status: 'AVAILABLE',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
  });

  it('el drawer abre con las lecturas completas y las mutaciones ya no las repiten', async () => {
    const view = renderHook(() => useExecutionOrderConsole());
    await act(async () => view.result.current.openExecutionOrder('eo-1'));

    expect(readCounts()).toEqual({ detail: 1, activities: 1, itemUsage: 1, evidence: 1 });
  });

  it('registrar una actividad lee detalle y actividades, y nada más (CA-12)', async () => {
    const view = await mountOpen();

    await act(async () =>
      view.result.current.handleRegisterExecutionOrderFieldWork({
        activityType: 'INSTALLATION',
        description: 'Instalación del equipo',
      } as never),
    );

    expect(readCounts()).toEqual({ detail: 1, activities: 1, itemUsage: 0, evidence: 0 });
    expect(inventoryCalls()).toBe(0);
    expect(slot.loadOnOpen).not.toHaveBeenCalled();
    expect(slot.openAction).not.toHaveBeenCalled();
    expect(view.result.current.selectedExecutionOrder?.version).toBe(OPEN_VERSION + 1);
    expect(view.result.current.executionOrderActivities).toEqual([
      `activities-${OPEN_VERSION + 1}`,
    ]);
    expect(view.result.current.executionOrderSuccess).toBe('El trabajo realizado fue registrado.');
    expect(view.result.current.executionOrderError).toBeNull();
    expect(view.result.current.isSubmittingExecutionOrder).toBe(false);
  });

  it('descarta el éxito tardío si durante la mutación se abre otra OT', async () => {
    const view = await mountOpen('eo-1');
    let resolveMutation!: () => void;
    jest.mocked(api.registerFieldWork).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }) as never,
    );

    let pendingMutation!: Promise<boolean>;
    act(() => {
      pendingMutation = view.result.current.handleRegisterExecutionOrderFieldWork({
        description: 'Trabajo de la primera OT',
      } as never);
    });
    await act(async () => view.result.current.openExecutionOrder('eo-2'));

    await act(async () => {
      resolveMutation();
      await pendingMutation;
    });

    expect(view.result.current.selectedExecutionOrder?.id).toBe('eo-2');
    expect(view.result.current.executionOrderSuccess).toBeNull();
    expect(view.result.current.executionOrderError).toBeNull();
    expect(view.result.current.isSubmittingExecutionOrder).toBe(false);
  });

  it('modificar y eliminar una actividad refrescan lo mismo que registrarla', async () => {
    const view = await mountOpen();

    await act(async () =>
      view.result.current.handleUpdateExecutionOrderFieldWork('act-1', { description: 'Nueva' }),
    );
    expect(readCounts()).toEqual({ detail: 1, activities: 1, itemUsage: 0, evidence: 0 });

    await act(async () => view.result.current.handleDeleteExecutionOrderFieldWork('act-1'));
    expect(readCounts()).toEqual({ detail: 2, activities: 2, itemUsage: 0, evidence: 0 });
    expect(inventoryCalls()).toBe(0);
  });

  it('la mutación siguiente viaja con la versión refrescada, no con la de la apertura', async () => {
    const view = await mountOpen();

    await act(async () =>
      view.result.current.handleRegisterExecutionOrderFieldWork({ description: 'a' } as never),
    );
    await act(async () =>
      view.result.current.handleRegisterExecutionOrderFieldWork({ description: 'b' } as never),
    );

    const versions = jest.mocked(api.registerFieldWork).mock.calls.map(([, , version]) => version);
    expect(versions).toEqual([OPEN_VERSION, OPEN_VERSION + 1]);
    expect(jest.mocked(api.registerFieldWork).mock.calls[1]![1]).toEqual({ description: 'b' });
  });

  it('iniciar la ejecución lee solo el detalle', async () => {
    const view = await mountOpen();

    await act(async () => view.result.current.handleStartExecutionOrder('Llegué al sitio'));

    expect(api.start).toHaveBeenCalledWith('eo-1', { note: 'Llegué al sitio' }, OPEN_VERSION);
    expect(readCounts()).toEqual({ detail: 1, activities: 0, itemUsage: 0, evidence: 0 });
    expect(view.result.current.executionOrderSuccess).toBe('La ejecución fue iniciada.');
    expect(view.result.current.selectedExecutionOrder?.version).toBe(OPEN_VERSION + 1);
  });

  it('cerrar la orden lee solo el detalle y conserva el payload de cierre', async () => {
    const view = await mountOpen();
    const payload = { completionSummary: 'Servicio activo' } as never;

    await act(async () => view.result.current.handleCloseExecutionOrder(payload));

    expect(api.close).toHaveBeenCalledWith('eo-1', payload, OPEN_VERSION);
    expect(readCounts()).toEqual({ detail: 1, activities: 0, itemUsage: 0, evidence: 0 });
    expect(view.result.current.executionOrderSuccess).toBe('El cierre fue registrado.');
  });

  describe('consumo y custodia', () => {
    it('con la hoja de consumo cerrada lee detalle y consumos, sin custodia ni inventario', async () => {
      const view = await mountOpen();

      await act(async () =>
        view.result.current.handleRegisterExecutionOrderItemUsage({ itemId: 'item-1' } as never),
      );

      expect(readCounts()).toEqual({ detail: 1, activities: 0, itemUsage: 1, evidence: 0 });
      expect(slot.openAction).not.toHaveBeenCalled();
      expect(inventoryCalls()).toBe(0);
      expect(view.result.current.executionOrderItemUsage).toEqual([
        `itemUsage-${OPEN_VERSION + 1}`,
      ]);
    });

    it('con la hoja de consumo abierta además relee la custodia, una vez', async () => {
      const view = await mountOpen();
      act(() => view.result.current.openRequirementAction(consumptionAction));
      slot.openAction.mockClear();

      await act(async () =>
        view.result.current.handleRegisterExecutionOrderItemUsage({ itemId: 'item-1' } as never),
      );

      expect(readCounts()).toEqual({ detail: 1, activities: 0, itemUsage: 1, evidence: 0 });
      expect(slot.openAction).toHaveBeenCalledTimes(1);
      expect(slot.openAction).toHaveBeenCalledWith(consumptionAction);
    });

    it('tras cerrar la hoja de consumo deja de releer la custodia', async () => {
      const view = await mountOpen();
      act(() => view.result.current.openRequirementAction(consumptionAction));
      act(() => view.result.current.openRequirementAction(null));
      slot.openAction.mockClear();

      await act(async () =>
        view.result.current.handleRegisterExecutionOrderItemUsage({ itemId: 'item-1' } as never),
      );

      expect(slot.openAction).not.toHaveBeenCalled();
    });

    it('un fallo inicial de itemUsage se conserva como error local y reintenta solo esa colección', async () => {
      jest.mocked(api.listItemUsage).mockRejectedValueOnce(new Error('500'));
      const view = renderHook(() => useExecutionOrderConsole());
      await act(async () => view.result.current.openExecutionOrder('eo-1'));

      expect(view.result.current.executionOrderItemUsage).toEqual([]);
      expect(view.result.current.executionOrderItemUsageError).not.toBeNull();
      expect(view.result.current.executionOrderError).toBeNull();

      jest.mocked(api.get).mockClear();
      jest.mocked(api.listActivities).mockClear();
      jest.mocked(api.listItemUsage).mockClear();
      jest.mocked(api.listEvidence).mockClear();
      await act(async () => view.result.current.retryExecutionOrderItemUsage());

      expect(readCounts()).toEqual({ detail: 0, activities: 0, itemUsage: 1, evidence: 0 });
      expect(view.result.current.executionOrderItemUsageError).toBeNull();
    });

    it('un fallo al cargar una página conserva filas y metadata, y el reintento recarga solo itemUsage', async () => {
      jest.mocked(api.listItemUsage).mockImplementation(async (_id, params) => {
        const page = params?.page ?? 1;
        return {
          data: [`usage-${page}`],
          meta: emptyPageListMeta({ page, limit: 1, total: 21, hasMore: true }),
        } as never;
      });
      const view = renderHook(() => useExecutionOrderConsole());
      await act(async () => view.result.current.openExecutionOrder('eo-1'));
      const previousRows = view.result.current.executionOrderItemUsage;
      const previousMeta = view.result.current.executionOrderItemUsageMeta;
      expect(previousRows).toHaveLength(20);
      expect(previousMeta.hasMore).toBe(true);

      jest.mocked(api.listItemUsage).mockRejectedValueOnce(new Error('500'));
      await act(async () => view.result.current.loadMoreExecutionOrderItemUsage());

      expect(view.result.current.executionOrderItemUsage).toEqual(previousRows);
      expect(view.result.current.executionOrderItemUsageMeta).toEqual(previousMeta);
      expect(view.result.current.executionOrderItemUsageError).not.toBeNull();
      expect(view.result.current.executionOrderError).toBeNull();

      jest.mocked(api.get).mockClear();
      jest.mocked(api.listActivities).mockClear();
      jest.mocked(api.listItemUsage).mockClear();
      jest.mocked(api.listEvidence).mockClear();
      jest
        .mocked(api.listItemUsage)
        .mockImplementationOnce(async () => pageOf(['usage-recovered']) as never);
      await act(async () => view.result.current.retryExecutionOrderItemUsage());

      expect(readCounts()).toEqual({ detail: 0, activities: 0, itemUsage: 1, evidence: 0 });
      expect(view.result.current.executionOrderItemUsage).toEqual(['usage-recovered']);
      expect(view.result.current.executionOrderItemUsageError).toBeNull();
    });

    it('registrar una actividad con la hoja de consumo abierta no relee la custodia', async () => {
      const view = await mountOpen();
      act(() => view.result.current.openRequirementAction(consumptionAction));
      slot.openAction.mockClear();

      await act(async () =>
        view.result.current.handleRegisterExecutionOrderFieldWork({ description: 'a' } as never),
      );

      expect(slot.openAction).not.toHaveBeenCalled();
    });
  });

  describe('evidencia', () => {
    const photo = { name: 'foto.jpg', type: 'image/jpeg' } as File;

    it('registrar una evidencia lee detalle y evidencias, y conserva el payload de registro', async () => {
      const view = await mountOpen();

      await act(async () => view.result.current.handleUploadEvidence(photo, 'work-photo'));

      expect(api.registerEvidence).toHaveBeenCalledWith(
        'eo-1',
        {
          mediaAssetId: 'asset-1',
          evidenceType: 'PHOTO',
          requirementKey: 'work-photo',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        OPEN_VERSION,
      );
      expect(readCounts()).toEqual({ detail: 1, activities: 0, itemUsage: 0, evidence: 1 });
      expect(inventoryCalls()).toBe(0);
      expect(slot.openAction).not.toHaveBeenCalled();
      expect(view.result.current.executionOrderEvidence).toEqual([`evidence-${OPEN_VERSION + 1}`]);
      expect(view.result.current.executionOrderEvidenceState).toBe('available');
      expect(view.result.current.executionOrderSuccess).toBe('La evidencia fue registrada.');
    });

    it('una evidencia rechazada no registra nada ni dispara lecturas', async () => {
      jest.mocked(api.getEvidenceAsset).mockResolvedValue({
        intentId: 'intent-1',
        mediaAssetId: 'asset-1',
        status: 'REJECTED',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      const view = await mountOpen();

      await act(async () => view.result.current.handleUploadEvidence(photo, 'work-photo'));

      expect(api.registerEvidence).not.toHaveBeenCalled();
      expect(readCounts()).toEqual({ detail: 0, activities: 0, itemUsage: 0, evidence: 0 });
    });
  });

  describe('fallo parcial y preservación de datos', () => {
    it('si falla el historial, el detalle se actualiza, las actividades previas se conservan y se informa', async () => {
      const view = await mountOpen();
      await act(async () =>
        view.result.current.handleRegisterExecutionOrderFieldWork({ description: 'a' } as never),
      );
      const before = view.result.current.executionOrderActivities;
      jest.mocked(api.listActivities).mockRejectedValue(new Error('500'));

      await act(async () =>
        view.result.current.handleRegisterExecutionOrderFieldWork({ description: 'b' } as never),
      );

      expect(view.result.current.selectedExecutionOrder?.version).toBe(OPEN_VERSION + 2);
      expect(view.result.current.executionOrderActivities).toBe(before);
      expect(view.result.current.executionOrderError).toBe(
        'No pudimos actualizar el historial de actividades. Lo que ves puede no estar al día.',
      );
      // El registro sí ocurrió: el manejador lo confirma y la consola sigue operable.
      expect(view.result.current.executionOrderSuccess).toBe(
        'El trabajo realizado fue registrado.',
      );
      expect(view.result.current.isLoadingExecutionOrder).toBe(false);
      expect(view.result.current.isSubmittingExecutionOrder).toBe(false);
    });

    it('si falla el refetch de consumos tras registrar, conserva las filas y usa el reintento local', async () => {
      server.itemUsage = ['consumo-anterior'];
      const view = await mountOpen();
      const previousRows = view.result.current.executionOrderItemUsage;
      jest.mocked(api.listItemUsage).mockRejectedValueOnce(new Error('500'));

      await act(async () =>
        view.result.current.handleRegisterExecutionOrderItemUsage({ itemId: 'item-1' } as never),
      );

      expect(view.result.current.executionOrderItemUsage).toEqual(previousRows);
      expect(view.result.current.executionOrderItemUsageError).not.toBeNull();
      expect(view.result.current.executionOrderError).toBeNull();
      expect(view.result.current.executionOrderSuccess).toBe('El material fue registrado.');

      jest.mocked(api.get).mockClear();
      jest.mocked(api.listActivities).mockClear();
      jest.mocked(api.listItemUsage).mockClear();
      jest.mocked(api.listEvidence).mockClear();
      jest
        .mocked(api.listItemUsage)
        .mockImplementationOnce(async () => pageOf(['consumo-recuperado']) as never);
      await act(async () => view.result.current.retryExecutionOrderItemUsage());

      expect(readCounts()).toEqual({ detail: 0, activities: 0, itemUsage: 1, evidence: 0 });
      expect(view.result.current.executionOrderItemUsage).toEqual(['consumo-recuperado']);
      expect(view.result.current.executionOrderItemUsageError).toBeNull();
    });

    it('si falla el detalle, la orden y el historial de evidencias previos no se vacían', async () => {
      const view = await mountOpen();
      await act(async () =>
        view.result.current.handleUploadEvidence(
          { name: 'a.jpg', type: 'image/jpeg' } as File,
          'work-photo',
        ),
      );
      const orderBefore = view.result.current.selectedExecutionOrder;
      jest.mocked(api.get).mockRejectedValue(new Error('500'));
      jest.mocked(api.listEvidence).mockRejectedValue(new Error('500'));

      await act(async () =>
        view.result.current.handleUploadEvidence(
          { name: 'b.jpg', type: 'image/jpeg' } as File,
          'work-photo',
        ),
      );

      expect(view.result.current.selectedExecutionOrder).toBe(orderBefore);
      expect(view.result.current.executionOrderEvidence).toEqual([`evidence-${OPEN_VERSION + 1}`]);
      expect(view.result.current.executionOrderEvidenceState).toBe('available');
      expect(view.result.current.executionOrderError).toBe(
        'No pudimos actualizar el detalle de la orden y el historial de evidencias. Lo que ves puede no estar al día.',
      );
    });

    it('un refresco fallido no enciende la carga del detalle (la orden sigue a la vista)', async () => {
      const view = await mountOpen();
      jest.mocked(api.get).mockRejectedValue(new Error('500'));

      await act(async () => view.result.current.handleStartExecutionOrder());

      expect(view.result.current.isLoadingExecutionOrder).toBe(false);
      expect(view.result.current.selectedExecutionOrder?.id).toBe('eo-1');
    });

    it('el reintento explícito vuelve a abrir la OT completa y repara el estado', async () => {
      const view = await mountOpen();
      jest.mocked(api.listActivities).mockRejectedValueOnce(new Error('500'));
      await act(async () =>
        view.result.current.handleRegisterExecutionOrderFieldWork({ description: 'a' } as never),
      );
      expect(view.result.current.executionOrderError).not.toBeNull();
      jest.mocked(api.get).mockClear();
      jest.mocked(api.listActivities).mockClear();

      await act(async () => view.result.current.retryExecutionOrder());

      expect(readCounts()).toEqual({ detail: 1, activities: 1, itemUsage: 1, evidence: 1 });
      expect(view.result.current.executionOrderError).toBeNull();
      expect(view.result.current.executionOrderActivities).toEqual([
        `activities-${OPEN_VERSION + 1}`,
      ]);
    });
  });

  describe('navegación concurrente', () => {
    it('el refresco de la OT anterior no pisa a la OT que se abrió después', async () => {
      const view = await mountOpen('eo-1');
      let releaseRefresh!: (detail: ExecutionOrderDetailResponse) => void;
      // 1.ª lectura tras la mutación (refresco de eo-1): queda retenida.
      jest
        .mocked(api.get)
        .mockImplementationOnce(
          () => new Promise<ExecutionOrderDetailResponse>((resolve) => (releaseRefresh = resolve)),
        );

      let mutation!: Promise<boolean>;
      act(() => {
        mutation = view.result.current.handleRegisterExecutionOrderFieldWork({
          description: 'a',
        } as never);
      });
      await act(async () => {
        await Promise.resolve();
      });
      // El usuario abre eo-2 mientras el refresco de eo-1 sigue en vuelo.
      server.version = 10;
      server.activities = ['de-eo-2'];
      await act(async () => view.result.current.openExecutionOrder('eo-2'));
      expect(view.result.current.selectedExecutionOrder?.id).toBe('eo-2');

      await act(async () => {
        releaseRefresh({ id: 'eo-1', version: 99 } as ExecutionOrderDetailResponse);
        await mutation;
      });

      expect(view.result.current.selectedExecutionOrder?.id).toBe('eo-2');
      expect(view.result.current.selectedExecutionOrder?.version).toBe(10);
      expect(view.result.current.executionOrderActivities).toEqual(['de-eo-2']);
      expect(view.result.current.executionOrderError).toBeNull();
    });

    it('cerrar el drawer con el refresco en vuelo no reabre ni rellena la consola', async () => {
      const view = await mountOpen('eo-1');
      let releaseRefresh!: (detail: ExecutionOrderDetailResponse) => void;
      jest
        .mocked(api.get)
        .mockImplementationOnce(
          () => new Promise<ExecutionOrderDetailResponse>((resolve) => (releaseRefresh = resolve)),
        );

      let mutation!: Promise<boolean>;
      act(() => {
        mutation = view.result.current.handleRegisterExecutionOrderFieldWork({
          description: 'a',
        } as never);
      });
      await act(async () => {
        await Promise.resolve();
      });
      act(() => view.result.current.closeExecutionOrder());
      await act(async () => {
        releaseRefresh(detailOf('eo-1'));
        await mutation;
      });

      expect(view.result.current.selectedExecutionOrder).toBeNull();
      expect(view.result.current.executionOrderActivities).toEqual([]);
      expect(view.result.current.executionOrderError).toBeNull();
    });
  });

  describe('regresión de seguridad y de modo sin conexión', () => {
    it('el refresco no escribe en localStorage ni sessionStorage', async () => {
      const setItem = jest.spyOn(Storage.prototype, 'setItem');
      try {
        const view = await mountOpen();
        await act(async () =>
          view.result.current.handleRegisterExecutionOrderFieldWork({ description: 'a' } as never),
        );
        await act(async () => view.result.current.handleStartExecutionOrder());
        await act(async () =>
          view.result.current.handleUploadEvidence(
            { name: 'a.jpg', type: 'image/jpeg' } as File,
            'work-photo',
          ),
        );

        expect(setItem).not.toHaveBeenCalled();
      } finally {
        setItem.mockRestore();
      }
    });

    it('con la red caída durante el refresco se informa y la consola sigue operable', async () => {
      const view = await mountOpen();
      jest.mocked(api.get).mockRejectedValue(new TypeError('Failed to fetch'));
      jest.mocked(api.listActivities).mockRejectedValue(new TypeError('Failed to fetch'));

      await act(async () =>
        view.result.current.handleRegisterExecutionOrderFieldWork({ description: 'a' } as never),
      );

      expect(view.result.current.executionOrderError).toBe(
        'No pudimos actualizar el detalle de la orden y el historial de actividades. Lo que ves puede no estar al día.',
      );
      expect(view.result.current.selectedExecutionOrder?.id).toBe('eo-1');
      expect(view.result.current.isSubmittingExecutionOrder).toBe(false);
    });
  });
});
