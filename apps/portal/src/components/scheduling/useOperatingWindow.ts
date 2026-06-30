'use client';

import { useEffect, useState } from 'react';
import { WfmWorkType } from '@iwana/shared';
import { ApiError, wfmApi, type WfmOperatingWindowResult } from '@/lib/api-client';

interface UseOperatingWindowInput {
  workType?: WfmWorkType | null | undefined;
  dateLocal?: string | null | undefined;
  organizationSiteId?: string | null | undefined;
  technicianId?: string | null | undefined;
  enabled?: boolean | undefined;
}

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'No fue posible resolver la ventana operativa.';
}

export function getOperatingWindowMessage(window: WfmOperatingWindowResult | null): string | null {
  if (!window) {
    return null;
  }

  if (window.status === 'OPEN' && window.startTime && window.endTime) {
    return `Ventana operativa vigente: ${window.startTime} a ${window.endTime}.`;
  }

  return (
    window.reason ??
    {
      HOLIDAY_BLACKOUT: 'La fecha seleccionada está cerrada por festivo o cierre especial.',
      SITE_HOURS: 'La sede operativa está cerrada para la fecha seleccionada.',
      COMPANY_HOURS: 'La empresa está cerrada para la fecha seleccionada.',
      MISSING_CONFIGURATION:
        'No existe una configuración operativa vigente para la fecha seleccionada.',
    }[window.source]
  );
}

export function useOperatingWindow({
  workType,
  dateLocal,
  organizationSiteId,
  technicianId,
  enabled = true,
}: UseOperatingWindowInput) {
  const [operatingWindow, setOperatingWindow] = useState<WfmOperatingWindowResult | null>(null);
  const [isLoadingOperatingWindow, setIsLoadingOperatingWindow] = useState(false);
  const [operatingWindowError, setOperatingWindowError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || workType !== WfmWorkType.INSTALLATION || !dateLocal) {
      setOperatingWindow(null);
      setOperatingWindowError(null);
      setIsLoadingOperatingWindow(false);
      return;
    }

    let cancelled = false;
    setIsLoadingOperatingWindow(true);
    setOperatingWindowError(null);

    void wfmApi.operatingWindow
      .resolve({
        dateLocal,
        organizationSiteId: organizationSiteId ?? undefined,
        technicianId: technicianId ?? undefined,
      })
      .then((result) => {
        if (!cancelled) {
          setOperatingWindow(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOperatingWindow(null);
          setOperatingWindowError(mapError(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingOperatingWindow(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dateLocal, enabled, organizationSiteId, technicianId, workType]);

  return {
    operatingWindow,
    isLoadingOperatingWindow,
    operatingWindowError,
  };
}

export function useDailyDisplayOperatingWindow({
  dateLocal,
  organizationSiteId,
  enabled = true,
}: {
  dateLocal?: string | null;
  organizationSiteId?: string | null;
  enabled?: boolean;
}) {
  const [operatingWindow, setOperatingWindow] = useState<WfmOperatingWindowResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !dateLocal) {
      setOperatingWindow(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void wfmApi.operatingWindow
      .resolve({
        dateLocal,
        organizationSiteId: organizationSiteId ?? undefined,
      })
      .then((result) => {
        if (!cancelled) {
          setOperatingWindow(result);
        }
      })
      .catch((resolveError: unknown) => {
        if (!cancelled) {
          setOperatingWindow(null);
          setError(mapError(resolveError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dateLocal, enabled, organizationSiteId]);

  return {
    operatingWindow,
    isLoadingOperatingWindow: isLoading,
    operatingWindowError: error,
  };
}
