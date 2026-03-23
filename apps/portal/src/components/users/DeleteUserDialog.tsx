// apps/portal/src/components/users/DeleteUserDialog.tsx
'use client';

import { useEffect, useState } from 'react';
import type { InternalUser } from '@/lib/api-client';

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

  const userDisplayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  const isConfirmed = confirmText.toLowerCase() === user.email.toLowerCase();

  const handleConfirm = async () => {
    if (!isConfirmed) return;
    await onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-user-title"
    >
      <div className="relative w-full max-w-md mx-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-dark-surface-2">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2
              id="delete-user-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Eliminar usuario
            </h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer.
            </p>
          </div>
        </div>

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

        {isSelfDelete && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <strong>Advertencia:</strong> Estás a punto de eliminar tu propia cuenta. Perderás el
              acceso al portal y necesitarás que otro administrador restaure tu cuenta.
            </p>
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="confirm-email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            Escribe <span className="font-mono text-gray-900 dark:text-white">{user.email}</span>{' '}
            para confirmar:
          </label>
          {confirmText.length > 0 && !isConfirmed ? (
            <input
              id="confirm-email"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isSubmitting}
              placeholder={user.email}
              className="flex h-10 w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-500"
              aria-invalid="true"
            />
          ) : (
            <input
              id="confirm-email"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isSubmitting}
              placeholder={user.email}
              className="flex h-10 w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-500"
            />
          )}
        </div>

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
            onClick={handleConfirm}
            disabled={isSubmitting || !isConfirmed}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors dark:bg-red-500 dark:hover:bg-red-400"
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
                Eliminando...
              </>
            ) : (
              'Eliminar usuario'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
