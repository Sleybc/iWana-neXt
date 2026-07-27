import {
  EMPTY_INVENTORY_LIST_META,
  drainInventoryBalances,
  formatInventoryResultsLabel,
  inventoryHasMore,
  mergeById,
  PICKER_SOFT_CAP,
} from './inventory-list-pagination';

describe('inventory-list-pagination', () => {
  it('formatInventoryResultsLabel: hasMore → cargados de total', () => {
    expect(
      formatInventoryResultsLabel({
        loaded: 20,
        total: 55,
        hasMore: true,
        singular: 'producto',
        plural: 'productos',
      }),
    ).toBe('20 de 55 productos');
  });

  it('formatInventoryResultsLabel: completo → total recurso', () => {
    expect(
      formatInventoryResultsLabel({
        loaded: 3,
        total: 3,
        hasMore: false,
        singular: 'bodega',
        plural: 'bodegas',
      }),
    ).toBe('3 bodegas');
  });

  it('inventoryHasMore solo con nextCursor', () => {
    expect(inventoryHasMore(EMPTY_INVENTORY_LIST_META)).toBe(false);
    expect(
      inventoryHasMore({
        ...EMPTY_INVENTORY_LIST_META,
        nextCursor: 'abc',
        total: 40,
        hasMore: true,
      }),
    ).toBe(true);
  });

  it('mergeById appends without duplicating ids', () => {
    const previous = [{ id: 'a' }, { id: 'b' }];
    const next = [{ id: 'b' }, { id: 'c' }];
    expect(mergeById(previous, next)).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('PICKER_SOFT_CAP documenta excepción ADR-064', () => {
    expect(PICKER_SOFT_CAP).toBe(100);
  });

  it('drainInventoryBalances recorre cursor hasta null', async () => {
    const listBalances = jest
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: 'b1' }, { id: 'b2' }],
        meta: { ...EMPTY_INVENTORY_LIST_META, nextCursor: 'c1', total: 3 },
      })
      .mockResolvedValueOnce({
        data: [{ id: 'b3' }],
        meta: { ...EMPTY_INVENTORY_LIST_META, nextCursor: null, total: 3 },
      });

    const result = await drainInventoryBalances(listBalances, { pageSize: 2, maxPages: 5 });

    expect(listBalances).toHaveBeenCalledTimes(2);
    expect(listBalances).toHaveBeenNthCalledWith(1, { limit: 2 });
    expect(listBalances).toHaveBeenNthCalledWith(2, { limit: 2, cursor: 'c1' });
    expect(result.data.map((row) => row.id)).toEqual(['b1', 'b2', 'b3']);
    expect(result.truncated).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('drainInventoryBalances marca truncated al tope', async () => {
    const listBalances = jest.fn().mockResolvedValue({
      data: [{ id: 'b1' }],
      meta: { ...EMPTY_INVENTORY_LIST_META, nextCursor: 'next', total: 99 },
    });

    const result = await drainInventoryBalances(listBalances, { pageSize: 1, maxPages: 2 });

    expect(listBalances).toHaveBeenCalledTimes(2);
    expect(result.truncated).toBe(true);
    expect(result.meta.nextCursor).toBe('next');
    expect(result.data).toHaveLength(2);
  });
});
