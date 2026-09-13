// apps/portal/src/components/operations/execution-order-collections.spec.ts
// Spec puro migrado desde OperationsClient.spec.tsx (D-A2, split F2): solo
// cambia el import — las aserciones son idénticas.
import {
  collectExecutionOrderCollectionPages,
  loadMoreExecutionOrderCollection,
  normalizeExecutionOrderCollection,
  normalizeExecutionOrderEvidence,
} from './execution-order-collections';

describe('execution-order-collections', () => {
  it('normaliza evidencias ausentes a una colección vacía', () => {
    expect(normalizeExecutionOrderEvidence(null)).toEqual([]);
    expect(normalizeExecutionOrderEvidence(undefined)).toEqual([]);
    expect(normalizeExecutionOrderEvidence({ data: [] })).toEqual([]);
  });

  it('normaliza colecciones de operaciones tanto planas como paginadas', () => {
    const row = { id: 'activity-001' };

    expect(normalizeExecutionOrderCollection([row])).toEqual([row]);
    expect(
      normalizeExecutionOrderCollection({
        data: [row],
        meta: { page: 1, limit: 25, total: 1 },
      }),
    ).toEqual([row]);
  });

  it('concatena páginas posteriores de actividades y conserva el total', async () => {
    const calls: Array<{ page: number; limit: number }> = [];
    const result = await collectExecutionOrderCollectionPages(
      async (page, limit) => {
        calls.push({ page, limit });
        return page === 1
          ? {
              data: [{ id: 'activity-001' }],
              meta: {
                page: 1,
                limit,
                total: 2,
                totalIsEstimate: false,
                totalPages: 2,
                nextCursor: null,
                hasMore: true,
                mode: 'page' as const,
                capabilities: { randomAccess: true, sortableFields: [] },
                sort: null,
              },
            }
          : {
              data: [{ id: 'activity-002' }],
              meta: {
                page: 2,
                limit,
                total: 2,
                totalIsEstimate: false,
                totalPages: 2,
                nextCursor: null,
                hasMore: false,
                mode: 'page' as const,
                capabilities: { randomAccess: true, sortableFields: [] },
                sort: null,
              },
            };
      },
      { limit: 1, maxPages: 5 },
    );

    expect(calls).toEqual([
      { page: 1, limit: 1 },
      { page: 2, limit: 1 },
    ]);
    expect(result.data).toEqual([{ id: 'activity-001' }, { id: 'activity-002' }]);
    expect(result.meta.total).toBe(2);
    expect(result.meta.hasMore).toBe(false);
  });

  it('deja visible el total y hasMore cuando alcanza la cota de páginas', async () => {
    const result = await collectExecutionOrderCollectionPages(
      async (page, limit) => ({
        data: [{ id: `activity-${page}` }],
        meta: {
          page,
          limit,
          total: 3,
          totalIsEstimate: false,
          totalPages: 3,
          nextCursor: null,
          hasMore: true,
          mode: 'page' as const,
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      }),
      { limit: 1, maxPages: 2 },
    );

    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(3);
    expect(result.meta.hasMore).toBe(true);
  });

  it('carga la página siguiente cuando hasMore mantiene datos pendientes visibles', async () => {
    const fetchPage = jest.fn().mockResolvedValue({
      data: [{ id: 'activity-002' }],
      meta: {
        page: 21,
        limit: 1,
        total: 2,
        totalIsEstimate: false,
        totalPages: 21,
        nextCursor: null,
        hasMore: false,
        mode: 'page' as const,
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });

    const result = await loadMoreExecutionOrderCollection(
      fetchPage,
      {
        page: 20,
        limit: 1,
        total: 2,
        totalIsEstimate: false,
        totalPages: 21,
        nextCursor: null,
        hasMore: true,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
      1,
    );

    expect(fetchPage).toHaveBeenCalledWith(21, 1);
    expect(result.data).toEqual([{ id: 'activity-002' }]);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.total).toBe(2);
  });
});
