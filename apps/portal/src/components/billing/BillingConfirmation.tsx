'use client';

import { useId, useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';
import { billingInputClass, useBillingMutation } from './billing-ui';

export function BillingConfirmation({
  title,
  description,
  confirm,
  onClose,
  onConfirm,
  reasons,
}: {
  title: string;
  description: string;
  confirm: string;
  onClose: () => void;
  onConfirm: (key: string, reason: string, note: string) => Promise<unknown>;
  reasons?: Record<string, string>;
}) {
  const mutation = useBillingMutation();
  const id = useId();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    void mutation.run({ reason, note }, (key) => onConfirm(key, reason, note), onClose);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {reasons ? (
            <>
              <label className="block space-y-1 text-sm" htmlFor={`${id}-reason`}>
                <span>Motivo de anulación</span>
                <select
                  id={`${id}-reason`}
                  className={billingInputClass}
                  required
                  disabled={mutation.busy}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                >
                  <option value="">Selecciona un motivo</option>
                  {Object.entries(reasons).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm" htmlFor={`${id}-note`}>
                <span>Observación o nota adicional</span>
                <textarea
                  id={`${id}-note`}
                  className={billingInputClass}
                  maxLength={500}
                  disabled={mutation.busy}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </>
          ) : null}
          {mutation.error ? <PortalAlert variant="error" title={mutation.error} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              className="min-h-11"
              type="button"
              variant="secondary"
              disabled={mutation.busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              className="min-h-11"
              type="submit"
              variant={reasons ? 'destructive' : 'primary'}
              loading={mutation.busy}
              disabled={mutation.busy || (!!reasons && !reason)}
            >
              {confirm}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
