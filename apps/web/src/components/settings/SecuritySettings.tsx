'use client';

import { CheckCircle2, CircleAlert, KeyRound, QrCode, ShieldCheck } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { changePasswordSchema, type ChangePasswordFormValues } from '@iwana/shared';
import { Button, Input, OtpInput } from '@iwana/ui';
import { ApiError, authApi, platformUsersApi } from '@/lib/api-client';
import {
  FORM_ALERT_ERROR_CLASS,
  FORM_ALERT_INFO_CLASS,
  FORM_ALERT_SUCCESS_CLASS,
  FORM_HELP_CLASS,
  FORM_MICROCOPY_CLASS,
} from '@/lib/form-styles';

interface MfaState {
  enabled: boolean;
  qrCodeBase64?: string;
  otpauthUri?: string;
  pendingVerification?: boolean;
}

const securityPanelClass =
  'rounded-2xl border border-gray-100 bg-white p-5 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none';
const securityInnerSectionClass =
  'space-y-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-dark-border dark:bg-dark-surface-3/60';

export function SecuritySettings() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mfaState, setMfaState] = useState<MfaState>({ enabled: false });
  const [mfaSetupCode, setMfaSetupCode] = useState('');
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [isLoadingMfa, setIsLoadingMfa] = useState(true);

  useEffect(() => {
    const loadSecurityState = async () => {
      try {
        const profile = await platformUsersApi.me();
        setMfaState((current) => ({ ...current, enabled: profile.mfaEnabled }));
      } catch {
        // El estado visible sigue operable aun si falla la carga inicial.
      } finally {
        setIsLoadingMfa(false);
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
    <div className="space-y-5">
      {error && (
        <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
      {message && (
        <div role="alert" className={FORM_ALERT_SUCCESS_CLASS}>
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{message}</p>
        </div>
      )}

      <div className={securityPanelClass}>
        <section aria-labelledby="security-password-heading">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-2xl bg-white p-2 text-iwana-primary shadow-sm dark:bg-dark-surface-2 dark:text-white">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="security-password-heading"
                className="text-lg font-semibold text-iwana-primary dark:text-white"
              >
                Cambiar contraseña
              </h2>
              <p className={`mt-1 ${FORM_HELP_CLASS}`}>
                Actualiza la credencial principal del administrador de plataforma con la misma
                política aplicada en el flujo de primer ingreso.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4">
            <div className="max-w-[440px] space-y-4">
              <Input
                label="Contraseña actual"
                type="password"
                autoComplete="current-password"
                error={errors.currentPassword?.message}
                {...register('currentPassword')}
              />
              <Input
                label="Nueva contraseña"
                type="password"
                autoComplete="new-password"
                error={errors.newPassword?.message}
                {...register('newPassword')}
              />
              <Input
                label="Confirmar nueva contraseña"
                type="password"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
            </div>

            <div className="flex max-w-[440px] justify-end">
              <Button type="submit" loading={isSubmitting}>
                Actualizar contraseña
              </Button>
            </div>
          </form>
        </section>

        <hr className="my-5 border-gray-100 dark:border-dark-border" />

        <section aria-labelledby="security-mfa-heading">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-2xl bg-white p-2 text-iwana-primary shadow-sm dark:bg-dark-surface-2 dark:text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="security-mfa-heading"
                className="text-lg font-semibold text-iwana-primary dark:text-white"
              >
                Autenticación de dos factores (MFA)
              </h2>
              <p className={`mt-1 ${FORM_HELP_CLASS}`}>
                Gestiona el segundo factor del acceso administrativo y confirma la activación con un
                código TOTP válido.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {isLoadingMfa
                    ? 'Verificando estado MFA…'
                    : `Estado actual: ${mfaState.enabled ? 'Habilitado' : 'Deshabilitado'}`}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Gestiona el segundo factor para el acceso del administrador de plataforma.
                </p>
              </div>

              {!isLoadingMfa && !mfaState.enabled && !mfaState.pendingVerification && (
                <Button type="button" size="lg" onClick={onMfaSetup}>
                  Configurar MFA
                </Button>
              )}
            </div>

            {qrCodeSrc && (
              <div className={FORM_ALERT_INFO_CLASS}>
                <QrCode className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="space-y-3">
                  <p className="font-semibold">Código QR para configuración MFA</p>
                  <img
                    src={qrCodeSrc}
                    alt="QR de configuración MFA"
                    className="h-44 w-44 rounded-2xl border border-gray-200 bg-white"
                  />
                  {mfaState.otpauthUri && (
                    <p className={`break-all ${FORM_MICROCOPY_CLASS}`}>{mfaState.otpauthUri}</p>
                  )}
                </div>
              </div>
            )}

            {mfaState.pendingVerification && (
              <div className={securityInnerSectionClass}>
                <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                  Confirmar configuración inicial
                </h3>
                <p className={FORM_MICROCOPY_CLASS}>
                  Ingresa el primer código generado por tu app autenticadora para completar la
                  activación.
                </p>
                <OtpInput value={mfaSetupCode} onChange={setMfaSetupCode} length={6} />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="lg"
                    onClick={onMfaVerifySetup}
                    disabled={mfaSetupCode.length !== 6}
                  >
                    Verificar MFA
                  </Button>
                </div>
              </div>
            )}

            {mfaState.enabled && (
              <div className={securityInnerSectionClass}>
                <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                  Deshabilitar MFA
                </h3>
                <p className={FORM_MICROCOPY_CLASS}>
                  Para deshabilitar MFA debes confirmar tu contraseña actual y un código activo de
                  tu autenticador.
                </p>
                <div className="grid max-w-[640px] gap-3 md:grid-cols-2">
                  <Input
                    label="Contraseña actual"
                    type="password"
                    autoComplete="current-password"
                    value={mfaDisablePassword}
                    onChange={(e) => setMfaDisablePassword(e.target.value)}
                  />
                  <Input
                    label="Código MFA"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaDisableCode}
                    onChange={(e) => setMfaDisableCode(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="button" size="lg" variant="destructive" onClick={onMfaDisable}>
                    Deshabilitar MFA
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
