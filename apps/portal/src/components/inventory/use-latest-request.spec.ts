import { renderHook } from '@testing-library/react';
import { useLatestRequest } from './use-latest-request';

describe('useLatestRequest', () => {
  it('solo la última petición es vigente y termina la espera', () => {
    const { result } = renderHook(() => useLatestRequest());
    const first = result.current.begin();
    const second = result.current.begin();

    expect(first.isCurrent()).toBe(false);
    expect(first.end()).toBe(false);
    expect(result.current.isPending()).toBe(true);

    expect(second.isCurrent()).toBe(true);
    expect(second.end()).toBe(true);
    expect(result.current.isPending()).toBe(false);
  });

  it('conserva su identidad entre renders y no comparte estado entre instancias', () => {
    const { result, rerender } = renderHook(() => useLatestRequest());
    const other = renderHook(() => useLatestRequest());
    const initial = result.current;
    initial.begin();
    rerender();

    expect(result.current).toBe(initial);
    expect(other.result.current.isPending()).toBe(false);
  });
});
