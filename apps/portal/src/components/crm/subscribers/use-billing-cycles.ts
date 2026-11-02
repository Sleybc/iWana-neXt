'use client';

import { useCallback, useEffect, useState } from 'react';
import { billingCyclesApi } from '@/lib/api-client';
import type { BillingCycleOption } from '@/lib/api-client';

interface BillingCyclesState {
  cycles: BillingCycleOption[];
  loading: boolean;
  error: boolean;
}

/** Carga el catálogo activo por consumidor; no persiste fechas ni conserva caché entre sesiones. */
export function useBillingCycles(): BillingCyclesState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BillingCyclesState>({
    cycles: [],
    loading: true,
    error: false,
  });

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setState((current) => ({ ...current, loading: true, error: false }));
      try {
        const cycles = await billingCyclesApi.list();
        if (!cancelled) setState({ cycles, loading: false, error: false });
      } catch {
        if (!cancelled) setState({ cycles: [], loading: false, error: true });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, retry };
}
