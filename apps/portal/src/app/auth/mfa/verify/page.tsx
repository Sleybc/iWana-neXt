// apps/portal/src/app/auth/mfa/verify/page.tsx
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { MfaVerifyForm } from '@/components/auth/MfaVerifyForm';

export default function MfaVerifyPage() {
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
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[#17163A]">Verificación en dos pasos</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Ingresa el código de 6 dígitos</p>
          </div>
          <MfaVerifyForm />
        </div>
      </div>
    </main>
  );
}
