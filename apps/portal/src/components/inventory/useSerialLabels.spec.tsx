import { act, renderHook, waitFor } from '@testing-library/react';
import { inventoryApi } from '@/lib/api-client';
import { useSerialLabels } from './useSerialLabels';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      getAsset: jest.fn(),
    },
  };
});

const getAssetMock = inventoryApi.getAsset as jest.Mock;

describe('useSerialLabels (S2.1 C2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAssetMock.mockImplementation((id: string) =>
      Promise.resolve({ serialNumber: `SN-${id}`, assetTag: null }),
    );
  });

  it('hidrata una vez por activo y no se autorreejecuta al fusionar', async () => {
    const lines = [{ serializedAssetIds: ['asset-1', 'asset-2'], serializedAssetId: 'asset-1' }];
    const { result, rerender } = renderHook(({ current }) => useSerialLabels(current), {
      initialProps: { current: lines },
    });

    await waitFor(() => {
      expect(result.current.serialLabelsById).toEqual({
        'asset-1': 'SN-asset-1',
        'asset-2': 'SN-asset-2',
      });
    });
    expect(getAssetMock).toHaveBeenCalledTimes(2);

    // La fusión no genera pendientes nuevos: sin llamadas extra.
    rerender({ current: lines });
    await waitFor(() => {
      expect(getAssetMock).toHaveBeenCalledTimes(2);
    });
  });

  it('lo fusionado desde el panel no se vuelve a pedir', async () => {
    const { result } = renderHook(() => useSerialLabels([]));

    act(() => {
      result.current.mergeSerialLabels({ 'asset-9': 'SN-009' });
    });
    expect(result.current.serialLabelsById).toEqual({ 'asset-9': 'SN-009' });
    expect(getAssetMock).not.toHaveBeenCalled();
  });

  it('degrada al rótulo corto cuando la hidratación falla', async () => {
    getAssetMock.mockRejectedValueOnce(new Error('Fallo de red'));
    const { result } = renderHook(() =>
      useSerialLabels([{ serializedAssetIds: ['asset-x'], serializedAssetId: 'asset-x' }]),
    );

    await waitFor(() => {
      expect(result.current.serialLabelsById).toEqual({ 'asset-x': 'ASSET-X' });
    });
  });
});
