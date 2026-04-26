// apps/web/src/components/auth/MfaVerifyForm.tsx
'use client';

import { CircleAlert, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OtpInput, Button } from '@iwana/ui';
import { ApiError } from '@/lib/api-client';
import {
  FORM_ALERT_ERROR_CLASS,
  FORM_HELP_CLASS,
  FORM_SECTION_CARD_CLASS,
} from '@/lib/form-styles';
import { useAuth } from './AuthProvider';

/**
 * Formulario de verificación MFA (TOTP 6 dígitos).
 * Incluye countdown timer de 30 segundos para el código TOTP.
 */

const TOTP_INTERVAL = 30;

export function MfaVerifyForm() {
  const router = useRouter();
  const { completeMfaLogin } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TOTP_INTERVAL);

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      setSecondsLeft(TOTP_INTERVAL - (now % TOTP_INTERVAL));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const isUrgent = secondsLeft <= 5;

  const handleVerify = async (codeToVerify: string) => {
    if (codeToVerify.length !== 6) return;
    setLoading(true);
    setError(null);
    setHasError(false);
    try {
      const result = await completeMfaLogin(codeToVerify);
      if (result === 'password_reset_required') {
        router.push('/auth/change-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setHasError(true);
      setCode('');
      if (err instanceof ApiError) {
        if (err.status === 401) setError('Código incorrecto. Intenta de nuevo.');
        else if (err.status === 429)
          setError('Demasiados intentos. Cuenta temporalmente bloqueada.');
        else setError('Error al verificar el código. Intenta de nuevo.');
      } else {
        setError('Error de conexión. Verifica tu red.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    setHasError(false);
    setError(null);
    if (newCode.length === 6) {
      void handleVerify(newCode);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleVerify(code);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6" noValidate>
      <OtpInput
        value={code}
        onChange={handleCodeChange}
        error={hasError}
        disabled={loading}
        className="justify-center"
      />

      {/* Barra de progreso TOTP */}
      <div className="w-full flex flex-col gap-1.5">
        <progress
          className={`h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:transition-all [&::-webkit-progress-value]:duration-1000 ${
            isUrgent
              ? '[&::-webkit-progress-value]:bg-red-500 [&::-moz-progress-bar]:bg-red-500'
              : secondsLeft <= 10
                ? '[&::-webkit-progress-value]:bg-amber-500 [&::-moz-progress-bar]:bg-amber-500'
                : '[&::-webkit-progress-value]:bg-[#6A7A1C] [&::-moz-progress-bar]:bg-[#6A7A1C] dark:[&::-webkit-progress-value]:bg-[#A5C330] dark:[&::-moz-progress-bar]:bg-[#A5C330]'
          }`}
          value={secondsLeft}
          max={TOTP_INTERVAL}
          aria-label="Tiempo restante del código"
        />
        <p
          className={`text-center text-xs ${
            isUrgent ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {isUrgent
            ? `El código expira en ${secondsLeft}s. Genera uno nuevo si vence.`
            : `El código expira en ${secondsLeft}s`}
        </p>
      </div>

      {error && (
        <div role="alert" className={`${FORM_ALERT_ERROR_CLASS} w-full`}>
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        loading={loading}
        disabled={code.length !== 6}
        className="w-full"
      >
        {loading ? 'Verificando...' : 'Verificar código'}
      </Button>

      <div className={`${FORM_SECTION_CARD_CLASS} w-full`}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-600 dark:text-gray-400">
          <ShieldCheck className="h-4 w-4 text-iwana-secondary-700 dark:text-iwana-secondary-400" aria-hidden="true" />
          <span>Verificación segura</span>
        </div>
        <p className={`mt-2 ${FORM_HELP_CLASS}`}>
          El código se valida en tiempo real y respeta la misma política de acceso segura de la
          plataforma.
        </p>
      </div>

      <Button type="button" variant="link" onClick={() => router.push('/auth/login')}>
        Volver al login
      </Button>
    </form>
  );
}
