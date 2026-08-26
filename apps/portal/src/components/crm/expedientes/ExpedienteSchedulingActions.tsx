'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@iwana/ui';
import type {
  CrmInstallationFieldWork,
  VisitRequestNextAction,
} from '@/components/scheduling/visit-request-origin-orchestration';
import { PortalAlert } from '@/components/shared/portal-ui';
import { useCrmInstallationFieldWork } from './useCrmInstallationFieldWork';
import { useCrmVisitRequestAction } from './useCrmVisitRequestAction';

function formatFieldWorkDateTime(value: string | null): { date: string; time: string } | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    date: parsed.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    time: parsed.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function buildFieldWorkCopy(fieldWork: CrmInstallationFieldWork): {
  title: string;
  body: string;
  primaryLabel: string;
} | null {
  if (fieldWork.kind === 'none') {
    return null;
  }

  const formatted = formatFieldWorkDateTime(fieldWork.scheduledStartAt);

  if (fieldWork.kind === 'scheduled') {
    return {
      title: 'Visita ya coordinada',
      body: formatted
        ? `La instalación quedó agendada para el ${formatted.date} a las ${formatted.time}.`
        : 'La instalación ya tiene una visita coordinada en la agenda.',
      primaryLabel: 'Ver la visita agendada',
    };
  }

  if (fieldWork.kind === 'in_progress') {
    return {
      title: 'Visita en curso',
      body: formatted
        ? `La instalación está en ejecución desde el ${formatted.date}.`
        : 'La instalación ya está en ejecución en campo.',
      primaryLabel: 'Ver la visita en curso',
    };
  }

  return {
    title: 'Solicitud en bandeja',
    body: 'Ya hay una solicitud de instalación en la bandeja de pendientes.',
    primaryLabel: 'Abrir en pendientes',
  };
}

export function ExpedienteSchedulingActions(props: {
  expedienteId: string;
  tenantScope?: string;
  customerLabel: string;
  municipality?: string | null;
  address?: string | null;
  sector?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const router = useRouter();
  const {
    fieldWork,
    isLoading: isFieldWorkLoading,
    error: fieldWorkError,
    load: loadFieldWork,
  } = useCrmInstallationFieldWork(props.expedienteId, false, props.tenantScope);
  const { error, isSubmitting, submit: submitVisitRequest } = useCrmVisitRequestAction();
  const [additionalMode, setAdditionalMode] = useState(false);
  const [additionalReason, setAdditionalReason] = useState('');
  const [additionalValidationError, setAdditionalValidationError] = useState<string | null>(null);
  const [isPreparingFieldWork, setIsPreparingFieldWork] = useState(false);

  const submit = async (
    nextAction: VisitRequestNextAction,
    options?: { isAdditional?: boolean; additionalReason?: string | null },
  ) => {
    if (isPreparingFieldWork || isSubmitting) {
      return;
    }

    setIsPreparingFieldWork(true);
    try {
      if (fieldWork.kind === 'none') {
        try {
          const resolvedFieldWork = await loadFieldWork();
          if (resolvedFieldWork.kind !== 'none') {
            return;
          }
        } catch {
          return;
        }
      }

      await submitVisitRequest(props, nextAction, options);
    } finally {
      setIsPreparingFieldWork(false);
    }
  };

  const copy = buildFieldWorkCopy(fieldWork);
  const combinedError = error ?? fieldWorkError ?? additionalValidationError;

  if (isFieldWorkLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p className="text-sm text-sky-800 dark:text-sky-200">
          Consultando visitas de instalación…
        </p>
      </div>
    );
  }

  if (copy && !additionalMode) {
    return (
      <div className="space-y-3">
        {combinedError && (
          <PortalAlert
            variant="error"
            title="No fue posible coordinar la visita"
            description={combinedError}
          />
        )}
        <div className="rounded-2xl border border-sky-200 bg-white/80 px-4 py-3 dark:border-sky-900/40 dark:bg-dark-surface-2/80">
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">{copy.title}</p>
          <p className="mt-1 text-sm text-sky-800 dark:text-sky-200">{copy.body}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={!fieldWork.href}
              onClick={() => {
                if (fieldWork.href) {
                  router.push(fieldWork.href);
                }
              }}
            >
              {copy.primaryLabel}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdditionalMode(true)}>
              Coordinar otra visita
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (copy && additionalMode) {
    return (
      <div className="space-y-3">
        {combinedError && (
          <PortalAlert
            variant="error"
            title="No fue posible coordinar la visita"
            description={combinedError}
          />
        )}
        <div className="rounded-2xl border border-sky-200 bg-white/80 px-4 py-3 dark:border-sky-900/40 dark:bg-dark-surface-2/80">
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
            Coordinar otra visita
          </p>
          <p className="mt-1 text-sm text-sky-800 dark:text-sky-200">
            Indica el motivo de esta visita adicional. Se creará una solicitud nueva sobre el
            trabajo ya existente.
          </p>
          <div className="mt-3 space-y-2">
            <label
              htmlFor="crm-additional-visit-reason"
              className="block text-sm font-medium text-sky-900 dark:text-sky-100"
            >
              Motivo de la segunda visita
            </label>
            <textarea
              id="crm-additional-visit-reason"
              value={additionalReason}
              maxLength={200}
              rows={3}
              onChange={(event) => {
                setAdditionalReason(event.target.value);
                setAdditionalValidationError(null);
              }}
              placeholder="Describe por qué se necesita otra visita"
              className="flex w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-iwana-primary focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 dark:border-sky-900/40 dark:bg-dark-surface-3 dark:text-gray-200"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              loading={isSubmitting || isPreparingFieldWork}
              onClick={() => {
                const trimmed = additionalReason.trim();
                if (!trimmed) {
                  setAdditionalValidationError('Indica el motivo de la visita adicional.');
                  return;
                }
                void submit('schedule-now', {
                  isAdditional: true,
                  additionalReason: trimmed,
                });
              }}
            >
              Agendar de todas formas
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => {
                setAdditionalMode(false);
                setAdditionalReason('');
                setAdditionalValidationError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {combinedError && (
        <PortalAlert
          variant="error"
          title="No fue posible coordinar la visita"
          description={combinedError}
        />
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="button" loading={isSubmitting} onClick={() => void submit('schedule-now')}>
          Agendar ahora
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={isSubmitting || isPreparingFieldWork}
          onClick={() => void submit('send-to-pending')}
        >
          Enviar a pendientes
        </Button>
      </div>
    </div>
  );
}
