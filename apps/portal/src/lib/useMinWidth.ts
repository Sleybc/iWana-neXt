'use client';

import { useEffect, useState } from 'react';

/**
 * Corte responsive por ancho mínimo (fuente única DRY S2.1, deuda SPEC S2 §9:
 * antes duplicado en `StockIssueComposer` y `PurchaseRequestComposer`). Sin
 * `matchMedia` (SSR o jsdom sin mock) asume escritorio para no colapsar el
 * layout operativo.
 */
export function useMinWidth(minWidth: number): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setMatches(true);
      return;
    }

    const mediaQuery = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [minWidth]);

  return matches;
}
