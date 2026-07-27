'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { createCrmVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import type { VisitRequestNextAction } from '@/components/scheduling/visit-request-origin-orchestration';

export interface CrmVisitRequestContext {
  expedienteId: string;
  customerLabel: string;
  municipality?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function useCrmVisitRequestAction() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (context: CrmVisitRequestContext, nextAction: VisitRequestNextAction) => {
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
      if (context.latitude != null && context.longitude != null) {
        input.latitude = context.latitude;
        input.longitude = context.longitude;
      }

      const result = await createCrmVisitRequestAndRoute(input);
      router.push(result.href);
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'No fue posible coordinar la visita de instalación. Intenta de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return { error, isSubmitting, submit };
}
