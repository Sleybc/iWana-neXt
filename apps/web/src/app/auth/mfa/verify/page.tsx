// apps/web/src/app/auth/mfa/verify/page.tsx
import type { Metadata } from 'next';
import { MfaVerifyForm } from '@/components/auth/MfaVerifyForm';
import { PlatformAuthExperience } from '@/components/auth/PlatformAuthExperience';

export const metadata: Metadata = {
  title: 'Verificación MFA — iWana neXt Admin',
};

export default function MfaVerifyPage() {
  return (
    <PlatformAuthExperience
      ariaLabel="Verificación en dos pasos"
      shellTestId="platform-mfa-verify-shell"
      asideAccent="Verificación en dos pasos"
      asideDescription="Tu cuenta está protegida con autenticación de dos factores."
      panelClassName="max-w-[480px]"
      intro={
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-iwana-primary-100 dark:bg-dark-surface-3">
            <svg
              className="h-7 w-7 text-iwana-primary dark:text-white"
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
      }
      form={<MfaVerifyForm />}
    />
  );
}
