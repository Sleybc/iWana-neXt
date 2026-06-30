'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@iwana/ui';
import { createCrmVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import type { VisitRequestNextAction } from '@/components/scheduling/visit-request-origin-orchestration';
import { PortalAlert } from '@/components/shared/portal-ui';
import { ApiError } from '@/lib/api-client';

export function ExpedienteSchedulingActions(props: {
  expedienteId: string;
  customerLabel: string;
  municipality?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (nextAction: VisitRequestNextAction) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const input = {
        expedienteId: props.expedienteId,
        customerLabel: props.customerLabel,
        nextAction,
      } as Parameters<typeof createCrmVisitRequestAndRoute>[0];

      if (props.municipality) {
        input.municipality = props.municipality;
      }
      if (props.address) {
        input.address = props.address;
      }
      if (props.latitude != null && props.longitude != null) {
        input.latitude = props.latitude;
        input.longitude = props.longitude;
      }

      const result = await createCrmVisitRequestAndRoute(input);

      router.push(result.href);
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError('No fue posible crear la solicitud de visita. Intenta de nuevo.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <PortalAlert
          variant="error"
          title="No fue posible coordinar la visita"
          description={error}
        />
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={isSubmitting} onClick={() => void submit('schedule-now')}>
          Agendar ahora
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isSubmitting}
          onClick={() => void submit('send-to-pending')}
        >
          Enviar a pendientes
        </Button>
      </div>
    </div>
  );
}
