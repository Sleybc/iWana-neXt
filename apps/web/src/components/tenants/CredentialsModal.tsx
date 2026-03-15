'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
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
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tenant-credentials-modal-title"
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle id="tenant-credentials-modal-title">Credenciales temporales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Estas credenciales se muestran una sola vez. Guárdalas en un gestor seguro.
          </p>

          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
            <p>
              <strong>Email:</strong> {credentials.adminEmail}
            </p>
            <p>
              <strong>Contraseña temporal:</strong> {credentials.temporaryPassword}
            </p>
            <p>
              <strong>Expira:</strong> {new Date(credentials.expiresAt).toLocaleString('es-CO')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={copyPassword}>
              {copied ? 'Copiado' : 'Copiar contraseña'}
            </Button>
            <Button type="button" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
