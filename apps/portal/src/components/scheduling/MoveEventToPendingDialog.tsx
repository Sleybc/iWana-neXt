'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, CircleAlert } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import type { WfmScheduleEvent } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { formatWfmDateRange } from './scheduling-ui';

interface MoveEventToPendingDialogProps {
  open: boolean;
  event: WfmScheduleEvent | null;
  error: string | null;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string | null) => Promise<void>;
}

export function MoveEventToPendingDialog({
  open,
  event,
  error,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: MoveEventToPendingDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) {
      setReason('');
    }
  }, [open, event?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Mover a pendientes</DialogTitle>
          <DialogDescription>
            Saca el evento de la agenda visible para que el equipo lo reprograme desde pendientes.
          </DialogDescription>
        </DialogHeader>

        {event ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{event.title}</p>
              <p className="mt-2 flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                <CalendarClock className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                <span>{formatWfmDateRange(event.scheduledStartAt, event.scheduledEndAt)}</span>
              </p>
              <p className="mt-3 flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                <CircleAlert className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                <span>
                  La visita volverá al flujo de pendientes. Úsalo cuando la franja actual ya no
                  sirva o falte confirmar una nueva ventana con el cliente.
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="move-to-pending-reason"
                className="text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Motivo opcional
              </label>
              <textarea
                id="move-to-pending-reason"
                value={reason}
                onChange={(eventChange) => setReason(eventChange.target.value)}
                rows={4}
                maxLength={200}
                placeholder="Ejemplo: cliente pidió nueva ventana, falta validar acceso o el técnico no podrá cubrir la franja."
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Este texto se enviará como contexto de retorno a pendientes.
              </p>
            </div>

            {error ? (
              <PortalAlert
                variant="error"
                title="No fue posible mover el evento"
                description={error}
              />
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                loading={isSubmitting}
                onClick={() => onConfirm(reason.trim() || null)}
              >
                Confirmar movimiento
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
