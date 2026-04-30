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
      className="rounded-[24px] border border-white/70 bg-white/95 p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-iwana-primary/10 dark:bg-iwana-primary-900/20">
          <Shield
            className="h-5 w-5 text-iwana-primary dark:text-iwana-primary-300"
            aria-hidden="true"
          />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
            Politica de acceso
          </p>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
            Seguridad — MFA obligatorio
          </h2>
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
            Exige autenticación de dos factores a todos los usuarios de la empresa.
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-[20px] border border-gray-200 bg-[#f8faf5] px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
        <div className="flex items-center gap-2">
          {mfaRequiredAll ? (
            <ShieldCheck
              className="h-4 w-4 text-green-600 dark:text-green-400"
              aria-hidden="true"
            />
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

      <p className="mb-4 rounded-[20px] border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
        {mfaRequiredAll
          ? 'Los usuarios que no tengan MFA configurado serán redirigidos al flujo de configuración en su próximo inicio de sesión.'
          : 'Al activar esta opción, todos los usuarios de la empresa deberán configurar MFA en su próximo inicio de sesión.'}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-1 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {successMsg && !error && (
        <p
          role="status"
          className="mt-1 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300"
        >
          {successMsg}
        </p>
      )}

      {isLoading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Guardando configuración...
        </div>
      )}
    </section>
  );
}
