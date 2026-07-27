import {
  EMPTY_LIST_META,
  collectListPages,
  emptyPageListMeta,
  listPageWindow,
  normalizeListMeta,
} from './list-meta';

describe('normalizeListMeta', () => {
  it('rellena defaults desde envelope legacy nextCursor+total', () => {
    const meta = normalizeListMeta({ nextCursor: 'abc', total: 40 }, { dataLength: 20 });
    expect(meta.nextCursor).toBe('abc');
    expect(meta.total).toBe(40);
    expect(meta.hasMore).toBe(true);
    expect(meta.mode).toBe('cursor');
    expect(meta.capabilities.randomAccess).toBe(false);
    expect(meta.page).toBeNull();
  });

  it('deriva totalPages en modo page', () => {
    const meta = normalizeListMeta({
      page: 2,
      limit: 20,
      total: 45,
      nextCursor: null,
      hasMore: true,
      mode: 'page',
      capabilities: { randomAccess: true, sortableFields: ['name'] },
      sort: { by: 'name', dir: 'asc' },
      totalIsEstimate: false,
      totalPages: null,
    });
    expect(meta.totalPages).toBe(3);
    expect(meta.capabilities.sortableFields).toEqual(['name']);
  });

  it('EMPTY_LIST_META es cursor vacío', () => {
    expect(EMPTY_LIST_META.hasMore).toBe(false);
    expect(EMPTY_LIST_META.total).toBe(0);
  });
});

describe('listPageWindow', () => {
  it('calcula from/to 1-based', () => {
    expect(listPageWindow({ page: 2, limit: 20, total: 45 })).toEqual({ from: 21, to: 40 });
  });

  it('acota la última página parcial', () => {
    expect(listPageWindow({ page: 3, limit: 20, total: 45 })).toEqual({ from: 41, to: 45 });
  });

  it('devuelve 0-0 sin resultados', () => {
    expect(listPageWindow({ page: 1, limit: 20, total: 0 })).toEqual({ from: 0, to: 0 });
  });
});

describe('collectListPages', () => {
  type Row = { id: string };

  it('acumula páginas ListResponse hasta hasMore=false', async () => {
    const fetchPage = jest.fn(
      async (
        page: number,
      ): Promise<{ data: Row[]; meta: ReturnType<typeof emptyPageListMeta> }> => {
        if (page === 1) {
          return {
            data: [{ id: 'a' }, { id: 'b' }],
            meta: emptyPageListMeta({ page: 1, limit: 2, total: 3, totalPages: 2, hasMore: true }),
          };
        }
        return {
          data: [{ id: 'c' }],
          meta: emptyPageListMeta({ page: 2, limit: 2, total: 3, totalPages: 2, hasMore: false }),
        };
      },
    );

    const result = await collectListPages<Row>(fetchPage, { maxPages: 10, limit: 2 });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2);
    expect(result.data.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.total).toBe(3);
  });

  it('no trata el envelope crudo como array (falla si data falta)', async () => {
    const fetchPage = jest.fn(
      async (
        _page: number,
      ): Promise<{ data: Row[]; meta: ReturnType<typeof emptyPageListMeta> }> => ({
        data: [{ id: 'ok' }],
        meta: emptyPageListMeta({ page: 1, limit: 10, total: 1, totalPages: 1, hasMore: false }),
      }),
    );

    const result = await collectListPages<Row>(fetchPage, { limit: 10 });
    expect(Array.isArray(result)).toBe(false);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('ok');
  });
});
