// apps/portal/src/components/profile/MfaRequiredToggle.tsx
'use client';

import { useState } from 'react';
import { Shield, ShieldCheck, Loader2 } from 'lucide-react';
import { tenantSelfApi } from '@/lib/api-client';

interface MfaRequiredToggleProps {
  /** Valor actual de mfa_required_all del tenant */
  mfaRequiredAll: boolean;
  /** Callback para notificar el nuevo valor al padre */
  onUpdated: (newValue: boolean) => void;
}

/**
 * Tarjeta de configuración para activar/desactivar MFA obligatorio para todos los usuarios.
 * Solo visible y accionable para el rol ADMIN.
 */
export function MfaRequiredToggle({ mfaRequiredAll, onUpdated }: MfaRequiredToggleProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleToggle = async () => {
    const nuevoValor = !mfaRequiredAll;
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await tenantSelfApi.updateMeSettings({ features: { mfa_required_all: nuevoValor } });
      onUpdated(nuevoValor);
      setSuccessMsg(
        nuevoValor
          ? 'MFA obligatorio activado para todos los usuarios.'
          : 'MFA obligatorio desactivado.',
      );
    } catch {
      setError('No fue posible actualizar la configuración. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section
      aria-label="Configuración de MFA obligatorio"
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
    >
      {/* Encabezado */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-iwana-primary/10 dark:bg-iwana-primary-900/20">
          <Shield className="h-5 w-5 text-iwana-primary dark:text-iwana-primary-300" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
            Seguridad — MFA obligatorio
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Exige autenticación de dos factores a todos los usuarios del tenant.
          </p>
        </div>
      </div>

      {/* Estado actual */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
        <div className="flex items-center gap-2">
          {mfaRequiredAll ? (
            <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />
          ) : (
            <Shield className="h-4 w-4 text-amber-500 dark:text-amber-400" aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {mfaRequiredAll ? 'Activo — MFA requerido para todos' : 'Inactivo — MFA opcional'}
          </span>
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          aria-label={mfaRequiredAll ? 'Desactivar MFA obligatorio' : 'Activar MFA obligatorio'}
          disabled={isLoading}
          onClick={() => void handleToggle()}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
            mfaRequiredAll
              ? 'bg-green-500 dark:bg-green-600'
              : 'bg-gray-300 dark:bg-dark-surface-4',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={[
              'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200',
              mfaRequiredAll ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      {/* Descripción contextual */}
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        {mfaRequiredAll
          ? 'Los usuarios que no tengan MFA configurado serán redirigidos al flujo de configuración en su próximo inicio de sesión.'
          : 'Al activar esta opción, todos los usuarios de la empresa deberán configurar MFA en su próximo inicio de sesión.'}
      </p>

      {/* Feedback: error o éxito */}
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {successMsg && !error && (
        <p role="status" className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">
          {successMsg}
        </p>
      )}

      {/* Indicador de carga */}
      {isLoading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Guardando configuración...
        </div>
      )}
    </section>
  );
}
