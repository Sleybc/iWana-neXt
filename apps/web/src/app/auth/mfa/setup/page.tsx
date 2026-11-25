'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input } from '@iwana/ui';
import { PlatformAuthExperience } from '@/components/auth/PlatformAuthExperience';
import { PlatformMfaQr } from '@/components/auth/PlatformMfaQr';
import { ApiError, authApi, persistAccessToken } from '@/lib/api-client';

export default function PlatformMfaSetupPage() {
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof authApi.setupPlatformMfa>> | null>(
    null,
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    void authApi.setupPlatformMfa().then(
      (result) => {
        if (active) setSetup(result);
      },
      () => {
        if (active) setError('No pudimos iniciar la configuración. Vuelve a iniciar sesión.');
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const code = new FormData(event.currentTarget).get('code');
    if (typeof code !== 'string') return;
    setError('');
    setSubmitting(true);
    try {
      await authApi.verifyPlatformMfa(code);
      persistAccessToken('');
      setSetup(null);
      setConfirmed(true);
    } catch (error) {
      setError(
        error instanceof ApiError && error.status === 401
          ? 'Revisa el código de tu aplicación autenticadora o vuelve a iniciar sesión si expiró.'
          : 'No pudimos activar la verificación. Intenta de nuevo o vuelve a iniciar sesión.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PlatformAuthExperience
      ariaLabel="Configura la verificación en dos pasos"
      shellTestId="platform-mfa-setup-shell"
      asideAccent="Verificación en dos pasos"
      asideDescription="Protege el acceso a la consola con tu aplicación autenticadora."
      panelClassName="max-w-[480px]"
      intro={<h1 className="text-2xl font-bold">Configura la verificación en dos pasos</h1>}
      form={
        <div className="space-y-4">
          {confirmed && (
            <p role="status">
              Verificación en dos pasos activada. Inicia sesión con tu contraseña y el siguiente
              código de tu aplicación autenticadora.
            </p>
          )}
          {!setup && !error && !confirmed && <p role="status">Preparando el código QR…</p>}
          {setup && (
            <form onSubmit={verify} className="space-y-4">
              <PlatformMfaQr qrCodeBase64={setup.qrCodeBase64} otpauthUri={setup.otpauthUri} />
              <Input
                label="Código de seis dígitos"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Confirmando…' : 'Activar verificación'}
              </Button>
            </form>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <Link
            href="/auth/login"
            onClick={() => persistAccessToken('')}
            className="inline-block text-sm underline"
          >
            {confirmed ? 'Iniciar sesión' : 'Volver a iniciar sesión'}
          </Link>
        </div>
      }
    />
  );
}
