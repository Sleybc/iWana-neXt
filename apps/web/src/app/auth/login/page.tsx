// apps/web/src/app/auth/login/page.tsx
import type { Metadata } from 'next';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { LoginForm } from '@/components/auth/LoginForm';
import { FORM_PANEL_PREMIUM_CLASS } from '@/lib/form-styles';

export const metadata: Metadata = {
  title: 'Iniciar sesión — iWana neXt',
  description: 'Acceso al portal de administración de plataforma iWana neXt',
};

/**
 * Página de login del portal administrativo.
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

        <div className={`${FORM_PANEL_PREMIUM_CLASS} relative z-10 w-full max-w-[520px]`}>
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

            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Consola de plataforma
            </p>
            <h2 className="mb-2 text-3xl font-bold text-[#181818] dark:text-white">
              Bienvenido a iWana neXt
            </h2>
            <p className="text-base text-slate-500 dark:text-gray-400">
              Ingresa tus credenciales para administrar empresas, usuarios y operación interna.
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
