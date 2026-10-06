// R3 — política de custodia e inventario de la consola (CA-10 / CA-11).
//
// Se prueba contra los endpoints reales de inventario simulados: el contrato de
// la política es qué se consulta, cuándo y qué se ofrece, no cómo lo implementa.
import { useRef, useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ListMeta } from '@iwana/shared';
import type {
  ExecutionOrderDetailResponse,
  SerializedAssetRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import { inventoryApi } from '@/lib/api-client';
import type { RequirementActionDescriptor } from './execution-order-actions';
import type { ExecutionOrderCustodyOption } from './execution-order-console-types';
import { useExecutionOrderCustody } from './use-execution-order-custody';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  inventoryApi: {
    listCategories: jest.fn(),
    listItems: jest.fn(),
    listLocations: jest.fn(),
    getExecutorCustody: jest.fn(),
  },
}));

type LoadState = 'loading' | 'available' | 'unavailable';

const consumption = {
  kind: 'consumption',
  requirementKey: 'installed-equipment',
  itemCategory: 'CPE',
  finalDisposition: 'INSTALLED_AT_CUSTOMER',
  action: 'REGISTER_ITEM_USAGE',
} as const satisfies RequirementActionDescriptor;

const order = {
  id: 'eo-001',
  status: 'IN_PROGRESS',
  assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Carlos López' },
} as ExecutionOrderDetailResponse;

function meta(overrides: Partial<ListMeta> = {}): ListMeta {
  return {
    nextCursor: null,
    total: 0,
    totalIsEstimate: false,
    page: null,
    limit: 100,
    totalPages: null,
    hasMore: false,
    mode: 'cursor',
    capabilities: { randomAccess: false, sortableFields: [] },
    sort: null,
    ...overrides,
  };
}

const item = (id: string, categoryCode: string, overrides: Record<string, unknown> = {}) => ({
  id,
  sku: `SKU-${id}`,
  name: `Equipo ${id}`,
  status: 'ACTIVE',
  categoryId: `cat-${categoryCode}`,
  categoryCode,
  ...overrides,
});

const asset = (id: string, inventoryItemId: string) =>
  ({
    id,
    inventoryItemId,
    serialNumber: `SN-${id}`,
    currentStatus: 'ASSIGNED_TO_TECHNICIAN',
  }) as unknown as SerializedAssetRecord;

const balance = (id: string, itemId: string) =>
  ({ id, itemId, quantityOnHand: '3', quantityReserved: '0' }) as unknown as StockBalanceRecord;

function custodyPage(
  page: number,
  totalPages: number,
  assets: SerializedAssetRecord[] = [],
  balances: StockBalanceRecord[] = [],
) {
  const pageMeta = (total: number) =>
    meta({
      mode: 'page',
      page,
      totalPages,
      total,
      hasMore: page < totalPages,
      capabilities: { randomAccess: true, sortableFields: [] },
    });
  return {
    location: {
      id: 'loc-001',
      name: 'Bodega móvil de Carlos López',
      type: 'MOBILE_TECHNICIAN',
      responsibleType: 'TECHNICIAN',
      responsibleRefId: 'tech-001',
    },
    assets: { items: assets, meta: pageMeta(assets.length) },
    balances: { items: balances, meta: pageMeta(balances.length) },
  } as never;
}

function mockCatalog(items: ReturnType<typeof item>[] = [item('ont-1', 'CPE')]) {
  jest
    .mocked(inventoryApi.listCategories)
    .mockResolvedValue({ data: [{ id: 'cat-CPE', code: 'CPE' }], meta: meta() } as never);
  jest.mocked(inventoryApi.listItems).mockResolvedValue({ data: items, meta: meta() } as never);
}

function useHarness(selected: ExecutionOrderDetailResponse | null) {
  const [inventoryState, setInventoryState] = useState<LoadState>('loading');
  const [custodyState, setCustodyState] = useState<LoadState>('loading');
  const [custodyName, setCustodyName] = useState<string | null>(null);
  const [assets, setAssets] = useState<SerializedAssetRecord[]>([]);
  const [assetsMeta, setAssetsMeta] = useState<ListMeta>(meta());
  const [balances, setBalances] = useState<StockBalanceRecord[]>([]);
  const [balancesMeta, setBalancesMeta] = useState<ListMeta>(meta());
  const [itemOptions, setItemOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [custodyOptions, setCustodyOptions] = useState<ExecutionOrderCustodyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const requestSequence = useRef(0);
  const slot = useExecutionOrderCustody({
    selectedExecutionOrder: selected,
    requestSequence,
    setInventoryState,
    setCustodyState,
    setCustodyName,
    setAssets,
    setAssetsMeta,
    setBalances,
    setBalancesMeta,
    setItemOptions,
    setCustodyOptions,
    setError,
    assetsMeta,
    balancesMeta,
    isLoadingMore,
    setLoadingMore,
  });
  return {
    slot,
    inventoryState,
    custodyState,
    custodyName,
    assets,
    assetsMeta,
    balances,
    balancesMeta,
    itemOptions,
    custodyOptions,
    error,
    isLoadingMore,
  };
}

function mount(selected: ExecutionOrderDetailResponse | null = order) {
  return renderHook(({ current }) => useHarness(current), { initialProps: { current: selected } });
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

describe('useExecutionOrderCustody — política bajo demanda', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('no consulta inventario ni custodia al montar, al abrir la OT ni con otras acciones', async () => {
    const { result } = mount();
    const detail = Promise.resolve(order);

    let apply!: () => void;
    await act(async () => {
      apply = await result.current.slot.loadOnOpen(detail);
    });
    act(() => apply());
    act(() => {
      result.current.slot.openAction({
        kind: 'activity',
        requirementKey: 'installation-activity',
        activityType: 'INSTALLATION',
        action: 'REGISTER_ACTIVITY',
      });
      result.current.slot.openAction({
        kind: 'evidence',
        requirementKey: 'service-test',
        evidenceType: 'PHOTO',
        action: 'REGISTER_EVIDENCE',
      });
      result.current.slot.openAction(null);
    });

    expect(inventoryApi.listCategories).not.toHaveBeenCalled();
    expect(inventoryApi.listItems).not.toHaveBeenCalled();
    expect(inventoryApi.listLocations).not.toHaveBeenCalled();
    expect(inventoryApi.getExecutorCustody).not.toHaveBeenCalled();
  });

  it('al abrir el consumo consulta con el responsable de la OT y ofrece solo la categoría del requisito', async () => {
    mockCatalog([item('ont-1', 'CPE'), item('router-1', 'CPE'), item('cable-1', 'CPE')]);
    jest
      .mocked(inventoryApi.getExecutorCustody)
      .mockResolvedValue(
        custodyPage(
          1,
          1,
          [asset('a1', 'ont-1'), asset('a2', 'tool-9')],
          [balance('b1', 'router-1'), balance('b2', 'otro-1')],
        ),
      );
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    expect(result.current.custodyState).toBe('loading');
    expect(result.current.inventoryState).toBe('loading');
    await waitFor(() => expect(result.current.custodyState).toBe('available'));

    // Responsable técnico/cuadrilla: el id de la OT, no el de la ubicación de stock.
    expect(inventoryApi.getExecutorCustody).toHaveBeenCalledWith('tech-001', {
      page: 1,
      limit: 100,
    });
    expect(inventoryApi.listCategories).toHaveBeenCalledTimes(1);
    expect(inventoryApi.listItems).toHaveBeenCalledWith({
      status: 'ACTIVE',
      categoryId: 'cat-CPE',
      limit: 100,
    });
    expect(inventoryApi.listLocations).not.toHaveBeenCalled();
    expect(result.current.assets.map((entry) => entry.id)).toEqual(['a1']);
    expect(result.current.balances.map((entry) => entry.id)).toEqual(['b1']);
    expect(result.current.itemOptions).toEqual([
      { value: 'ont-1', label: 'SKU-ont-1 · Equipo ont-1' },
      { value: 'router-1', label: 'SKU-router-1 · Equipo router-1' },
    ]);
    expect(result.current.custodyOptions).toEqual([
      { type: 'TECHNICIAN', id: 'tech-001', label: 'Bodega móvil de Carlos López' },
    ]);
    expect(result.current.custodyName).toBe('Bodega móvil de Carlos López');
    expect(result.current.inventoryState).toBe('available');
  });

  it('no ofrece ítems inactivos ni de otra categoría aunque estén en custodia', async () => {
    mockCatalog([
      item('ont-1', 'CPE'),
      item('ont-viejo', 'CPE', { status: 'INACTIVE' }),
      item('mal-filtrado', 'NETWORKING'),
    ]);
    jest
      .mocked(inventoryApi.getExecutorCustody)
      .mockResolvedValue(
        custodyPage(1, 1, [
          asset('a1', 'ont-1'),
          asset('a2', 'ont-viejo'),
          asset('a3', 'mal-filtrado'),
        ]),
      );
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('available'));

    expect(result.current.assets.map((entry) => entry.id)).toEqual(['a1']);
    expect(result.current.itemOptions.map((option) => option.value)).toEqual(['ont-1']);
  });

  it('no declara vacío con una página sin coincidencias si quedan páginas: recorre todas', async () => {
    mockCatalog();
    jest
      .mocked(inventoryApi.getExecutorCustody)
      .mockResolvedValueOnce(custodyPage(1, 3, [asset('a1', 'tool-1')]))
      .mockResolvedValueOnce(custodyPage(2, 3, [asset('a2', 'tool-2')]))
      .mockResolvedValueOnce(custodyPage(3, 3, [asset('a3', 'ont-1')]));
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('available'));

    expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(3);
    expect(jest.mocked(inventoryApi.getExecutorCustody).mock.calls.map((call) => call[1])).toEqual([
      { page: 1, limit: 100 },
      { page: 2, limit: 100 },
      { page: 3, limit: 100 },
    ]);
    expect(result.current.itemOptions.map((option) => option.value)).toEqual(['ont-1']);
    expect(result.current.assets.map((entry) => entry.id)).toEqual(['a3']);
    expect(result.current.assetsMeta.hasMore).toBe(false);
  });

  it('recorre las páginas del catálogo: el ítem compatible de la segunda página sí se ofrece', async () => {
    jest
      .mocked(inventoryApi.listCategories)
      .mockResolvedValueOnce({
        data: [{ id: 'cat-otra', code: 'NETWORKING' }],
        meta: meta({ hasMore: true, nextCursor: 'c-cat-2' }),
      } as never)
      .mockResolvedValueOnce({
        data: [{ id: 'cat-CPE', code: 'CPE' }],
        meta: meta(),
      } as never);
    jest
      .mocked(inventoryApi.listItems)
      .mockResolvedValueOnce({
        data: [item('ont-1', 'CPE')],
        meta: meta({ hasMore: true, nextCursor: 'c-items-2' }),
      } as never)
      .mockResolvedValueOnce({ data: [item('ont-2', 'CPE')], meta: meta() } as never);
    jest
      .mocked(inventoryApi.getExecutorCustody)
      .mockResolvedValue(custodyPage(1, 1, [asset('a1', 'ont-2')]));
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('available'));

    expect(inventoryApi.listCategories).toHaveBeenLastCalledWith({ limit: 100, cursor: 'c-cat-2' });
    expect(inventoryApi.listItems).toHaveBeenLastCalledWith({
      status: 'ACTIVE',
      categoryId: 'cat-CPE',
      limit: 100,
      cursor: 'c-items-2',
    });
    expect(result.current.itemOptions.map((option) => option.value)).toEqual(['ont-2']);
  });

  it('con la cota de recorrido conserva la paginación y no trunca: «cargar más» continúa', async () => {
    mockCatalog();
    const getCustody = jest.mocked(inventoryApi.getExecutorCustody);
    for (let page = 1; page <= 20; page += 1) {
      getCustody.mockResolvedValueOnce(custodyPage(page, 21, [asset(`x${page}`, 'tool-1')]));
    }
    getCustody.mockResolvedValueOnce(custodyPage(21, 21, [asset('a21', 'ont-1')]));
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('available'));
    // Veinte páginas sin coincidencias no son un vacío definitivo: queda más por leer.
    expect(getCustody).toHaveBeenCalledTimes(20);
    expect(result.current.assets).toEqual([]);
    expect(result.current.assetsMeta.hasMore).toBe(true);

    await act(async () => result.current.slot.loadMore());

    expect(getCustody).toHaveBeenCalledTimes(21);
    expect(getCustody).toHaveBeenLastCalledWith('tech-001', { page: 21, limit: 100 });
    expect(result.current.assets.map((entry) => entry.id)).toEqual(['a21']);
    expect(result.current.itemOptions.map((option) => option.value)).toEqual(['ont-1']);
    expect(result.current.assetsMeta.hasMore).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('sin coincidencias en ninguna página declara el vacío disponible, sin ofrecer otra categoría', async () => {
    mockCatalog();
    jest
      .mocked(inventoryApi.getExecutorCustody)
      .mockResolvedValue(custodyPage(1, 1, [asset('a1', 'tool-1')], [balance('b1', 'tool-2')]));
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('available'));

    expect(result.current.inventoryState).toBe('available');
    expect(result.current.assets).toEqual([]);
    expect(result.current.balances).toEqual([]);
    expect(result.current.itemOptions).toEqual([]);
  });

  it('una categoría que no existe en el catálogo no ofrece nada y no consulta ítems', async () => {
    jest.mocked(inventoryApi.listCategories).mockResolvedValue({
      data: [{ id: 'cat-otra', code: 'NETWORKING' }],
      meta: meta(),
    } as never);
    jest.mocked(inventoryApi.getExecutorCustody).mockResolvedValue(custodyPage(1, 1));
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('available'));

    expect(inventoryApi.listItems).not.toHaveBeenCalled();
    expect(result.current.itemOptions).toEqual([]);
  });

  it('sin responsable asignado no consulta custodia y declara el vacío', async () => {
    const { assignee: _assignee, ...withoutAssignee } = order;
    const { result } = mount(withoutAssignee as ExecutionOrderDetailResponse);

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('available'));

    expect(inventoryApi.getExecutorCustody).not.toHaveBeenCalled();
    expect(inventoryApi.listItems).not.toHaveBeenCalled();
    expect(result.current.custodyOptions).toEqual([]);
    expect(result.current.itemOptions).toEqual([]);
  });

  it('un fallo marca custodia e inventario no disponibles y el reintento vuelve a consultar', async () => {
    mockCatalog();
    jest
      .mocked(inventoryApi.getExecutorCustody)
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValueOnce(custodyPage(1, 1, [asset('a1', 'ont-1')]));
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('unavailable'));
    expect(result.current.inventoryState).toBe('unavailable');
    expect(result.current.itemOptions).toEqual([]);
    expect(result.current.assets).toEqual([]);

    // Reintento: el mismo acto vuelve a abrirse y solo recarga custodia e inventario.
    act(() => result.current.slot.openAction(consumption));
    expect(result.current.custodyState).toBe('loading');
    await waitFor(() => expect(result.current.custodyState).toBe('available'));

    expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(2);
    expect(result.current.itemOptions.map((option) => option.value)).toEqual(['ont-1']);
  });

  it('un fallo del catálogo también deja la selección no disponible', async () => {
    jest.mocked(inventoryApi.listCategories).mockRejectedValue(new Error('catálogo caído'));
    jest.mocked(inventoryApi.getExecutorCustody).mockResolvedValue(custodyPage(1, 1));
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.inventoryState).toBe('unavailable'));
    expect(result.current.custodyState).toBe('unavailable');
  });

  it('sin conexión no lanza consultas y deja la custodia no disponible', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('unavailable'));

    expect(inventoryApi.getExecutorCustody).not.toHaveBeenCalled();
    expect(inventoryApi.listCategories).not.toHaveBeenCalled();
  });

  it('cerrar la hoja cancela la carga: la respuesta tardía no pinta nada', async () => {
    mockCatalog();
    const late = deferred<never>();
    jest.mocked(inventoryApi.getExecutorCustody).mockReturnValue(late.promise);
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1));
    act(() => result.current.slot.openAction(null));
    await act(async () => {
      late.resolve(custodyPage(1, 1, [asset('a1', 'ont-1')]));
    });

    expect(result.current.assets).toEqual([]);
    expect(result.current.itemOptions).toEqual([]);
    expect(result.current.custodyState).toBe('loading');
  });

  it('un reintento descarta la respuesta de la carga anterior', async () => {
    mockCatalog();
    const first = deferred<never>();
    jest
      .mocked(inventoryApi.getExecutorCustody)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(custodyPage(1, 1, [asset('nuevo', 'ont-1')]));
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1));
    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('available'));
    await act(async () => {
      first.resolve(custodyPage(1, 1, [asset('viejo', 'ont-1')]));
    });

    expect(result.current.assets.map((entry) => entry.id)).toEqual(['nuevo']);
  });

  it('cambio de OT: con un consumo abierto de otra orden no recarga ni aplica la respuesta anterior', async () => {
    mockCatalog();
    const late = deferred<never>();
    jest.mocked(inventoryApi.getExecutorCustody).mockReturnValue(late.promise);
    const { result } = mount();

    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1));

    // Se abre otra OT sin cerrar la anterior: el acto de consumo de la primera ya no existe.
    let apply!: () => void;
    await act(async () => {
      apply = await result.current.slot.loadOnOpen(
        Promise.resolve({ ...order, id: 'eo-002' } as ExecutionOrderDetailResponse),
      );
    });
    act(() => apply());
    await act(async () => {
      late.resolve(custodyPage(1, 1, [asset('a1', 'ont-1')]));
    });

    expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1);
    expect(result.current.assets).toEqual([]);
  });

  it('refresco de la misma OT con el consumo abierto recarga la custodia en un único lote', async () => {
    mockCatalog();
    jest
      .mocked(inventoryApi.getExecutorCustody)
      .mockResolvedValueOnce(custodyPage(1, 1, [asset('a1', 'ont-1')]))
      .mockResolvedValueOnce(custodyPage(1, 1, [asset('a1', 'ont-1'), asset('a2', 'ont-1')]));
    const { result } = mount();
    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    let apply!: () => void;
    await act(async () => {
      apply = await result.current.slot.loadOnOpen(Promise.resolve(order));
    });
    // Mientras el drawer relee la OT la selección está cargando; el resultado nuevo
    // llega completo en un único lote cuando el adaptador lo confirma.
    expect(result.current.custodyState).toBe('loading');
    expect(result.current.assets).toHaveLength(0);
    act(() => apply());

    expect(result.current.assets.map((entry) => entry.id)).toEqual(['a1', 'a2']);
    expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(2);
  });

  it('refresco con la hoja cerrada no consulta nada', async () => {
    mockCatalog();
    jest.mocked(inventoryApi.getExecutorCustody).mockResolvedValue(custodyPage(1, 1));
    const { result } = mount();
    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(result.current.custodyState).toBe('available'));
    act(() => result.current.slot.openAction(null));
    jest.mocked(inventoryApi.getExecutorCustody).mockClear();
    jest.mocked(inventoryApi.listItems).mockClear();

    let apply!: () => void;
    await act(async () => {
      apply = await result.current.slot.loadOnOpen(Promise.resolve(order));
    });
    act(() => apply());

    expect(inventoryApi.getExecutorCustody).not.toHaveBeenCalled();
    expect(inventoryApi.listItems).not.toHaveBeenCalled();
  });

  it('reset al cerrar el drawer limpia el estado y descarta lo que venga en vuelo', async () => {
    mockCatalog();
    const late = deferred<never>();
    jest.mocked(inventoryApi.getExecutorCustody).mockReturnValue(late.promise);
    const { result } = mount();
    act(() => result.current.slot.openAction(consumption));
    await waitFor(() => expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1));

    act(() => result.current.slot.reset());
    await act(async () => {
      late.resolve(custodyPage(1, 1, [asset('a1', 'ont-1')]));
    });

    expect(result.current.assets).toEqual([]);
    expect(result.current.itemOptions).toEqual([]);
    expect(result.current.custodyState).toBe('loading');
  });

  it('el objeto del slot es referencialmente estable entre renders', async () => {
    const { result, rerender } = mount();
    const first = result.current.slot;

    rerender({ current: { ...order, version: 2 } as ExecutionOrderDetailResponse });

    expect(result.current.slot).toBe(first);
  });
});
