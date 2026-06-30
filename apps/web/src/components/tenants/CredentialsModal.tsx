'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import type { AdminCredentials } from '@/lib/api-client';

interface CredentialsModalProps {
  credentials: AdminCredentials | null;
  onClose: () => void;
}

export function CredentialsModal({ credentials, onClose }: CredentialsModalProps) {
  const [copied, setCopied] = useState(false);

  if (!credentials) {
    return null;
  }

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(credentials.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={Boolean(credentials)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0" aria-labelledby="tenant-credentials-modal-title">
        <DialogHeader className="mb-0 flex flex-row items-start justify-between gap-4 p-6 pb-4">
          <DialogTitle id="tenant-credentials-modal-title">
            Acceso del administrador inicial
          </DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">
              Cerrar
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="space-y-4 p-6 pt-0">
          <Alert variant="neutral" className="rounded-lg shadow-none">
            {credentials.message}
          </Alert>
          <Alert variant="warning" className="rounded-lg shadow-none">
            Usa este acceso solo para el primer ingreso. Apenas el usuario entre, deberá cambiar la
            contraseña.
          </Alert>
          <Alert variant="info" className="rounded-lg shadow-none">
            El correo de acceso inicial es independiente del email de contacto empresarial y puede
            cambiarse luego desde la sección de perfil del usuario principal.
          </Alert>

          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
            <p>
              <strong>Usuario inicial:</strong> {credentials.adminEmail}
            </p>
            <p>
              <strong>Contraseña temporal:</strong> {credentials.temporaryPassword}
            </p>
            <p>
              <strong>Expira:</strong> {new Date(credentials.expiresAt).toLocaleString('es-CO')}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-dark-border">
            <Button type="button" variant="secondary" onClick={copyPassword}>
              {copied ? 'Copiado' : 'Copiar contraseña'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
