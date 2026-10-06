// apps/portal/src/components/operations/use-execution-order-refresh.spec.ts
// R4 (Ola 2b, CA-12): política de refresco por mutación. Cada caso cuenta las
// lecturas exactas que dispara una mutación, no solo que «algo» se recargó.
import { act, renderHook } from '@testing-library/react';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { tasksApi } from '@/lib/api-client';
import { emptyPageListMeta } from '@/lib/list-meta';
import type { RequirementActionDescriptor } from './execution-order-actions';
import {
  EXECUTION_ORDER_REFRESH_PLAN,
  useExecutionOrderRefresh,
  type ExecutionOrderMutation,
  type ExecutionOrderRefreshAdapter,
} from './use-execution-order-refresh';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  tasksApi: {
    executionOrders: {
      get: jest.fn(),
      listActivities: jest.fn(),
      listItemUsage: jest.fn(),
      listEvidence: jest.fn(),
    },
  },
}));

const api = tasksApi.executionOrders;
const { ApiError } = jest.requireMock('@/lib/api-client') as {
  ApiError: new (status: number, message: string) => Error;
};

const staleDetail = { id: 'eo-1', version: 3 } as ExecutionOrderDetailResponse;
const freshDetail = { id: 'eo-1', version: 4 } as ExecutionOrderDetailResponse;
const consumptionAction: RequirementActionDescriptor = {
  kind: 'consumption',
  requirementKey: 'material',
  itemCategory: 'CPE',
  action: 'REGISTER_ITEM_USAGE',
};

function page<T>(data: T[], overrides: Parameters<typeof emptyPageListMeta>[0] = {}) {
  return { data, meta: emptyPageListMeta({ total: data.length, ...overrides }) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildContext(
  overrides: Partial<ExecutionOrderRefreshAdapter> = {},
): ExecutionOrderRefreshAdapter {
  return {
    openExecutionOrder: jest.fn().mockResolvedValue(undefined),
    selectedExecutionOrder: staleDetail,
    setDetail: jest.fn(),
    setActivities: jest.fn(),
    setActivitiesMeta: jest.fn(),
    setItemUsage: jest.fn(),
    setItemUsageMeta: jest.fn(),
    setItemUsageError: jest.fn(),
    setEvidence: jest.fn(),
    setEvidenceMeta: jest.fn(),
    requestSequence: { current: 1 },
    setError: jest.fn(),
    setSuccess: jest.fn(),
    setLoadingDetail: jest.fn(),
    setEvidenceState: jest.fn(),
    setLoadingActivities: jest.fn(),
    setLoadingItemUsage: jest.fn(),
    setLoadingEvidence: jest.fn(),
    activeConsumptionRequirement: { current: null },
    refreshOpenCustody: jest.fn(),
    ...overrides,
  };
}

function mount(overrides: Partial<ExecutionOrderRefreshAdapter> = {}) {
  const context = buildContext(overrides);
  const view = renderHook(
    (props: { context: ExecutionOrderRefreshAdapter }) => useExecutionOrderRefresh(props.context),
    { initialProps: { context } },
  );
  const refresh = (id: string, mutation: ExecutionOrderMutation) =>
    act(async () => view.result.current(id, mutation));
  return { context, view, refresh };
}

function readCounts() {
  return {
    detail: jest.mocked(api.get).mock.calls.length,
    activities: jest.mocked(api.listActivities).mock.calls.length,
    itemUsage: jest.mocked(api.listItemUsage).mock.calls.length,
    evidence: jest.mocked(api.listEvidence).mock.calls.length,
  };
}

describe('useExecutionOrderRefresh — refresco selectivo por mutación (R4, CA-12)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(api.get).mockResolvedValue(freshDetail);
    jest.mocked(api.listActivities).mockResolvedValue(page(['activity-1'] as never[]));
    jest.mocked(api.listItemUsage).mockResolvedValue(page(['usage-1'] as never[]));
    jest.mocked(api.listEvidence).mockResolvedValue(page(['evidence-1'] as never[]));
  });

  describe('matriz acción → lecturas (número exacto de llamadas)', () => {
    it.each([
      ['start', { detail: 1, activities: 0, itemUsage: 0, evidence: 0 }],
      ['close', { detail: 1, activities: 0, itemUsage: 0, evidence: 0 }],
      ['activity', { detail: 1, activities: 1, itemUsage: 0, evidence: 0 }],
      ['consumption', { detail: 1, activities: 0, itemUsage: 1, evidence: 0 }],
      ['evidence', { detail: 1, activities: 0, itemUsage: 0, evidence: 1 }],
    ] as const)('%s lee exactamente %j', async (mutation, expected) => {
      const { context, refresh } = mount();

      await refresh('eo-1', mutation);

      expect(readCounts()).toEqual(expected);
      // CA-12: ninguna mutación vuelve a abrir la OT ni dispara las seis colecciones.
      expect(context.openExecutionOrder).not.toHaveBeenCalled();
      expect(context.refreshOpenCustody).not.toHaveBeenCalled();
      expect(Object.keys(EXECUTION_ORDER_REFRESH_PLAN).sort()).toEqual(
        ['activity', 'close', 'consumption', 'evidence', 'start'].sort(),
      );
    });

    it('registrar una actividad no recarga consumos, evidencias, inventario ni custodia (CA-12)', async () => {
      const { context, refresh } = mount();

      await refresh('eo-1', 'activity');

      const reads = readCounts();
      expect(reads.detail + reads.activities).toBe(2);
      expect(reads.itemUsage + reads.evidence).toBe(0);
      expect(context.refreshOpenCustody).not.toHaveBeenCalled();
      expect(context.setItemUsage).not.toHaveBeenCalled();
      expect(context.setEvidence).not.toHaveBeenCalled();
    });

    it('aplica cada recurso leído a su propio estado y a ningún otro', async () => {
      const { context, refresh } = mount();

      await refresh('eo-1', 'activity');

      expect(context.setDetail).toHaveBeenCalledTimes(1);
      expect(context.setDetail).toHaveBeenCalledWith(freshDetail);
      expect(context.setActivities).toHaveBeenCalledWith(['activity-1']);
      expect(context.setActivitiesMeta).toHaveBeenCalledTimes(1);
      expect(context.setItemUsage).not.toHaveBeenCalled();
      expect(context.setEvidence).not.toHaveBeenCalled();
      expect(context.setError).not.toHaveBeenCalled();
    });

    it('la evidencia recupera su estado disponible cuando su lectura llega', async () => {
      const { context, refresh } = mount();

      await refresh('eo-1', 'evidence');

      expect(context.setEvidence).toHaveBeenCalledWith(['evidence-1']);
      expect(context.setEvidenceMeta).toHaveBeenCalledTimes(1);
      expect(context.setEvidenceState).toHaveBeenCalledTimes(1);
      expect(context.setEvidenceState).toHaveBeenCalledWith('available');
    });

    it('lee la colección completa página a página (una llamada por página)', async () => {
      jest
        .mocked(api.listActivities)
        .mockResolvedValueOnce(
          page(['a-1', 'a-2'] as never[], { total: 3, hasMore: true, page: 1, limit: 2 }),
        )
        .mockResolvedValueOnce(
          page(['a-3'] as never[], { total: 3, hasMore: false, page: 2, limit: 2 }),
        );
      const { context, refresh } = mount();

      await refresh('eo-1', 'activity');

      expect(jest.mocked(api.listActivities).mock.calls.map(([, params]) => params?.page)).toEqual([
        1, 2,
      ]);
      expect(context.setActivities).toHaveBeenCalledWith(['a-1', 'a-2', 'a-3']);
      expect(jest.mocked(api.get)).toHaveBeenCalledTimes(1);
    });
  });

  describe('custodia: solo con el acto MATERIAL abierto (CA-11)', () => {
    it('con la hoja de consumo cerrada no relee custodia', async () => {
      const { context, refresh } = mount({ activeConsumptionRequirement: { current: null } });

      await refresh('eo-1', 'consumption');

      expect(context.refreshOpenCustody).not.toHaveBeenCalled();
    });

    it('con la hoja de consumo abierta relee la custodia una sola vez', async () => {
      const { context, refresh } = mount({
        activeConsumptionRequirement: { current: consumptionAction },
      });

      await refresh('eo-1', 'consumption');

      expect(context.refreshOpenCustody).toHaveBeenCalledTimes(1);
      expect(readCounts()).toEqual({ detail: 1, activities: 0, itemUsage: 1, evidence: 0 });
    });

    it('releer la custodia no depende de que el historial de consumos haya llegado', async () => {
      jest.mocked(api.listItemUsage).mockRejectedValue(new Error('red caída'));
      const { context, refresh } = mount({
        activeConsumptionRequirement: { current: consumptionAction },
      });

      await refresh('eo-1', 'consumption');

      expect(context.refreshOpenCustody).toHaveBeenCalledTimes(1);
    });

    it.each(['start', 'activity', 'evidence', 'close'] as const)(
      'una mutación %s nunca relee custodia aunque la hoja de consumo esté abierta',
      async (mutation) => {
        const { context, refresh } = mount({
          activeConsumptionRequirement: { current: consumptionAction },
        });

        await refresh('eo-1', mutation);

        expect(context.refreshOpenCustody).not.toHaveBeenCalled();
      },
    );
  });

  describe('fallo parcial: conserva los datos válidos y lo dice', () => {
    it('si falla el historial, el detalle se actualiza y las actividades previas se conservan', async () => {
      jest.mocked(api.listActivities).mockRejectedValue(new Error('500'));
      const { context, refresh } = mount();

      await refresh('eo-1', 'activity');

      expect(context.setDetail).toHaveBeenCalledWith(freshDetail);
      expect(context.setActivities).not.toHaveBeenCalled();
      expect(context.setActivitiesMeta).not.toHaveBeenCalled();
      expect(context.setError).toHaveBeenCalledTimes(1);
      expect(context.setError).toHaveBeenCalledWith(
        'No pudimos actualizar el historial de actividades. Lo que ves puede no estar al día.',
      );
    });

    it('si falla el detalle, conserva el detalle vigente y aun así muestra el historial nuevo', async () => {
      jest.mocked(api.get).mockRejectedValue(new Error('500'));
      const { context, refresh } = mount();

      await refresh('eo-1', 'consumption');

      expect(context.setDetail).not.toHaveBeenCalled();
      expect(context.setItemUsage).toHaveBeenCalledWith(['usage-1']);
      expect(context.setError).toHaveBeenCalledWith(
        'No pudimos actualizar el detalle de la orden. Lo que ves puede no estar al día.',
      );
    });

    it('si fallan ambas lecturas no se pisa ningún dato y el mensaje nombra las dos', async () => {
      jest.mocked(api.get).mockRejectedValue(new Error('500'));
      jest.mocked(api.listEvidence).mockRejectedValue(new Error('500'));
      const { context, refresh } = mount();

      await refresh('eo-1', 'evidence');

      expect(context.setDetail).not.toHaveBeenCalled();
      expect(context.setEvidence).not.toHaveBeenCalled();
      expect(context.setEvidenceMeta).not.toHaveBeenCalled();
      // El estado de la evidencia no cambia: no se degrada a «no disponible» ni a «cargando».
      expect(context.setEvidenceState).not.toHaveBeenCalled();
      expect(context.setError).toHaveBeenCalledTimes(1);
      expect(context.setError).toHaveBeenCalledWith(
        'No pudimos actualizar el detalle de la orden y el historial de evidencias. Lo que ves puede no estar al día.',
      );
    });

    it('un refresco de inicio o cierre que falla informa el detalle y conserva la orden', async () => {
      jest.mocked(api.get).mockRejectedValue(new Error('500'));
      const { context, refresh } = mount();

      await refresh('eo-1', 'close');

      expect(context.setDetail).not.toHaveBeenCalled();
      expect(context.setError).toHaveBeenCalledWith(
        'No pudimos actualizar el detalle de la orden. Lo que ves puede no estar al día.',
      );
    });

    it.each([
      [401, 'Tu sesión expiró. Inicia sesión nuevamente para continuar.'],
      [403, 'No tienes permisos para operar esta vista de Operaciones.'],
      [404, 'El elemento consultado ya no está disponible.'],
    ])(
      'un %i se informa con el mensaje de sesión, permiso u orden retirada',
      async (status, copy) => {
        jest.mocked(api.get).mockRejectedValue(new ApiError(status, 'x'));
        const { context, refresh } = mount();

        await refresh('eo-1', 'start');

        expect(context.setError).toHaveBeenCalledWith(copy);
      },
    );

    it('nunca rechaza: el registro ya ocurrió y el manejador no debe verlo como fallo', async () => {
      jest.mocked(api.get).mockRejectedValue(new Error('500'));
      jest.mocked(api.listActivities).mockRejectedValue(new Error('500'));
      const { view } = mount();

      await expect(
        act(async () => view.result.current('eo-1', 'activity')),
      ).resolves.toBeUndefined();
    });
  });

  describe('estados por recurso sin vaciar lo mostrado', () => {
    it.each(['start', 'activity', 'consumption', 'evidence', 'close'] as const)(
      'durante un refresco %s no se enciende ningún indicador que desmonte la orden',
      async (mutation) => {
        const gate = deferred<ExecutionOrderDetailResponse>();
        jest.mocked(api.get).mockReturnValue(gate.promise);
        const { context, view } = mount();

        let pending!: Promise<void>;
        act(() => {
          pending = view.result.current('eo-1', mutation);
        });
        // En vuelo: nada se ha limpiado ni puesto en «cargando».
        expect(context.setLoadingDetail).not.toHaveBeenCalled();
        expect(context.setLoadingActivities).not.toHaveBeenCalled();
        expect(context.setLoadingItemUsage).not.toHaveBeenCalled();
        expect(context.setLoadingEvidence).not.toHaveBeenCalled();
        expect(context.setEvidenceState).not.toHaveBeenCalled();
        expect(context.setDetail).not.toHaveBeenCalled();

        await act(async () => {
          gate.resolve(freshDetail);
          await pending;
        });

        expect(context.setLoadingDetail).not.toHaveBeenCalled();
        expect(context.setLoadingActivities).not.toHaveBeenCalled();
        expect(context.setLoadingItemUsage).not.toHaveBeenCalled();
        expect(context.setLoadingEvidence).not.toHaveBeenCalled();
        // El éxito lo comunica el manejador de la mutación, no el refresco.
        expect(context.setSuccess).not.toHaveBeenCalled();
      },
    );

    it('no limpia errores ajenos: solo escribe cuando una lectura falla', async () => {
      const { context, refresh } = mount();

      await refresh('eo-1', 'activity');

      expect(context.setError).not.toHaveBeenCalled();
    });
  });

  describe('navegación concurrente: una OT anterior no pisa a la vigente', () => {
    it('si no hay OT a la vista, no lee nada', async () => {
      const { context, refresh } = mount({ selectedExecutionOrder: null });

      await refresh('eo-1', 'activity');

      expect(readCounts()).toEqual({ detail: 0, activities: 0, itemUsage: 0, evidence: 0 });
      expect(context.setDetail).not.toHaveBeenCalled();
    });

    it('si la OT a la vista ya es otra al terminar la mutación, no lee nada', async () => {
      const { context, refresh } = mount({
        selectedExecutionOrder: { id: 'eo-2', version: 1 } as ExecutionOrderDetailResponse,
      });

      await refresh('eo-1', 'consumption');

      expect(readCounts()).toEqual({ detail: 0, activities: 0, itemUsage: 0, evidence: 0 });
      expect(context.setDetail).not.toHaveBeenCalled();
      expect(context.setError).not.toHaveBeenCalled();
    });

    it('si se abre otra OT con el refresco en vuelo, descarta lo leído sin tocar el estado', async () => {
      const gate = deferred<ExecutionOrderDetailResponse>();
      jest.mocked(api.get).mockReturnValue(gate.promise);
      const { context, view } = mount({
        activeConsumptionRequirement: { current: consumptionAction },
      });

      let pending!: Promise<void>;
      act(() => {
        pending = view.result.current('eo-1', 'consumption');
      });
      // Otra apertura (`openExecutionOrder`) incrementa la secuencia compartida.
      context.requestSequence.current += 1;
      await act(async () => {
        gate.resolve(freshDetail);
        await pending;
      });

      expect(context.setDetail).not.toHaveBeenCalled();
      expect(context.setItemUsage).not.toHaveBeenCalled();
      expect(context.setItemUsageMeta).not.toHaveBeenCalled();
      expect(context.setError).not.toHaveBeenCalled();
      // Tampoco se relee la custodia de una OT que ya no está a la vista.
      expect(context.refreshOpenCustody).not.toHaveBeenCalled();
    });

    it('si se cierra la consola con el refresco en vuelo, descarta lo leído', async () => {
      const gate = deferred<ExecutionOrderDetailResponse>();
      jest.mocked(api.get).mockReturnValue(gate.promise);
      const { context, view } = mount();

      let pending!: Promise<void>;
      act(() => {
        pending = view.result.current('eo-1', 'evidence');
      });
      // `closeExecutionOrder` incrementa la secuencia y vacía la selección.
      context.requestSequence.current += 1;
      view.rerender({
        context: { ...context, selectedExecutionOrder: null },
      });
      await act(async () => {
        gate.resolve(freshDetail);
        await pending;
      });

      expect(context.setDetail).not.toHaveBeenCalled();
      expect(context.setEvidence).not.toHaveBeenCalled();
      expect(context.setEvidenceState).not.toHaveBeenCalled();
      expect(context.setError).not.toHaveBeenCalled();
    });

    it('si la apertura de otra OT ya había empezado y aterriza durante el vuelo, el detalle viejo no la pisa', async () => {
      const gate = deferred<ExecutionOrderDetailResponse>();
      jest.mocked(api.get).mockReturnValue(gate.promise);
      const { context, view } = mount();

      let pending!: Promise<void>;
      act(() => {
        pending = view.result.current('eo-1', 'activity');
      });
      // La secuencia no cambia (esa apertura empezó antes), pero la OT a la vista ya es eo-2.
      view.rerender({
        context: {
          ...context,
          selectedExecutionOrder: { id: 'eo-2', version: 1 } as ExecutionOrderDetailResponse,
        },
      });
      await act(async () => {
        gate.resolve(freshDetail);
        await pending;
      });

      expect(context.setDetail).not.toHaveBeenCalled();
      expect(context.setActivities).not.toHaveBeenCalled();
      expect(context.setError).not.toHaveBeenCalled();
    });

    it('un fallo tardío de una OT anterior no deja un error sobre la vigente', async () => {
      const gate = deferred<ExecutionOrderDetailResponse>();
      jest.mocked(api.get).mockReturnValue(gate.promise);
      const { context, view } = mount();

      let pending!: Promise<void>;
      act(() => {
        pending = view.result.current('eo-1', 'start');
      });
      context.requestSequence.current += 1;
      await act(async () => {
        gate.reject(new Error('500'));
        await pending;
      });

      expect(context.setError).not.toHaveBeenCalled();
    });

    it('si la OT a la vista cambia de objeto pero no de identificador, el refresco aplica sobre ella', async () => {
      const gate = deferred<ExecutionOrderDetailResponse>();
      jest.mocked(api.get).mockReturnValue(gate.promise);
      const { context, view } = mount();

      let pending!: Promise<void>;
      act(() => {
        pending = view.result.current('eo-1', 'start');
      });
      // Otro refresco ya aplicó un detalle más nuevo: la OT sigue siendo la misma.
      view.rerender({ context: { ...context, selectedExecutionOrder: freshDetail } });
      await act(async () => {
        gate.resolve({ id: 'eo-1', version: 5 } as ExecutionOrderDetailResponse);
        await pending;
      });

      expect(context.setDetail).toHaveBeenCalledWith({ id: 'eo-1', version: 5 });
    });
  });

  describe('refrescos solapados: gana el último de cada recurso', () => {
    it('el detalle de un refresco anterior no pisa el del posterior', async () => {
      const first = deferred<ExecutionOrderDetailResponse>();
      const second = deferred<ExecutionOrderDetailResponse>();
      jest.mocked(api.get).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const { context, view } = mount();

      let pendingFirst!: Promise<void>;
      let pendingSecond!: Promise<void>;
      act(() => {
        pendingFirst = view.result.current('eo-1', 'start');
        pendingSecond = view.result.current('eo-1', 'activity');
      });
      await act(async () => {
        second.resolve({ id: 'eo-1', version: 6 } as ExecutionOrderDetailResponse);
        await pendingSecond;
        first.resolve({ id: 'eo-1', version: 5 } as ExecutionOrderDetailResponse);
        await pendingFirst;
      });

      expect(context.setDetail).toHaveBeenCalledTimes(1);
      expect(context.setDetail).toHaveBeenCalledWith({ id: 'eo-1', version: 6 });
    });

    it('un fallo de un refresco superado no genera un error sobre datos que ya son más nuevos', async () => {
      const first = deferred<ExecutionOrderDetailResponse>();
      jest.mocked(api.get).mockReturnValueOnce(first.promise).mockResolvedValueOnce(freshDetail);
      const { context, view } = mount();

      let pendingFirst!: Promise<void>;
      act(() => {
        pendingFirst = view.result.current('eo-1', 'start');
      });
      await act(async () => view.result.current('eo-1', 'close'));
      await act(async () => {
        first.reject(new Error('500'));
        await pendingFirst;
      });

      expect(context.setDetail).toHaveBeenCalledTimes(1);
      expect(context.setError).not.toHaveBeenCalled();
    });
  });

  describe('estabilidad y contrato con el adaptador', () => {
    it('devuelve una función referencialmente estable entre renders', () => {
      const { view, context } = mount();
      const first = view.result.current;

      view.rerender({ context: { ...context, selectedExecutionOrder: freshDetail } });

      expect(view.result.current).toBe(first);
    });

    it('usa el contexto más reciente: la hoja abierta tras montar cuenta para la custodia', async () => {
      const { context, view } = mount();
      const refreshOpenCustody = jest.fn();
      view.rerender({
        context: {
          ...context,
          activeConsumptionRequirement: { current: consumptionAction },
          refreshOpenCustody,
        },
      });

      await act(async () => view.result.current('eo-1', 'consumption'));

      expect(refreshOpenCustody).toHaveBeenCalledTimes(1);
      expect(context.refreshOpenCustody).not.toHaveBeenCalled();
    });
  });
});
