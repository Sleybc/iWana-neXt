// apps/portal/src/components/users/ResetPasswordDialog.tsx
'use client';

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FormStatus,
} from '@iwana/ui';
import { formatFullName } from '@iwana/shared';
import type { InternalUser } from '@/lib/api-client';

interface ResetPasswordDialogProps {
  isOpen: boolean;
  user: InternalUser;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Diálogo de confirmación antes de reiniciar la contraseña de un usuario.
 * No genera la contraseña en este componente — eso lo hace el handler del padre.
 * Al confirmar, el padre llama al backend y muestra el resultado en un modal separado.
 */
export function ResetPasswordDialog({
  isOpen,
  user,
  onClose,
  onConfirm,
  isSubmitting,
  error,
}: ResetPasswordDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setServerError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (error) setServerError(error);
  }, [error]);

  if (!isOpen) return null;

  const userDisplayName = formatFullName(user.firstName, user.lastName) || user.email;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent aria-labelledby="reset-password-dialog-title" className="max-w-md">
        <DialogHeader className="mb-6 flex flex-row items-start gap-4 space-y-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
            <KeyRound className="h-6 w-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="portal-eyebrow text-amber-700 dark:text-amber-300">
              Credenciales temporales
            </p>
            <DialogTitle
              id="reset-password-dialog-title"
              className="mt-1 text-iwana-primary dark:text-white"
            >
              Reiniciar contraseña
            </DialogTitle>
            <DialogDescription className="mt-0.5">
              Se generará una contraseña temporal para este usuario.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="mb-6 rounded-2xl border border-gray-100 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-iwana-primary/10 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-400">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{userDisplayName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
          </div>
        </div>

        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          El usuario deberá cambiar la contraseña en su próximo inicio de sesión. La contraseña
          actual quedará invalidada inmediatamente.
        </p>

        <FormStatus
          className="mb-4"
          status={serverError ? 'error' : 'idle'}
          message={
            serverError ? (
              <>
                <span>No fue posible reiniciar.</span> <span>{serverError}</span>
              </>
            ) : undefined
          }
        />

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void onConfirm()}
            disabled={isSubmitting}
            loading={isSubmitting}
          >
            Reiniciar contraseña
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
