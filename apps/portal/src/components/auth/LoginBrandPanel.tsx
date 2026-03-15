// apps/web/src/components/auth/LoginBrandPanel.tsx
import type { ReactNode } from 'react';

/**
 * Panel izquierdo del login — identidad iWana neXt.
 * Adaptado del prototipo de identidad visual.
 */
interface LoginBrandPanelProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

export function LoginBrandPanel({
  title = 'iWana neXt',
  subtitle = 'Autenticación segura e identidad centralizada. Accede a tu portal con encriptación de grado militar.',
  children,
}: LoginBrandPanelProps) {
  return (
    <div className="relative hidden lg:flex lg:w-1/2 bg-[#181818] flex-col justify-between p-8 lg:p-16 text-white overflow-hidden border-r border-white/5">
      {/* Background Image pattern from prototype */}
      <img
        src="https://lh3.googleusercontent.com/aida-public/AB6AXuCHI4LM_NAHCAJ3MNL4M6WPHz31HVbomoUOssE0eZhErv0MfuccPw3aYms_n07IkyuNbSK8q4lhZv16uyobCgB864Jf6HadYfLg7hqx2yc1ARQ1j8mx_EStoaUUmAApxfoKQIHR4nZO7mR8En5Bp2Tgnf2h-WWUDetkSZEoVPCCogfOk-Z_nPm8fYodWf7jD5O2wdDrlp_1f4LaAxuPqfe7MLGnHphIwaXrd9JzKmrDSt2qAei9pHcZ2_z7hM8gO-jxpEWa9woXrIZY"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 z-0 h-full w-full object-cover opacity-30 mix-blend-lighten"
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#181818] via-[#181818]/80 to-transparent" />

      {/* Top Header */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="h-10 w-10 bg-[#A5C330] rounded-lg flex items-center justify-center text-[#181818]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" />
            <path
              d="M2 17l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="text-2xl font-bold tracking-tight text-white">iWana neXt</span>
      </div>

      {/* Center Content */}
      <div className="relative z-10 my-auto">
        <h1 className="text-4xl lg:text-6xl font-bold leading-tight tracking-tight mb-6 max-w-xl text-white">
          {title}
          <br />
          <span className="text-[#A5C330]">Sistema Integrado</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-md leading-relaxed">{subtitle}</p>
        {children ?? (
          <div className="mt-8 flex gap-4">
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-slate-300">
              <svg
                className="w-4 h-4 text-[#A5C330]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-sm font-medium">Cifrado AES-256</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-slate-300">
              <svg
                className="w-4 h-4 text-[#A5C330]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span className="text-sm font-medium">Baja Latencia</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 text-sm text-slate-500">
        © 2026 iWana Network Inc. Todos los derechos reservados.
      </div>
    </div>
  );
}
