// apps/portal/src/app/auth/login/page.tsx
import type { Metadata } from 'next';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión — Portal Corporativo — iWana neXt',
  description: 'Acceso al portal corporativo iWana neXt',
};

/**
 * Página de login del portal corporativo.
 * Layout split-screen adaptado del prototipo de identidad visual.
 */
export default function LoginPage() {
  return (
    <main
      className="relative min-h-screen w-full flex flex-col lg:flex-row overflow-hidden group/login bg-[#181818]"
      aria-label="Página de inicio de sesión"
    >
      <LoginBrandPanel />

      {/* Panel derecho — formulario */}
      <div className="w-full lg:w-1/2 bg-[#181818] flex items-center justify-center p-6 lg:p-12 relative">
        {/* Patrón de puntos */}
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:32px_32px]" />

        <div className="w-full max-w-[480px] bg-white rounded-2xl p-8 lg:p-12 shadow-2xl relative z-10">
          <div className="mb-10">
            {/* Title / welcome message */}
            <div className="flex lg:hidden items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-[#A5C330] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#181818" />
                  <path
                    d="M2 17l10 5 10-5"
                    stroke="#181818"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="font-bold text-[#181818]">iWana neXt</span>
            </div>

            <h2 className="text-3xl font-bold text-[#181818] mb-2">Bienvenido al Portal</h2>
            <p className="text-slate-500 text-base">
              Ingresa tus credenciales para acceder a tus servicios
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
