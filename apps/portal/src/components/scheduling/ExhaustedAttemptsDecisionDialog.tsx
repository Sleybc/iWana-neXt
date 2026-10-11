'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  RadioCardGroup,
} from '@iwana/ui';
import type { VisitAttemptDecision, WfmVisitRequest } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { getVisitRequestReferenceLabel } from './pending-visits-ui';

export type ExhaustedAttemptChoice = VisitAttemptDecision;

interface ExhaustedAttemptsDecisionDialogProps {
  open: boolean;
  visitRequest: WfmVisitRequest | null;
  error?: string | null;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (decision: ExhaustedAttemptChoice, closeReason?: string) => Promise<void> | void;
}

/**
 * E5 — aviso al agotar los tres intentos imputables al cliente.
 * Ninguna opción preseleccionada; cerrar exige motivo.
 */
export function ExhaustedAttemptsDecisionDialog({
  open,
  visitRequest,
  error = null,
  isSubmitting = false,
  onOpenChange,
  onConfirm,
}: ExhaustedAttemptsDecisionDialogProps) {
  const [choice, setChoice] = useState<ExhaustedAttemptChoice | null>(null);
  const [closeReason, setCloseReason] = useState('');

  useEffect(() => {
    if (!open) {
      setChoice(null);
      setCloseReason('');
    }
  }, [open, visitRequest?.id]);

  const customerLabel =
    visitRequest?.customerDisplayName?.trim() || visitRequest?.title || 'esta solicitud';

  const canSubmit =
    choice === 'FORCE_RESCHEDULE' || (choice === 'CLOSE_CASE' && closeReason.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Se agotaron los tres intentos</DialogTitle>
          <DialogDescription>
            No se pudo hacer la visita de {customerLabel} en tres oportunidades. Decide si se
            reprograma una vez más o si el caso se cierra.
          </DialogDescription>
        </DialogHeader>

        {visitRequest ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {visitRequest.title}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {getVisitRequestReferenceLabel(visitRequest)}
              </p>
            </div>

            <RadioCardGroup
              legend="Decisión"
              name="exhausted-attempt-decision"
              value={choice}
              onChange={(value) => setChoice(value as ExhaustedAttemptChoice)}
              options={[
                {
                  value: 'FORCE_RESCHEDULE',
                  title: 'Reprogramar de todas formas',
                  description: 'Abre el despacho para elegir técnico y franja otra vez.',
                },
                {
                  value: 'CLOSE_CASE',
                  title: 'Cerrar el caso',
                  description: 'Cierra la solicitud. Debes indicar el motivo.',
                },
              ]}
            />

            {choice === 'CLOSE_CASE' ? (
              <div className="space-y-2">
                <label
                  htmlFor="exhausted-close-reason"
                  className="text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Motivo del cierre
                </label>
                <textarea
                  id="exhausted-close-reason"
                  value={closeReason}
                  onChange={(event) => setCloseReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Indica por qué se cierra el caso"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-white"
                />
              </div>
            ) : null}

            {error ? (
              <PortalAlert
                variant="error"
                title="No fue posible aplicar la decisión"
                description={error}
              />
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!canSubmit || isSubmitting}
                onClick={() => {
                  if (!choice) {
                    return;
                  }
                  void onConfirm(choice, choice === 'CLOSE_CASE' ? closeReason.trim() : undefined);
                }}
              >
                {isSubmitting ? 'Aplicando…' : 'Confirmar decisión'}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
