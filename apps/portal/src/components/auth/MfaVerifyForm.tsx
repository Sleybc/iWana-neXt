// apps/portal/src/components/auth/MfaVerifyForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OtpInput, Button, FormStatus } from '@iwana/ui';
import { ApiError } from '@/lib/api-client';
import { useAuth } from './AuthProvider';

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
        else setError('Error al verificar el código.');
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
    if (newCode.length === 6) handleVerify(newCode);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleVerify(code);
      }}
      className="flex flex-col items-center gap-6"
      noValidate
    >
      <OtpInput
        value={code}
        onChange={handleCodeChange}
        error={hasError}
        disabled={loading}
        className="justify-center"
      />

      <div className="w-full flex flex-col gap-1.5">
        <progress
          className={`h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:transition-all [&::-webkit-progress-value]:duration-1000 ${
            isUrgent
              ? '[&::-webkit-progress-value]:bg-red-500 [&::-moz-progress-bar]:bg-red-500'
              : secondsLeft <= 10
                ? '[&::-webkit-progress-value]:bg-amber-500 [&::-moz-progress-bar]:bg-amber-500'
                : '[&::-webkit-progress-value]:bg-[#A5C330] [&::-moz-progress-bar]:bg-[#A5C330]'
          }`}
          value={secondsLeft}
          max={TOTP_INTERVAL}
          aria-label="Tiempo restante del código"
        />
        <p className={`text-xs text-center ${isUrgent ? 'text-red-500' : 'text-gray-500'}`}>
          {isUrgent
            ? `El código expira en ${secondsLeft}s. Solicita uno nuevo si vence.`
            : `El código expira en ${secondsLeft}s`}
        </p>
      </div>

      <FormStatus
        status={error ? 'error' : 'idle'}
        message={error ?? undefined}
        className="w-full"
      />

      <Button
        type="submit"
        size="lg"
        loading={loading}
        disabled={code.length !== 6}
        className="w-full"
      >
        {loading ? 'Verificando...' : 'Verificar código'}
      </Button>

      <button
        type="button"
        className="text-sm text-[#6B7280] hover:text-[#374151] underline-offset-4 hover:underline"
        onClick={() => router.push('/auth/login')}
      >
        Volver al login
      </button>
    </form>
  );
}
