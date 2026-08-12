'use client';

import { CheckCircle2, CircleAlert, KeyRound, QrCode, ShieldCheck } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { changePasswordSchema, type ChangePasswordFormValues } from '@iwana/shared';
import { Alert, AlertDescription, Button, Input, OtpInput } from '@iwana/ui';
import { ApiError, authApi, platformUsersApi } from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { settingsSectionPanelClassName } from './settings-shell';

interface MfaState {
  enabled: boolean;
  qrCodeBase64?: string;
  pendingVerification?: boolean;
}

const copy = PLATFORM_UI_COPY.settings.security;

const sectionIconClass =
  'rounded-2xl bg-iwana-surface-soft p-2 text-iwana-primary dark:bg-dark-surface-3 dark:text-white';

export function SecuritySettings() {
  const [message, setMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
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
      setMessage({ type: 'success', text: copy.passwordSuccess });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.passwordError);
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
      });
      setMessage({ type: 'info', text: copy.mfaPostSetup });
    } catch {
      setError(copy.mfaErrorSetup);
    }
  };

  const onMfaVerifySetup = async () => {
    setMessage(null);
    setError(null);
    try {
      const result = await authApi.mfaVerifySetup(mfaSetupCode);
      setMfaState({ enabled: result.mfaEnabled, pendingVerification: false });
      setMfaSetupCode('');
      setMessage({ type: 'success', text: copy.mfaSuccessOn });
    } catch {
      setError(copy.mfaErrorVerify);
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
      setMessage({ type: 'success', text: copy.mfaSuccessOff });
    } catch {
      setError(copy.mfaErrorDisable);
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
      {error ? (
        <Alert variant="error" icon={<CircleAlert className="h-5 w-5" />}>
          <AlertDescription className="mt-0">{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert
          variant={message.type === 'info' ? 'info' : 'success'}
          icon={
            message.type === 'info' ? (
              <QrCode className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )
          }
        >
          <AlertDescription className="mt-0">{message.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="security-password-heading"
          className={`flex h-full flex-col space-y-4 ${settingsSectionPanelClassName}`}
        >
          <div className="flex items-start gap-3">
            <div className={sectionIconClass}>
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="security-password-heading"
                className="text-lg font-semibold text-iwana-primary dark:text-white"
              >
                {copy.passwordTitle}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{copy.passwordHelp}</p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit(onChangePassword)}
            className="flex flex-1 flex-col space-y-4"
          >
            <div className="space-y-4">
              <Input
                label={copy.currentPassword}
                type="password"
                autoComplete="current-password"
                error={errors.currentPassword?.message}
                {...register('currentPassword')}
              />
              <Input
                label={copy.newPassword}
                type="password"
                autoComplete="new-password"
                error={errors.newPassword?.message}
                {...register('newPassword')}
              />
              <Input
                label={copy.confirmPassword}
                type="password"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
            </div>

            <div className="mt-auto flex justify-end">
              <Button type="submit" loading={isSubmitting}>
                {copy.passwordCta}
              </Button>
            </div>
          </form>
        </section>

        <section
          aria-labelledby="security-mfa-heading"
          className={`flex h-full flex-col space-y-4 ${settingsSectionPanelClassName}`}
        >
          <div className="flex items-start gap-3">
            <div className={sectionIconClass}>
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="security-mfa-heading"
                className="text-lg font-semibold text-iwana-primary dark:text-white"
              >
                {copy.mfaTitle}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{copy.mfaHelp}</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex min-h-11 flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                {isLoadingMfa ? (
                  <p
                    role="status"
                    aria-busy="true"
                    className="flex min-h-11 items-center text-sm text-gray-600 dark:text-gray-300"
                  >
                    {copy.mfaLoading}
                  </p>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {copy.mfaStatusLabel}: {mfaState.enabled ? copy.mfaStatusOn : copy.mfaStatusOff}
                  </p>
                )}
              </div>

              {!isLoadingMfa && !mfaState.enabled && !mfaState.pendingVerification ? (
                <Button type="button" size="lg" onClick={onMfaSetup}>
                  {copy.mfaSetupCta}
                </Button>
              ) : null}
            </div>

            {qrCodeSrc ? (
              <div className="space-y-3">
                <p className="font-semibold text-iwana-primary dark:text-white">
                  {copy.mfaQrTitle}
                </p>
                <img
                  src={qrCodeSrc}
                  alt={copy.mfaQrAlt}
                  className="h-44 w-44 rounded-2xl border border-gray-200 bg-white"
                />
              </div>
            ) : null}

            {mfaState.pendingVerification ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                  {copy.mfaConfirmTitle}
                </h3>
                <OtpInput value={mfaSetupCode} onChange={setMfaSetupCode} length={6} />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="lg"
                    onClick={onMfaVerifySetup}
                    disabled={mfaSetupCode.length !== 6}
                  >
                    {copy.mfaConfirmCta}
                  </Button>
                </div>
              </div>
            ) : null}

            {mfaState.enabled ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                  {copy.mfaDisableTitle}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{copy.mfaDisableHelp}</p>
                <div className="grid gap-3">
                  <Input
                    label={copy.currentPassword}
                    type="password"
                    autoComplete="current-password"
                    value={mfaDisablePassword}
                    onChange={(e) => setMfaDisablePassword(e.target.value)}
                  />
                  <Input
                    label={copy.mfaCodeLabel}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaDisableCode}
                    onChange={(e) => setMfaDisableCode(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="button" size="lg" variant="destructive" onClick={onMfaDisable}>
                    {copy.mfaDisableCta}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
