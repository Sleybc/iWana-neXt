// apps/portal/src/components/users/ResetPasswordDialog.tsx
'use client';

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
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

  const userDisplayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-password-dialog-title"
    >
      <div className="relative w-full max-w-md mx-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-dark-surface-2">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <KeyRound className="h-6 w-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="reset-password-dialog-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Reiniciar contraseña
            </h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Se generará una contraseña temporal para este usuario.
            </p>
          </div>
        </div>

        {/* Información del usuario afectado */}
        <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3">
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

        {serverError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm text-red-700 dark:text-red-300">{serverError}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:hover:bg-dark-surface-4 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors dark:bg-amber-500 dark:hover:bg-amber-400"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Reiniciando...
              </>
            ) : (
              'Reiniciar contraseña'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
