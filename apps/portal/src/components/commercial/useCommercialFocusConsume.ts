'use client';

/**
 * Helpers compartidos del módulo Comercial (Wave 3 — DRY mínimo).
 * Evita duplicar el consumo de deep-link `focus` en managers/paneles.
 */

import { useEffect, useRef } from 'react';

type FocusConsumeOptions<T> = {
  focusId: string | null | undefined;
  isLoading: boolean;
  items: T[];
  getId: (item: T) => string;
  onMatch: (item: T) => void;
  onFocusConsumed?: (() => void) | undefined;
};

/**
 * Cuando llega un `focusId` válido y el listado ya cargó, ejecuta `onMatch` una vez
 * y notifica consumo (limpia query). Si no hay match, igual consume el focus.
 */
export function useCommercialFocusConsume<T>({
  focusId,
  isLoading,
  items,
  getId,
  onMatch,
  onFocusConsumed,
}: FocusConsumeOptions<T>): void {
  const consumedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusId || isLoading) {
      return;
    }

    if (consumedRef.current === focusId) {
      return;
    }

    consumedRef.current = focusId;
    const match = items.find((item) => getId(item) === focusId);
    if (match) {
      onMatch(match);
    }
    onFocusConsumed?.();
  }, [focusId, getId, isLoading, items, onFocusConsumed, onMatch]);
}
