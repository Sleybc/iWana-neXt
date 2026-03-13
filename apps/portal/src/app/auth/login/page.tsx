// apps/portal/src/app/auth/login/page.tsx
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <main className="min-h-screen flex">
      <LoginBrandPanel />
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex lg:hidden items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#17163A] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" />
                </svg>
              </div>
              <span className="font-bold text-[#17163A]">iWana neXt</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF5CC] px-3 py-1 text-xs font-medium text-[#6A7A1C]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A5C330]" aria-hidden="true" />
              Portal de Suscriptores
            </span>
          </div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#17163A]">Bienvenido</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Ingresa a tu portal de servicios</p>
          </div>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
