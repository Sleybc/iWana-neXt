/**
 * Hook extraído `useSerializedAssetDetail` (spec 2026-11-16 equipos del suscriptor, CA-6): lo
 * comparten Inventario y la ficha del suscriptor. Fija cómo se abren, paginan y fusionan las
 * secciones del drawer y cómo se expone el error que Inventario muestra como
 * «No fue posible abrir el activo».
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { inventoryApi, type SerializedAssetDetailRecord } from '@/lib/api-client';
import {
  ASSET_DETAIL_QUERY_DEFAULTS,
  useSerializedAssetDetail,
} from './use-serialized-asset-detail';

type Lifecycle = SerializedAssetDetailRecord['lifecycle'];
type Movements = SerializedAssetDetailRecord['movements'];

function detail(
  overrides: {
    id?: string;
    lifecycle?: Partial<Lifecycle>;
    movements?: Partial<Movements>;
    serialNumber?: string;
  } = {},
): SerializedAssetDetailRecord {
  return {
    id: overrides.id ?? 'asset-1',
    serialNumber: overrides.serialNumber ?? 'SN-0001',
    lifecycle: {
      data: [{ id: 'evt-1' }],
      total: 3,
      page: 1,
      limit: 1,
      ...overrides.lifecycle,
    },
    movements: {
      data: [{ id: 'mov-1' }],
      total: 2,
      page: 1,
      limit: 1,
      ...overrides.movements,
    },
  } as unknown as SerializedAssetDetailRecord;
}

const mapError = (error: unknown) => `Texto propio: ${(error as Error).message}`;

describe('useSerializedAssetDetail', () => {
  afterEach(() => jest.restoreAllMocks());

  it('open: pide la primera página de cada sección y expone el detalle', async () => {
    const getAsset = jest.spyOn(inventoryApi, 'getAsset').mockResolvedValue(detail());
    const { result } = renderHook(() => useSerializedAssetDetail(mapError));

    await act(async () => {
      await result.current.open('asset-1');
    });

    expect(getAsset).toHaveBeenCalledWith('asset-1', ASSET_DETAIL_QUERY_DEFAULTS);
    expect(result.current.targetId).toBe('asset-1');
    expect(result.current.detail?.serialNumber).toBe('SN-0001');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loadMoreLifecycle: pide la página siguiente del ciclo de vida y la agrega sin tocar movimientos', async () => {
    const getAsset = jest
      .spyOn(inventoryApi, 'getAsset')
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(
        detail({
          lifecycle: { data: [{ id: 'evt-2' }] as Lifecycle['data'], page: 2 },
          movements: { data: [{ id: 'mov-otra-pagina' }] as Movements['data'] },
        }),
      );
    const { result } = renderHook(() => useSerializedAssetDetail(mapError));
    await act(async () => {
      await result.current.open('asset-1');
    });

    await act(async () => {
      await result.current.loadMoreLifecycle();
    });

    expect(getAsset).toHaveBeenLastCalledWith('asset-1', {
      lifecyclePage: 2,
      lifecycleLimit: 1,
      movementsPage: 1,
      movementsLimit: 1,
    });
    expect(result.current.detail?.lifecycle.data.map((row) => row.id)).toEqual(['evt-1', 'evt-2']);
    expect(result.current.detail?.lifecycle.page).toBe(2);
    expect(result.current.detail?.movements.data.map((row) => row.id)).toEqual(['mov-1']);
    expect(result.current.isLoadingMoreLifecycle).toBe(false);
  });

  it('loadMoreMovements: pide la página siguiente de movimientos y la agrega sin tocar el ciclo de vida', async () => {
    const getAsset = jest
      .spyOn(inventoryApi, 'getAsset')
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(
        detail({
          lifecycle: { data: [{ id: 'evt-otra-pagina' }] as Lifecycle['data'] },
          movements: { data: [{ id: 'mov-2' }] as Movements['data'], page: 2 },
        }),
      );
    const { result } = renderHook(() => useSerializedAssetDetail(mapError));
    await act(async () => {
      await result.current.open('asset-1');
    });

    await act(async () => {
      await result.current.loadMoreMovements();
    });

    expect(getAsset).toHaveBeenLastCalledWith('asset-1', {
      lifecyclePage: 1,
      lifecycleLimit: 1,
      movementsPage: 2,
      movementsLimit: 1,
    });
    expect(result.current.detail?.movements.data.map((row) => row.id)).toEqual(['mov-1', 'mov-2']);
    expect(result.current.detail?.lifecycle.data.map((row) => row.id)).toEqual(['evt-1']);
    expect(result.current.isLoadingMoreMovements).toBe(false);
  });

  it('descarta una página que llega para otro activo', async () => {
    jest
      .spyOn(inventoryApi, 'getAsset')
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(
        detail({ id: 'asset-otro', lifecycle: { data: [{ id: 'evt-x' }] as Lifecycle['data'] } }),
      );
    const { result } = renderHook(() => useSerializedAssetDetail(mapError));
    await act(async () => {
      await result.current.open('asset-1');
    });
    await act(async () => {
      await result.current.loadMoreLifecycle();
    });
    expect(result.current.detail?.id).toBe('asset-1');
    expect(result.current.detail?.lifecycle.data.map((row) => row.id)).toEqual(['evt-1']);
  });

  it('sin detalle abierto, «Ver más» no llama a la API', async () => {
    const getAsset = jest.spyOn(inventoryApi, 'getAsset');
    const { result } = renderHook(() => useSerializedAssetDetail(mapError));
    await act(async () => {
      await result.current.loadMoreLifecycle();
      await result.current.loadMoreMovements();
    });
    expect(getAsset).not.toHaveBeenCalled();
  });

  it('error al abrir: expone el texto de quien lo usa (aviso «No fue posible abrir el activo») y no deja el drawer abierto', async () => {
    jest.spyOn(inventoryApi, 'getAsset').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useSerializedAssetDetail(mapError));

    await act(async () => {
      await result.current.open('asset-1');
    });

    expect(result.current.error).toBe('Texto propio: boom');
    expect(result.current.targetId).toBeNull();
    expect(result.current.detail).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('error en una página: conserva el detalle cargado y expone el error', async () => {
    jest
      .spyOn(inventoryApi, 'getAsset')
      .mockResolvedValueOnce(detail())
      .mockRejectedValueOnce(new Error('page'));
    const { result } = renderHook(() => useSerializedAssetDetail(mapError));
    await act(async () => {
      await result.current.open('asset-1');
    });
    await act(async () => {
      await result.current.loadMoreMovements();
    });
    expect(result.current.error).toBe('Texto propio: page');
    expect(result.current.detail?.movements.data.map((row) => row.id)).toEqual(['mov-1']);
    expect(result.current.targetId).toBe('asset-1');
  });

  it('un nuevo open limpia el error anterior; close cierra el drawer', async () => {
    jest
      .spyOn(inventoryApi, 'getAsset')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(detail());
    const { result } = renderHook(() => useSerializedAssetDetail(mapError));
    await act(async () => {
      await result.current.open('asset-1');
    });
    expect(result.current.error).not.toBeNull();
    await act(async () => {
      await result.current.open('asset-1');
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.targetId).toBe('asset-1');

    act(() => result.current.close());
    expect(result.current.targetId).toBeNull();
    expect(result.current.detail).toBeNull();
  });
});
