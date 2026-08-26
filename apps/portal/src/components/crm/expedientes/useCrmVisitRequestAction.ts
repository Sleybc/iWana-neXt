'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCrmVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import type { VisitRequestNextAction } from '@/components/scheduling/visit-request-origin-orchestration';
import { getSafeCrmErrorMessage } from './crm-error-message';
import {
  invalidateExpedienteFieldWorkCache,
  resolveExpedienteCacheScope,
} from './expediente-detail-cache';

export interface CrmVisitRequestContext {
  expedienteId: string;
  tenantScope?: string;
  customerLabel: string;
  municipality?: string | null;
  address?: string | null;
  sector?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CrmVisitRequestSubmitOptions {
  isAdditional?: boolean;
  additionalReason?: string | null;
}

export function useCrmVisitRequestAction() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (
    context: CrmVisitRequestContext,
    nextAction: VisitRequestNextAction,
    options?: CrmVisitRequestSubmitOptions,
  ) => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const input = {
        expedienteId: context.expedienteId,
        customerLabel: context.customerLabel,
        nextAction,
      } as Parameters<typeof createCrmVisitRequestAndRoute>[0];

      if (context.municipality) {
        input.municipality = context.municipality;
      }
      if (context.address) {
        input.address = context.address;
      }
      if (context.sector) {
        input.sector = context.sector;
      }
      if (context.latitude != null && context.longitude != null) {
        input.latitude = context.latitude;
        input.longitude = context.longitude;
      }
      if (options?.isAdditional) {
        input.isAdditional = true;
        input.additionalReason = options.additionalReason ?? null;
      }

      const result = await createCrmVisitRequestAndRoute(input);
      invalidateExpedienteFieldWorkCache(
        context.tenantScope ?? resolveExpedienteCacheScope(),
        context.expedienteId,
      );
      router.push(result.href);
    } catch (submitError) {
      setError(
        getSafeCrmErrorMessage(
          submitError,
          'No fue posible coordinar la visita de instalación. Intenta de nuevo.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return { error, isSubmitting, submit };
}
