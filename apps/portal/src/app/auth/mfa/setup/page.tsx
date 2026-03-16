// apps/portal/src/app/auth/mfa/setup/page.tsx
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { MfaSetupForm } from '@/components/auth/MfaSetupForm';

export default function MfaSetupPage() {
  return (
    <main className="min-h-screen flex">
      <LoginBrandPanel />
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
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
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[#17163A]">Configurar autenticación segura</h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Tu rol requiere verificación en dos pasos para proteger el acceso
            </p>
          </div>
          <MfaSetupForm />
        </div>
      </div>
    </main>
  );
}
