'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';

interface PortalDiscardChangesDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PortalDiscardChangesDialog({
  open,
  title = 'Descartar cambios',
  description = 'Tienes cambios sin guardar. Si cierras ahora, se perderán.',
  onConfirm,
  onCancel,
}: PortalDiscardChangesDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <p className="portal-eyebrow">Confirmación</p>
          <DialogTitle className="mt-1">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Seguir editando
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Descartar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
