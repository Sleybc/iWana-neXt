// apps/portal/src/components/users/DeleteUserDialog.tsx
'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { PortalAlert, portalFieldClassName } from '@/components/shared/portal-ui';

interface DeleteUserDialogProps {
  isOpen: boolean;
  user: InternalUser;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  isSelfDelete: boolean;
}

export function DeleteUserDialog({
  isOpen,
  user,
  onClose,
  onConfirm,
  isSubmitting,
  error,
  isSelfDelete,
}: DeleteUserDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setServerError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (error) setServerError(error);
  }, [error]);

  if (!isOpen) return null;

  const userDisplayName = formatFullName(user.firstName, user.lastName) || user.email;
  const isConfirmed = confirmText.toLowerCase() === user.email.toLowerCase();

  const handleConfirm = async () => {
    if (!isConfirmed) return;
    await onConfirm();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent aria-labelledby="delete-user-title" className="max-w-md">
        <DialogHeader className="mb-6 flex flex-row items-start gap-4 space-y-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="portal-eyebrow text-red-700 dark:text-red-300">Acción sensible</p>
            <DialogTitle id="delete-user-title" className="mt-1 text-iwana-primary dark:text-white">
              Eliminar usuario
            </DialogTitle>
            <DialogDescription className="mt-0.5">
              Esta acción no se puede deshacer.
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

        {isSelfDelete && (
          <PortalAlert
            className="mb-4"
            variant="warning"
            title="Advertencia"
            description="Estás a punto de eliminar tu propia cuenta. Perderás el acceso al portal y necesitarás que otro administrador restaure tu cuenta."
          />
        )}

        <div className="mb-4">
          <label
            htmlFor="confirm-email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            Escribe <span className="font-mono text-gray-900 dark:text-white">{user.email}</span>{' '}
            para confirmar:
          </label>
          <input
            id="confirm-email"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={isSubmitting}
            placeholder={user.email}
            className={portalFieldClassName}
            aria-invalid={confirmText.length > 0 && !isConfirmed ? 'true' : undefined}
          />
        </div>

        <FormStatus
          className="mb-4"
          status={serverError ? 'error' : 'idle'}
          message={
            serverError ? (
              <>
                <span>No fue posible eliminar.</span> <span>{serverError}</span>
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
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || !isConfirmed}
            loading={isSubmitting}
          >
            Eliminar usuario
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
