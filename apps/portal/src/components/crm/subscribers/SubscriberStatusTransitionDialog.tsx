'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import { ApiError } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { SubscriberStatus, type SubscriberFiscalMissingField } from '@iwana/shared';
import { ALLOWED_TRANSITIONS, SUBSCRIBER_STATUS_OPTIONS } from './subscriber-ui';
import { FiscalDataIncompleteAlert } from './FiscalDataIncompleteAlert';
import { readFiscalDataIncompleteError } from './subscriber-fiscal';

interface SubscriberStatusTransitionDialogProps {
  currentStatus: SubscriberStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddContact: () => void;
  onCompleteFiscalData?: () => void;
  onTransition: (targetStatus: SubscriberStatus, reason?: string) => Promise<void>;
}

export function SubscriberStatusTransitionDialog({
  currentStatus,
  open,
  onOpenChange,
  onAddContact,
  onCompleteFiscalData,
  onTransition,
}: SubscriberStatusTransitionDialogProps) {
  const [targetStatus, setTargetStatus] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [contactRequired, setContactRequired] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [fiscalMissing, setFiscalMissing] = useState<SubscriberFiscalMissingField[] | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setContactRequired(false);
      setTransitionError(null);
      setFiscalMissing(null);
    }
    onOpenChange(nextOpen);
  };

  const allowedOptions = useMemo(
    () =>
      SUBSCRIBER_STATUS_OPTIONS.filter((option) =>
        ALLOWED_TRANSITIONS[currentStatus].includes(option.value),
      ),
    [currentStatus],
  );

  const requiresReason =
    targetStatus === SubscriberStatus.SUSPENDED || targetStatus === SubscriberStatus.CANCELLED;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar estado</DialogTitle>
          <DialogDescription>
            Selecciona un estado destino permitido para el suscriptor y documenta la razón cuando
            aplique.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {transitionError && (
            <PortalAlert
              variant="error"
              title="No fue posible cambiar el estado"
              description={transitionError}
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
          <Select
            id="subscriber-target-status"
            label="Estado destino"
            className="h-11"
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

          <Input
            label="Razón"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motivo de la transición"
            className="h-11"
          />

          <div className="flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={!targetStatus || (requiresReason && !reason.trim()) || submitting}
              onClick={async () => {
                setSubmitting(true);
                setContactRequired(false);
                setTransitionError(null);
                setFiscalMissing(null);
                try {
                  await onTransition(targetStatus as SubscriberStatus, reason.trim() || undefined);
                  handleOpenChange(false);
                  setTargetStatus('');
                  setReason('');
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
                  } else {
                    setTransitionError(
                      'No fue posible completar la transición. Inténtalo de nuevo.',
                    );
                  }
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? 'Aplicando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
