// apps/web/src/app/auth/login/page.tsx
import type { Metadata } from 'next';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión — iWana neXt Admin',
  description: 'Acceso al portal de administración de plataforma iWana neXt',
};

/**
 * Página de login del portal administrativo.
 * Layout split-screen: panel de marca (izq, solo desktop) + formulario (der).
 */
export default function LoginPage() {
  return (
    <main className="min-h-screen flex" aria-label="Página de inicio de sesión">
      <LoginBrandPanel />

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          {/* Badge de contexto */}
          <div className="mb-8 flex flex-col items-center gap-3">
            {/* Logo mobile */}
            <div className="flex lg:hidden items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#17163A] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" />
                  <path
                    d="M2 17l10 5 10-5"
                    stroke="#A5C330"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="font-bold text-[#17163A]">iWana neXt</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEEEFA] px-3 py-1 text-xs font-medium text-[#17163A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A5C330]" aria-hidden="true" />
              Administración de Plataforma
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#17163A]">Bienvenido de nuevo</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Ingresa tus credenciales para continuar</p>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
