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
import { SubscriberStatus } from '@iwana/shared';
import { ALLOWED_TRANSITIONS, SUBSCRIBER_STATUS_OPTIONS } from './subscriber-ui';

interface SubscriberStatusTransitionDialogProps {
  currentStatus: SubscriberStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransition: (targetStatus: SubscriberStatus, reason?: string) => Promise<void>;
}

export function SubscriberStatusTransitionDialog({
  currentStatus,
  open,
  onOpenChange,
  onTransition,
}: SubscriberStatusTransitionDialogProps) {
  const [targetStatus, setTargetStatus] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar estado</DialogTitle>
          <DialogDescription>
            Selecciona un estado destino permitido para el suscriptor y documenta la razón cuando
            aplique.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Select
            id="subscriber-target-status"
            label="Estado destino"
            className="h-11"
            value={targetStatus}
            onChange={(event) => setTargetStatus(event.target.value)}
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
                try {
                  await onTransition(targetStatus as SubscriberStatus, reason.trim() || undefined);
                  onOpenChange(false);
                  setTargetStatus('');
                  setReason('');
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
