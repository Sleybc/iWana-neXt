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
});
