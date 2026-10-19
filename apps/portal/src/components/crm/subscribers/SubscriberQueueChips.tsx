'use client';

import { Button } from '@iwana/ui';
import type { SubscriberQueueCounts } from '@iwana/shared';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';

export const SUBSCRIBER_QUEUE_OPTIONS = [
  { value: 'active', label: 'Activos', countKey: 'active' },
  { value: 'suspended', label: 'Suspendidos', countKey: 'suspended' },
  { value: 'contactPending', label: 'Contacto pendiente', countKey: 'contactPending' },
  { value: 'fiscalIncomplete', label: 'Datos fiscales incompletos', countKey: 'fiscalIncomplete' },
  {
    value: 'withoutLiveServices',
    label: 'Sin servicios vigentes',
    countKey: 'withoutLiveServices',
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  countKey: keyof SubscriberQueueCounts;
}>;

export type SubscriberQueueKey = (typeof SUBSCRIBER_QUEUE_OPTIONS)[number]['value'];

interface SubscriberQueueChipsProps {
  counts: SubscriberQueueCounts | null;
  loading: boolean;
  error: boolean;
  selected: SubscriberQueueKey | null;
  onSelect: (queue: SubscriberQueueKey) => void;
  onRetry: () => void;
}

export function SubscriberQueueChips({
  counts,
  loading,
  error,
  selected,
  onSelect,
  onRetry,
}: SubscriberQueueChipsProps) {
  if (error) {
    return (
      <div className="space-y-3">
        <PortalAlert
          variant="error"
          title="No pudimos cargar los conteos de las colas"
          description="Intenta de nuevo en unos minutos."
          action={
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              Reintentar conteos
            </Button>
          }
        />
        <div role="group" className="flex flex-wrap gap-2" aria-label="Colas de trabajo">
          {SUBSCRIBER_QUEUE_OPTIONS.map((queue) => (
            <Button
              key={queue.value}
              type="button"
              variant={selected === queue.value ? 'primary' : 'outline'}
              aria-pressed={selected === queue.value}
              onClick={() => onSelect(queue.value)}
              className="min-h-11 rounded-full px-4"
            >
              {queue.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (loading || !counts) {
    return (
      <div aria-busy="true" className="space-y-2">
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          Cargando conteos de las colas…
        </p>
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          {SUBSCRIBER_QUEUE_OPTIONS.map((queue) => (
            <PortalSkeletonBlock key={queue.value} className="h-11 w-36 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div role="group" className="flex flex-wrap gap-2" aria-label="Colas de trabajo">
      {SUBSCRIBER_QUEUE_OPTIONS.map((queue) => {
        const count = counts[queue.countKey];
        const pressed = selected === queue.value;

        return (
          <Button
            key={queue.value}
            type="button"
            variant={pressed ? 'primary' : 'outline'}
            aria-label={`${queue.label}, ${count} ${count === 1 ? 'suscriptor' : 'suscriptores'}`}
            aria-pressed={pressed}
            onClick={() => onSelect(queue.value)}
            className="min-h-11 rounded-full px-4"
          >
            <span>{queue.label}</span>
            <span className="tabular-nums" aria-hidden="true">
              {count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
