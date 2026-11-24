'use client';

import { useRef, useState } from 'react';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ApiError, tenantApi, type AdminCredentials } from '@/lib/api-client';
import { CredentialsModal } from './CredentialsModal';

interface TenantAdminAccessProps {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
}

/** Nueva contraseña temporal para el administrador inicial de una empresa ya creada. */
export function TenantAdminAccess({ tenantId, tenantName, tenantStatus }: TenantAdminAccessProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
  // Una clave por emisión: se conserva solo si no se sabe si la petición llegó a aplicarse.
  const idempotencyKeyRef = useRef<string | null>(null);

  const isActive = tenantStatus === 'ACTIVE';

  const issue = async () => {
    setIsIssuing(true);
    setError(null);
    idempotencyKeyRef.current ??= crypto.randomUUID();
    try {
      setCredentials(await tenantApi.regenerateCredentials(tenantId, idempotencyKeyRef.current));
      idempotencyKeyRef.current = null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        idempotencyKeyRef.current = null;
        setError(
          'El intento anterior sí cambió la contraseña, pero no se pudo mostrar. Emite una nueva.',
        );
      } else {
        setError('No fue posible emitir la credencial. Inténtalo de nuevo.');
      }
    } finally {
      setIsIssuing(false);
      setConfirmOpen(false);
    }
  };

  return (
    <Card className="overflow-hidden border border-gray-100/90 dark:border-dark-border">
      <CardHeader className="px-5 pb-4 pt-5">
        <CardTitle>Acceso del administrador inicial</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5 pt-0">
        {error && <Alert variant="error">{error}</Alert>}
        <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
          {isActive
            ? 'Si la contraseña temporal se perdió o venció, emite una nueva. Se muestra una sola vez.'
            : 'Podrás emitir una contraseña temporal cuando la empresa esté activa.'}
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={!isActive}
          onClick={() => setConfirmOpen(true)}
        >
          Emitir nueva contraseña temporal
        </Button>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        title="Emitir nueva contraseña temporal"
        description={
          <>
            La contraseña actual del administrador inicial de <strong>{tenantName}</strong> dejará
            de servir, aunque ya la haya cambiado. Deberá entrar con la nueva y elegir otra.
          </>
        }
        confirmLabel="Emitir contraseña"
        isConfirming={isIssuing}
        onConfirm={() => {
          void issue();
        }}
        onCancel={() => {
          if (!isIssuing) setConfirmOpen(false);
        }}
      />
      <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />
    </Card>
  );
}
