import { applySort } from './apply-sort';

type FakeQb = {
  alias: string;
  orderByCalls: Array<{ field: string; dir: string }>;
  addOrderByCalls: Array<{ field: string; dir: string }>;
  orderBy: (field: string, dir: 'ASC' | 'DESC') => FakeQb;
  addOrderBy: (field: string, dir: 'ASC' | 'DESC') => FakeQb;
};

function createFakeQb(alias: string): FakeQb {
  const qb: FakeQb = {
    alias,
    orderByCalls: [],
    addOrderByCalls: [],
    orderBy(field, dir) {
      this.orderByCalls.push({ field, dir });
      return this;
    },
    addOrderBy(field, dir) {
      this.addOrderByCalls.push({ field, dir });
      return this;
    },
  };
  return qb;
}

describe('applySort', () => {
  const sortableFields = ['createdAt', 'displayName'];

  it('no modifica el QB ni reporta sort si sortBy está vacío', () => {
    const qb = createFakeQb('p');
    const result = applySort(qb as never, sortableFields, undefined, 'asc');
    expect(result).toEqual({ appliedSortBy: null, appliedSortDir: null });
    expect(qb.orderByCalls).toHaveLength(0);
    expect(qb.addOrderByCalls).toHaveLength(0);
  });

  it('no modifica el QB si sortBy no está en la lista blanca', () => {
    const qb = createFakeQb('st');
    const result = applySort(qb as never, sortableFields, 'secretField', 'desc');
    expect(result).toEqual({ appliedSortBy: null, appliedSortDir: null });
    expect(qb.orderByCalls).toHaveLength(0);
  });

  it('resuelve el nombre lógico con qb.alias (ADR-065 §18)', () => {
    const qb = createFakeQb('st');
    const result = applySort(qb as never, sortableFields, 'createdAt', 'desc');
    expect(result).toEqual({ appliedSortBy: 'createdAt', appliedSortDir: 'desc' });
    expect(qb.orderByCalls).toEqual([{ field: 'st.createdAt', dir: 'DESC' }]);
    expect(qb.addOrderByCalls).toEqual([{ field: 'st.id', dir: 'DESC' }]);
  });

  it('usa dir=asc por defecto y desempata por id con el mismo dir', () => {
    const qb = createFakeQb('task');
    const result = applySort(qb as never, sortableFields, 'displayName', undefined);
    expect(result).toEqual({ appliedSortBy: 'displayName', appliedSortDir: 'asc' });
    expect(qb.orderByCalls).toEqual([{ field: 'task.displayName', dir: 'ASC' }]);
    expect(qb.addOrderByCalls).toEqual([{ field: 'task.id', dir: 'ASC' }]);
  });

  it('permite idAlias distinto del default', () => {
    const qb = createFakeQb('s');
    applySort(qb as never, ['name'], 'name', 'asc', 'subscriber_id');
    expect(qb.addOrderByCalls).toEqual([{ field: 's.subscriber_id', dir: 'ASC' }]);
  });

  it('con lista blanca vacía nunca aplica orden (Ola 1)', () => {
    const qb = createFakeQb('p');
    const result = applySort(qb as never, [], 'createdAt', 'asc');
    expect(result).toEqual({ appliedSortBy: null, appliedSortDir: null });
    expect(qb.orderByCalls).toHaveLength(0);
  });
});
