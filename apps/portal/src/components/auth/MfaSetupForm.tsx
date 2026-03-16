// apps/portal/src/components/auth/MfaSetupForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { OtpInput, Button } from '@iwana/ui';
import { ApiError, authApi } from '@/lib/api-client';

type SetupStep = 'loading' | 'qr' | 'verifying' | 'success' | 'error';

export function MfaSetupForm() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('loading');
  const [qrCodeBase64, setQrCodeBase64] = useState<string>('');
  const [otpauthUri, setOtpauthUri] = useState<string>('');
  const [code, setCode] = useState('');
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Cargar el QR al montar el componente usando el token limitado almacenado
  useEffect(() => {
    let mounted = true;

    const loadQr = async () => {
      try {
        const response = await authApi.mfaSetup();
        if (mounted) {
          setQrCodeBase64(response.qrCodeBase64);
          setOtpauthUri(response.otpauthUri);
          setStep('qr');
        }
      } catch (err) {
        if (!mounted) return;
        if (err instanceof ApiError && err.status === 401) {
          // Token limitado expirado o inválido — volver al login
          router.replace('/auth/login');
        } else {
          setErrorMessage('No se pudo iniciar la configuración MFA. Intenta de nuevo.');
          setStep('error');
        }
      }
    };

    loadQr();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    setHasError(false);
    setErrorMessage(null);
    if (newCode.length === 6) handleVerify(newCode);
  };

  const handleVerify = async (codeToVerify: string) => {
    if (codeToVerify.length !== 6) return;
    setLoading(true);
    setStep('verifying');
    setHasError(false);
    setErrorMessage(null);

    try {
      await authApi.mfaVerifySetup(codeToVerify);
      // MFA activado: eliminar token limitado y redirigir al login completo
      authApi.clearMfaSetupToken();
      setStep('success');
      // Pequeña pausa para que el usuario vea el éxito antes de redirigir
      setTimeout(() => router.replace('/auth/login'), 1800);
    } catch (err) {
      setHasError(true);
      setCode('');
      setStep('qr');
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setErrorMessage('Código incorrecto. Verifica tu aplicación de autenticación.');
        } else if (err.status === 403) {
          setErrorMessage('Token de configuración expirado. Inicia sesión de nuevo.');
          setTimeout(() => router.replace('/auth/login'), 2000);
        } else {
          setErrorMessage('Error al activar MFA. Intenta de nuevo.');
        }
      } else {
        setErrorMessage('Error de conexión. Verifica tu red.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Pantalla de carga
  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4 py-8" aria-live="polite" aria-busy="true">
        <div className="w-12 h-12 rounded-full border-4 border-[#A5C330] border-t-transparent animate-spin" />
        <p className="text-sm text-[#6B7280]">Generando código QR...</p>
      </div>
    );
  }

  // Pantalla de éxito
  if (step === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center" aria-live="polite">
        <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-[#17163A]">MFA activado correctamente</h3>
        <p className="text-sm text-[#6B7280]">Redirigiendo al inicio de sesión...</p>
      </div>
    );
  }

  // Pantalla de error de carga
  if (step === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div
          role="alert"
          className="w-full flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => router.replace('/auth/login')}
        >
          Volver al inicio de sesión
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleVerify(code);
      }}
      className="flex flex-col gap-6"
      noValidate
      aria-label="Formulario de configuración de autenticación de dos factores"
    >
      {/* Instrucciones */}
      <ol className="list-decimal list-inside space-y-1 text-sm text-[#6B7280]">
        <li>Instala Google Authenticator, Authy o cualquier app TOTP.</li>
        <li>Escanea el código QR con la aplicación.</li>
        <li>Ingresa el código de 6 dígitos que aparece en la app.</li>
      </ol>

      {/* QR Code */}
      {qrCodeBase64 && (
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
            <Image
              src={qrCodeBase64}
              alt="Código QR para configurar autenticación de dos factores"
              width={180}
              height={180}
              className="block"
              priority
            />
          </div>
          {/* URI manual para casos donde el QR no escanea */}
          <details className="w-full text-center">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
              ¿No puedes escanear el QR?
            </summary>
            <div className="mt-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Ingresa este código manualmente:</p>
              <code className="text-xs font-mono text-[#17163A] break-all">
                {otpauthUri.match(/secret=([A-Z2-7]+)/i)?.[1] ?? ''}
              </code>
            </div>
          </details>
        </div>
      )}

      {/* Input OTP */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-[#374151]">
          Ingresa el código de tu aplicación para confirmar
        </p>
        <OtpInput
          value={code}
          onChange={handleCodeChange}
          error={hasError}
          disabled={loading}
          className="justify-center"
        />
      </div>

      {/* Error */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          <svg
            className="h-4 w-4 mt-0.5 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          {errorMessage}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        loading={loading}
        disabled={code.length !== 6 || loading}
        className="w-full"
      >
        {loading ? 'Activando MFA...' : 'Activar autenticación de dos factores'}
      </Button>

      <button
        type="button"
        className="text-sm text-[#6B7280] hover:text-[#374151] underline-offset-4 hover:underline"
        onClick={() => router.push('/auth/login')}
      >
        Volver al inicio de sesión
      </button>
    </form>
  );
}
