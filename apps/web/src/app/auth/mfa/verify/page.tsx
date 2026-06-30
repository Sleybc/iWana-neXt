// apps/web/src/app/auth/mfa/verify/page.tsx
import type { Metadata } from 'next';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { MfaVerifyForm } from '@/components/auth/MfaVerifyForm';
import { FORM_PANEL_CLASS } from '@/lib/form-styles';

export const metadata: Metadata = {
  title: 'Verificación MFA — iWana neXt Admin',
};

export default function MfaVerifyPage() {
  return (
    <main
      className="relative min-h-screen flex flex-col overflow-hidden bg-[#181818] lg:flex-row"
      aria-label="Verificación en dos pasos"
    >
      <LoginBrandPanel
        title="Verificación en dos pasos"
        subtitle="Tu cuenta está protegida con autenticación de dos factores"
      />

      <div className="relative flex flex-1 items-center justify-center bg-[#181818] px-6 py-12">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:32px_32px]" />

        <div className={`${FORM_PANEL_CLASS} relative z-10 w-full max-w-sm`}>
          <div className="mb-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EEEEFA] flex items-center justify-center mb-4">
              <svg
                className="w-7 h-7 text-[#17163A]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-iwana-primary dark:text-white">
              Verificación en dos pasos
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Ingresa el código de 6 dígitos de tu app autenticadora
            </p>
          </div>

          <MfaVerifyForm />
        </div>
      </div>
    </main>
  );
}
