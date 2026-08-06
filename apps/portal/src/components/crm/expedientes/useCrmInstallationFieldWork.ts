'use client';

import { useEffect, useState } from 'react';
import {
  resolveCrmInstallationFieldWork,
  type CrmInstallationFieldWork,
} from '@/components/scheduling/visit-request-origin-orchestration';

const EMPTY_FIELD_WORK: CrmInstallationFieldWork = {
  kind: 'none',
  visitRequestId: null,
  scheduleEventId: null,
  activeEventStatus: null,
  scheduledStartAt: null,
  assignedUserId: null,
  href: null,
};

export function useCrmInstallationFieldWork(expedienteId: string | null | undefined) {
  const [fieldWork, setFieldWork] = useState<CrmInstallationFieldWork>(EMPTY_FIELD_WORK);
  const [isLoading, setIsLoading] = useState(Boolean(expedienteId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expedienteId) {
      setFieldWork(EMPTY_FIELD_WORK);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void resolveCrmInstallationFieldWork(expedienteId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setFieldWork(result);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setFieldWork(EMPTY_FIELD_WORK);
        setError('No fue posible consultar el estado de la visita de instalación.');
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [expedienteId]);

  return { fieldWork, isLoading, error };
}
