'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { changePasswordSchema, type ChangePasswordFormValues } from '@iwana/shared';
import { Button } from '@iwana/ui';
import { ApiError, authApi, platformUsersApi } from '@/lib/api-client';

interface MfaState {
  enabled: boolean;
  qrCodeBase64?: string;
  otpauthUri?: string;
  pendingVerification?: boolean;
}

export function SecuritySettings() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mfaState, setMfaState] = useState<MfaState>({ enabled: false });
  const [mfaSetupCode, setMfaSetupCode] = useState('');
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaDisableCode, setMfaDisableCode] = useState('');

  useEffect(() => {
    const loadSecurityState = async () => {
      try {
        const profile = await platformUsersApi.me();
        setMfaState((current) => ({ ...current, enabled: profile.mfaEnabled }));
      } catch {
        // El estado visible sigue operable aun si falla la carga inicial.
      }
    };

    void loadSecurityState();
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onChangePassword = async (values: ChangePasswordFormValues) => {
    setMessage(null);
    setError(null);
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      reset();
      setMessage('Contraseña cambiada. Se recomienda cerrar sesión y volver a ingresar.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible cambiar la contraseña.');
    }
  };

  const onMfaSetup = async () => {
    setMessage(null);
    setError(null);
    try {
      const setup = await authApi.mfaSetup();
      setMfaState({
        enabled: false,
        pendingVerification: true,
        qrCodeBase64: setup.qrCodeBase64,
        otpauthUri: setup.otpauthUri,
      });
      setMessage('Escanea el QR en tu app Authenticator y confirma el primer código TOTP.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible iniciar configuración MFA.');
    }
  };

  const onMfaVerifySetup = async () => {
    setMessage(null);
    setError(null);
    try {
      const result = await authApi.mfaVerifySetup(mfaSetupCode);
      setMfaState({ enabled: result.mfaEnabled, pendingVerification: false });
      setMfaSetupCode('');
      setMessage('MFA habilitado correctamente.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible verificar el código MFA.');
    }
  };

  const onMfaDisable = async () => {
    setMessage(null);
    setError(null);
    try {
      await authApi.mfaDisable(mfaDisablePassword, mfaDisableCode);
      setMfaState({ enabled: false, pendingVerification: false });
      setMfaDisablePassword('');
      setMfaDisableCode('');
      setMessage('MFA deshabilitado correctamente.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible deshabilitar MFA.');
    }
  };

  const qrCodeSrc = useMemo(() => {
    if (!mfaState.qrCodeBase64) return null;
    return mfaState.qrCodeBase64.startsWith('data:')
      ? mfaState.qrCodeBase64
      : `data:image/png;base64,${mfaState.qrCodeBase64}`;
  }, [mfaState.qrCodeBase64]);

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-dark-border dark:bg-dark-surface-2">
        <h2 className="mb-6 text-lg font-semibold text-iwana-primary dark:text-white">
          Cambiar contraseña
        </h2>

        <form onSubmit={handleSubmit(onChangePassword)} className="space-y-6">
          <input
            type="password"
            placeholder="Contraseña actual"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
            {...register('currentPassword')}
          />
          {errors.currentPassword && (
            <p className="text-xs text-red-600">{errors.currentPassword.message}</p>
          )}

          <input
            type="password"
            placeholder="Nueva contraseña"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
            {...register('newPassword')}
          />
          {errors.newPassword && (
            <p className="text-xs text-red-600">{errors.newPassword.message}</p>
          )}

          <input
            type="password"
            placeholder="Confirmar nueva contraseña"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-red-600">{errors.confirmPassword.message}</p>
          )}

          <div className="flex justify-end border-t border-gray-200 pt-6 dark:border-dark-border">
            <Button type="submit" loading={isSubmitting}>
              Actualizar contraseña
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-dark-border dark:bg-dark-surface-2">
        <h2 className="mb-6 text-lg font-semibold text-iwana-primary dark:text-white">MFA</h2>

        <div className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Estado actual: {mfaState.enabled ? 'Habilitado' : 'Deshabilitado'}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Gestiona el segundo factor para el acceso del administrador de plataforma.
              </p>
            </div>

            {!mfaState.enabled && !mfaState.pendingVerification && (
              <Button type="button" onClick={onMfaSetup}>
                Configurar MFA
              </Button>
            )}
          </div>

          {qrCodeSrc && (
            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface">
              <img
                src={qrCodeSrc}
                alt="QR de configuración MFA"
                className="h-44 w-44 rounded-lg border border-gray-200 bg-white"
              />
              {mfaState.otpauthUri && (
                <p className="break-all text-xs text-gray-500 dark:text-gray-300">
                  {mfaState.otpauthUri}
                </p>
              )}
            </div>
          )}

          {mfaState.pendingVerification && (
            <div className="space-y-3 rounded-xl border border-gray-100 p-4 dark:border-dark-border">
              <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                Confirmar configuración inicial
              </h3>
              <input
                type="text"
                placeholder="Código TOTP de 6 dígitos"
                value={mfaSetupCode}
                onChange={(event) => setMfaSetupCode(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={onMfaVerifySetup}
                  disabled={mfaSetupCode.length !== 6}
                >
                  Verificar MFA
                </Button>
              </div>
            </div>
          )}

          {mfaState.enabled && (
            <div className="space-y-3 rounded-xl border border-gray-100 p-4 dark:border-dark-border">
              <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                Deshabilitar MFA
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="password"
                  placeholder="Contraseña actual"
                  value={mfaDisablePassword}
                  onChange={(event) => setMfaDisablePassword(event.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
                />
                <input
                  type="text"
                  placeholder="Código MFA"
                  value={mfaDisableCode}
                  onChange={(event) => setMfaDisableCode(event.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="destructive" onClick={onMfaDisable}>
                  Deshabilitar MFA
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
