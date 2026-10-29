'use client';

import { useEffect, useState } from 'react';
import type { DataPurpose } from '@iwana/shared';
import { privacyApi } from '@/lib/api-client';

export function useEnabledPurposes() {
  const [enabled, setEnabled] = useState<DataPurpose[]>([]);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    void privacyApi
      .listPurposes()
      .then((items) => {
        if (active) setEnabled(items.filter((item) => item.enabled).map((item) => item.purpose));
      })
      .catch(() => {
        if (active) {
          setEnabled([]);
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return { enabled, failed, retry: () => setRetry((value) => value + 1) };
}
