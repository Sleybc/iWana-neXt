'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';

export interface ConfirmDialogProps {
  open: boolean;
  /** Título corto de la acción a confirmar. */
  title: string;
  /** Descripción del efecto de la acción (qué pasa si se confirma). */
  description: ReactNode;
  /** Etiqueta del botón destructivo. */
  confirmLabel?: string;
  /** Etiqueta de la acción segura. */
  cancelLabel?: string;
  /**
   * Confirmación tipada: texto exacto que la persona debe escribir para
   * habilitar el botón destructivo (p. ej. el nombre de la empresa).
   */
  confirmationText?: string;
  /** Etiqueta del campo de confirmación tipada. */
  confirmationLabel?: ReactNode;
  /** Estado de carga mientras la acción confirmada está en curso. */
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo único de confirmación destructiva de la consola de plataforma.
 * Construido sobre `Dialog` de `@iwana/ui` (foco atrapado, Escape, scroll-lock).
 * Cancelar es la acción segura por defecto: recibe el foco inicial salvo que
 * exista confirmación tipada, en cuyo caso el foco va al campo de texto
 * (el botón destructivo permanece deshabilitado hasta que el texto coincida).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmationText,
  confirmationLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState('');
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const confirmationInputId = useId();

  // Limpia el texto tipado al cerrar para que cada apertura exija reconfirmar.
  useEffect(() => {
    if (!open) {
      setTypedValue('');
    }
  }, [open]);

  const requiresTypedConfirmation = Boolean(confirmationText);
  const typedMatches =
    !requiresTypedConfirmation || typedValue.trim() === (confirmationText ?? '').trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape y clic fuera equivalen a cancelar: nunca confirman.
        if (!next) {
          onCancel();
        }
      }}
    >
      <DialogContent
        className="max-w-md"
        initialFocusRef={requiresTypedConfirmation ? confirmationInputRef : cancelButtonRef}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {requiresTypedConfirmation && (
          <Input
            ref={confirmationInputRef}
            id={confirmationInputId}
            label={
              confirmationLabel ?? (
                <>
                  Para confirmar, escribe <strong>{confirmationText}</strong>
                </>
              )
            }
            value={typedValue}
            onChange={(event) => setTypedValue(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!typedMatches}
            loading={isConfirming}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
