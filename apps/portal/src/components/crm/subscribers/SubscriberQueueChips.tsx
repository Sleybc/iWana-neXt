'use client';

import { useEffect, useRef } from 'react';
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
  const railRef = useRef<HTMLDivElement | null>(null);
  const selectedChipRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    const activeChip = selectedChipRef.current;
    if (!rail || !activeChip) return;

    const railRect = rail.getBoundingClientRect();
    const chipRect = activeChip.getBoundingClientRect();
    if (chipRect.left < railRect.left) {
      rail.scrollLeft -= railRect.left - chipRect.left;
    } else if (chipRect.right > railRect.right) {
      rail.scrollLeft += chipRect.right - railRect.right;
    }
  }, [counts, error, loading, selected]);

  const chips = (
    <div
      role="group"
      className="flex w-max flex-nowrap gap-2 md:w-auto md:flex-wrap"
      aria-label="Colas de trabajo"
    >
      {SUBSCRIBER_QUEUE_OPTIONS.map((queue) => {
        const count = error ? undefined : counts?.[queue.countKey];
        const pressed = selected === queue.value;

        return (
          <Button
            key={queue.value}
            ref={pressed ? selectedChipRef : undefined}
            type="button"
            variant={pressed ? 'primary' : 'outline'}
            {...(count === undefined
              ? { 'aria-label': queue.label }
              : {
                  'aria-label': `${queue.label}, ${count} ${count === 1 ? 'suscriptor' : 'suscriptores'}`,
                })}
            aria-pressed={pressed}
            onClick={() => onSelect(queue.value)}
            className="min-h-11 shrink-0 rounded-full px-4"
          >
            <span>{queue.label}</span>
            {count !== undefined ? (
              <span className="tabular-nums" aria-hidden="true">
                {count}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      {error ? (
        <PortalAlert
          variant="error"
          title="No pudimos cargar los conteos de las colas"
          description="Intenta de nuevo en unos minutos."
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetry}
              className="min-h-11 md:min-h-8"
            >
              Reintentar conteos
            </Button>
          }
        />
      ) : null}

      {loading || (!counts && !error) ? (
        <div aria-busy="true" className="space-y-2">
          <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
            Cargando conteos de las colas…
          </p>
          <div
            ref={railRef}
            data-subscriber-queue-rail=""
            className="overflow-x-auto overscroll-x-contain md:overflow-x-visible"
          >
            <div className="flex w-max flex-nowrap gap-2 md:w-auto md:flex-wrap" aria-hidden="true">
              {SUBSCRIBER_QUEUE_OPTIONS.map((queue) => (
                <PortalSkeletonBlock
                  key={queue.value}
                  className="h-11 w-36 shrink-0 rounded-full"
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={railRef}
          data-subscriber-queue-rail=""
          className="overflow-x-auto overscroll-x-contain md:overflow-x-visible"
        >
          {chips}
        </div>
      )}
    </div>
  );
}
