'use client';

import { useCallback, useMemo } from 'react';
import type { BillingAccountStatement } from '@iwana/shared';
import { billingApi } from '@/lib/api-client';
import { useBillingLoad } from './billing-ui';

/** Una sola carga del estado de cuenta por ficha, compartida por Vista general y Facturación. */
export function useSubscriberStatement(subscriberId: string, enabled: boolean) {
  const load = useCallback(
    (): Promise<BillingAccountStatement | null> =>
      enabled && subscriberId ? billingApi.statement(subscriberId) : Promise.resolve(null),
    [subscriberId, enabled],
  );
  const { data, error, loading, reload } = useBillingLoad(load);
  // Objeto estable entre renders: la ficha lo usa como dependencia de sus pestañas.
  return useMemo(() => ({ data, error, loading, reload }), [data, error, loading, reload]);
}

export type SubscriberStatementLoad = ReturnType<typeof useSubscriberStatement>;
