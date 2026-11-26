'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Tras «Reintentar», el botón desaparece mientras carga y el foco caería en `body`.
 * Al terminar la carga lo lleva al encabezado de los resultados o, si vuelve a fallar, al aviso.
 */
export function useRetryFocus<
  R extends HTMLElement = HTMLElement,
  E extends HTMLElement = HTMLElement,
>(busy: boolean, failed: boolean) {
  const phase = useRef<'idle' | 'requested' | 'busy'>('idle');
  const resultsRef = useRef<R>(null);
  const errorRef = useRef<E>(null);

  useEffect(() => {
    if (phase.current === 'requested' && busy) {
      phase.current = 'busy';
    } else if (phase.current === 'busy' && !busy) {
      phase.current = 'idle';
      (failed ? errorRef : resultsRef).current?.focus();
    }
  }, [busy, failed]);

  const track = useCallback(
    (retry: () => void) => () => {
      phase.current = 'requested';
      retry();
    },
    [],
  );

  return { track, resultsRef, errorRef };
}
