import { renderHook } from '@testing-library/react';
import { useMinWidth } from './useMinWidth';

describe('useMinWidth (hook compartido S2.1)', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it('refleja la coincidencia del media query', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: true,
        media: '',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });

    const { result } = renderHook(() => useMinWidth(768));
    expect(result.current).toBe(true);
  });

  it('sin matchMedia asume escritorio para no colapsar el layout', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useMinWidth(768));
    expect(result.current).toBe(true);
  });
});
