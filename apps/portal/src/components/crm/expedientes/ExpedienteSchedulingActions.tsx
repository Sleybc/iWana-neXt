'use client';

import { Button } from '@iwana/ui';
import type { VisitRequestNextAction } from '@/components/scheduling/visit-request-origin-orchestration';
import { PortalAlert } from '@/components/shared/portal-ui';
import { useCrmVisitRequestAction } from './useCrmVisitRequestAction';

export function ExpedienteSchedulingActions(props: {
  expedienteId: string;
  customerLabel: string;
  municipality?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const { error, isSubmitting, submit: submitVisitRequest } = useCrmVisitRequestAction();

  const submit = async (nextAction: VisitRequestNextAction) => {
    await submitVisitRequest(props, nextAction);
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
        <Button type="button" loading={isSubmitting} onClick={() => void submit('schedule-now')}>
          Agendar ahora
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={isSubmitting}
          onClick={() => void submit('send-to-pending')}
        >
          Enviar a pendientes
        </Button>
      </div>
    </div>
  );
}
