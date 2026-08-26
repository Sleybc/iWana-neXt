'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolveCrmInstallationFieldWork,
  type CrmInstallationFieldWork,
} from '@/components/scheduling/visit-request-origin-orchestration';
import {
  getCachedExpedienteResource,
  resolveExpedienteCacheScope,
} from './expediente-detail-cache';

const EMPTY_FIELD_WORK: CrmInstallationFieldWork = {
  kind: 'none',
  visitRequestId: null,
  scheduleEventId: null,
  activeEventStatus: null,
  scheduledStartAt: null,
  assignedUserId: null,
  href: null,
};

export function useCrmInstallationFieldWork(
  expedienteId: string | null | undefined,
  enabled = false,
  tenantScope?: string,
) {
  const [fieldWork, setFieldWork] = useState<CrmInstallationFieldWork>(EMPTY_FIELD_WORK);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const requestRef = useRef<Promise<CrmInstallationFieldWork> | null>(null);
  const resolvedTenantScope = tenantScope ?? resolveExpedienteCacheScope();

  useEffect(() => {
    requestGenerationRef.current += 1;
    requestRef.current = null;
    setFieldWork(EMPTY_FIELD_WORK);
    setIsLoading(false);
    setError(null);
  }, [expedienteId, resolvedTenantScope]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    (force = false): Promise<CrmInstallationFieldWork> => {
      if (!expedienteId) {
        return Promise.resolve(EMPTY_FIELD_WORK);
      }

      if (!force && requestRef.current) {
        return requestRef.current;
      }

      const requestedId = expedienteId;
      const requestedScope = resolvedTenantScope;
      const requestedGeneration = ++requestGenerationRef.current;
      const isCurrentRequest = () =>
        mountedRef.current &&
        requestGenerationRef.current === requestedGeneration &&
        requestedId === expedienteId &&
        requestedScope === resolvedTenantScope;

      setIsLoading(true);
      setError(null);

      let request: Promise<CrmInstallationFieldWork>;
      request = getCachedExpedienteResource(
        requestedScope,
        `field-work:${requestedId}`,
        () => resolveCrmInstallationFieldWork(requestedId),
        force,
      )
        .then((result) => {
          if (isCurrentRequest()) {
            setFieldWork(result);
          }
          return result;
        })
        .catch((requestError: unknown) => {
          if (isCurrentRequest()) {
            setFieldWork(EMPTY_FIELD_WORK);
            setError('No fue posible consultar el estado de la visita de instalación.');
          }
          throw requestError;
        })
        .finally(() => {
          if (isCurrentRequest()) {
            setIsLoading(false);
          }
        });
      requestRef.current = request;
      void request.then(
        () => {
          if (requestRef.current === request) {
            requestRef.current = null;
          }
        },
        () => {
          if (requestRef.current === request) {
            requestRef.current = null;
          }
        },
      );
      return request;
    },
    [expedienteId, resolvedTenantScope],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void load().catch(() => undefined);
  }, [enabled, load]);

  return { fieldWork, isLoading, error, load };
}
