import { renderHook, act } from '@testing-library/react';
import { useTableQueryState } from './use-table-query-state';

const pushMock = jest.fn();
const replaceMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => '/dashboard/crm/subscribers',
  useSearchParams: () => searchParamsMock,
}));

describe('useTableQueryState', () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    searchParamsMock = new URLSearchParams();
  });

  it('hidrata page/size/sort desde la URL', () => {
    searchParamsMock = new URLSearchParams('page=3&size=50&sortBy=name&sortDir=asc');
    const { result } = renderHook(() => useTableQueryState());
    expect(result.current.page).toBe(3);
    expect(result.current.pageSize).toBe(50);
    expect(result.current.sort).toEqual({ by: 'name', dir: 'asc' });
  });

  it('corrige page no numérica o <=0 a 1', () => {
    searchParamsMock = new URLSearchParams('page=abc');
    const { result } = renderHook(() => useTableQueryState());
    expect(result.current.page).toBe(1);
  });

  it('hace push al cambiar de página', () => {
    searchParamsMock = new URLSearchParams('page=1&search=ana');
    const { result } = renderHook(() => useTableQueryState({ filterKeys: ['search'] }));

    act(() => {
      result.current.setPage(2);
    });

    expect(pushMock).toHaveBeenCalledTimes(1);
    const href = String(pushMock.mock.calls[0]?.[0]);
    const params = new URLSearchParams(href.split('?')[1] ?? '');
    expect(params.get('page')).toBe('2');
    expect(params.get('search')).toBe('ana');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('hace replace y resetea página al cambiar filtros o tamaño', () => {
    searchParamsMock = new URLSearchParams('page=4&size=10');
    const { result } = renderHook(() => useTableQueryState({ filterKeys: ['search'] }));

    act(() => {
      result.current.setFilters({ search: 'ana' });
    });

    expect(replaceMock).toHaveBeenCalled();
    const href = String(replaceMock.mock.calls[0]?.[0]);
    expect(href).toContain('search=ana');
    expect(href).not.toContain('page=');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('resetea solo la página y conserva filtros no modificados y parámetros ajenos', () => {
    searchParamsMock = new URLSearchParams(
      'page=4&size=50&search=ana&status=ACTIVE&tab=usuarios&tenantView=compact',
    );
    const { result } = renderHook(() => useTableQueryState({ filterKeys: ['search', 'status'] }));

    act(() => {
      result.current.setFilters({ status: 'SUSPENDED' });
    });

    const href = String(replaceMock.mock.calls[0]?.[0]);
    const params = new URLSearchParams(href.split('?')[1] ?? '');
    expect(params.get('page')).toBeNull();
    expect(params.get('search')).toBe('ana');
    expect(params.get('status')).toBe('SUSPENDED');
    expect(params.get('size')).toBe('50');
    expect(params.get('tab')).toBe('usuarios');
    expect(params.get('tenantView')).toBe('compact');
  });

  it('hidrata el tamaño y hace replace al cambiarlo', () => {
    searchParamsMock = new URLSearchParams('page=4&size=10');
    const { result } = renderHook(() => useTableQueryState());

    expect(result.current.pageSize).toBe(10);

    act(() => {
      result.current.setPageSize(50);
    });

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const href = String(replaceMock.mock.calls[0]?.[0]);
    const params = new URLSearchParams(href.split('?')[1] ?? '');
    expect(params.get('size')).toBe('50');
    expect(params.get('page')).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('hace replace y resetea página al ordenar', () => {
    searchParamsMock = new URLSearchParams('page=5');
    const { result } = renderHook(() => useTableQueryState());

    act(() => {
      result.current.setSort({ by: 'name', dir: 'asc' });
    });

    const href = String(replaceMock.mock.calls[0]?.[0]);
    expect(href).toContain('sortBy=name');
    expect(href).toContain('sortDir=asc');
    expect(href).not.toContain('page=');
  });

  it('limpia sortBy y sortDir al quitar el orden, conserva filtros y usa replace', () => {
    searchParamsMock = new URLSearchParams(
      'page=3&size=10&sortBy=name&sortDir=desc&search=ana&view=table',
    );
    const { result } = renderHook(() => useTableQueryState({ filterKeys: ['search'] }));

    act(() => {
      result.current.setSort(null);
    });

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const href = String(replaceMock.mock.calls[0]?.[0]);
    const params = new URLSearchParams(href.split('?')[1] ?? '');
    expect(params.get('sortBy')).toBeNull();
    expect(params.get('sortDir')).toBeNull();
    expect(params.get('page')).toBeNull();
    expect(params.get('size')).toBe('10');
    expect(params.get('search')).toBe('ana');
    expect(params.get('view')).toBe('table');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('soporta namespace para params', () => {
    searchParamsMock = new URLSearchParams('items.page=2&tab=items');
    const { result } = renderHook(() => useTableQueryState({ namespace: 'items' }));
    expect(result.current.page).toBe(2);

    act(() => {
      result.current.setPage(3);
    });

    expect(pushMock).toHaveBeenCalledTimes(1);
    const href = String(pushMock.mock.calls[0]?.[0]);
    const params = new URLSearchParams(href.split('?')[1] ?? '');
    expect(params.get('items.page')).toBe('3');
    expect(params.get('tab')).toBe('items');
  });

  it('conserva la misma referencia de sort si by/dir no cambian', () => {
    searchParamsMock = new URLSearchParams('sortBy=name&sortDir=asc');
    const { result, rerender } = renderHook(() => useTableQueryState());
    const first = result.current.sort;

    rerender();

    expect(result.current.sort).toBe(first);
  });
});
