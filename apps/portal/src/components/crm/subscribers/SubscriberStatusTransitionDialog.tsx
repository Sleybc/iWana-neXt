'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
} from '@iwana/ui';
import { ApiError } from '@/lib/api-client';
import { PortalAlert, portalTextareaClassName } from '@/components/shared/portal-ui';
import {
  SubscriberStatus,
  type SubscriberFiscalMissingField,
  type TransitionStatusPayload,
} from '@iwana/shared';
import { ALLOWED_TRANSITIONS, SUBSCRIBER_STATUS_OPTIONS } from './subscriber-ui';
import { cancellationReasonOptions } from './subscriber-lifecycle-ui';
import { FiscalDataIncompleteAlert } from './FiscalDataIncompleteAlert';
import { readFiscalDataIncompleteError } from './subscriber-fiscal';

interface SubscriberStatusTransitionDialogProps {
  currentStatus: SubscriberStatus;
  mode?: 'advance' | 'cancel';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddContact: () => void;
  onCompleteFiscalData?: () => void;
  onGoToServices?: () => void;
  onTransition: (payload: TransitionStatusPayload) => Promise<void>;
}

export function SubscriberStatusTransitionDialog({
  currentStatus,
  mode = 'advance',
  open,
  onOpenChange,
  onAddContact,
  onCompleteFiscalData,
  onGoToServices = () => undefined,
  onTransition,
}: SubscriberStatusTransitionDialogProps) {
  const [targetStatus, setTargetStatus] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [contactRequired, setContactRequired] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [liveContractsConflict, setLiveContractsConflict] = useState(false);
  const [fiscalMissing, setFiscalMissing] = useState<SubscriberFiscalMissingField[] | null>(null);

  useEffect(() => {
    if (!open) {
      setTargetStatus('');
      setReasonCode('');
      setNote('');
      setContactRequired(false);
      setTransitionError(null);
      setLiveContractsConflict(false);
      setFiscalMissing(null);
    }
  }, [open]);

  const allowedOptions = useMemo(
    () =>
      SUBSCRIBER_STATUS_OPTIONS.filter((option) =>
        ALLOWED_TRANSITIONS[currentStatus].includes(option.value),
      ),
    [currentStatus],
  );
  const isCancelling = mode === 'cancel';
  const canSubmit = isCancelling ? Boolean(reasonCode) : Boolean(targetStatus);

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setContactRequired(false);
    setTransitionError(null);
    setLiveContractsConflict(false);
    setFiscalMissing(null);
    try {
      if (isCancelling) {
        await onTransition({
          targetStatus: SubscriberStatus.CANCELLED,
          reasonCode: reasonCode as Extract<
            TransitionStatusPayload,
            { targetStatus: SubscriberStatus.CANCELLED }
          >['reasonCode'],
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      } else {
        await onTransition({
          targetStatus: targetStatus as Extract<
            TransitionStatusPayload,
            { reason?: string }
          >['targetStatus'],
        });
      }
      onOpenChange(false);
    } catch (error) {
      const missing = readFiscalDataIncompleteError(error);
      if (missing) {
        setFiscalMissing(missing);
      } else if (
        error instanceof ApiError &&
        error.status === 422 &&
        error.code === 'SUBSCRIBER_CONTACT_REQUIRED'
      ) {
        setContactRequired(true);
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'SUBSCRIBER_HAS_LIVE_CONTRACTS'
      ) {
        setLiveContractsConflict(true);
      } else {
        setTransitionError(
          error instanceof ApiError
            ? error.message
            : 'No fue posible completar la transición. Inténtalo de nuevo.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCancelling ? 'Cancelar suscriptor' : 'Cambiar estado'}</DialogTitle>
          <DialogDescription>
            {isCancelling
              ? 'La cancelación no termina los servicios. Elige el motivo para registrar el cambio.'
              : 'Selecciona un estado destino permitido para el suscriptor y documenta la razón cuando aplique.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {transitionError && (
            <PortalAlert
              variant="error"
              live="assertive"
              title="No fue posible cambiar el estado"
              description={transitionError}
            />
          )}
          {liveContractsConflict && (
            <PortalAlert
              variant="error"
              live="assertive"
              title="No fue posible cancelar al suscriptor"
              description="No puedes cancelar al suscriptor mientras tenga servicios vigentes. Termínalos primero."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => {
                    handleOpenChange(false);
                    onGoToServices();
                  }}
                >
                  Ir a servicios
                </Button>
              }
            />
          )}
          {fiscalMissing && (
            <FiscalDataIncompleteAlert
              missing={fiscalMissing}
              onComplete={
                onCompleteFiscalData
                  ? () => {
                      handleOpenChange(false);
                      onCompleteFiscalData();
                    }
                  : undefined
              }
            />
          )}
          {contactRequired && (
            <PortalAlert
              variant="warning"
              title="Contacto pendiente"
              description="Para activar el servicio, registra al menos un teléfono o un correo del suscriptor."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => {
                    handleOpenChange(false);
                    onAddContact();
                  }}
                >
                  Agregar contacto
                </Button>
              }
            />
          )}

          {isCancelling ? (
            <>
              <Select
                id="subscriber-cancellation-reason"
                label="Motivo *"
                required
                aria-required="true"
                className="min-h-11"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                options={cancellationReasonOptions()}
              >
                <option value="">Selecciona un motivo</option>
              </Select>
              <div className="space-y-1">
                <label
                  htmlFor="subscriber-cancellation-note"
                  className="block text-sm font-medium text-gray-800 dark:text-gray-100"
                >
                  Nota (opcional)
                </label>
                <textarea
                  id="subscriber-cancellation-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Agrega un detalle para el historial."
                  className={portalTextareaClassName}
                  aria-describedby="subscriber-cancellation-note-count"
                />
                <p
                  id="subscriber-cancellation-note-count"
                  className="text-right text-xs text-gray-500 dark:text-gray-400"
                >
                  {note.length}/500 caracteres
                </p>
              </div>
            </>
          ) : (
            <>
              <Select
                id="subscriber-target-status"
                label="Estado destino"
                className="min-h-11"
                value={targetStatus}
                onChange={(event) => {
                  setTargetStatus(event.target.value);
                  setContactRequired(false);
                  setTransitionError(null);
                  setFiscalMissing(null);
                }}
                options={allowedOptions}
              >
                <option value="">Selecciona</option>
              </Select>
            </>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="min-h-11"
              loading={submitting}
              disabled={!canSubmit || submitting}
              onClick={() => void submit()}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
