// apps/web/src/components/auth/LoginBrandPanel.tsx
import type { ReactNode } from 'react';

/**
 * Panel izquierdo del login — identidad iWana neXt.
 * Gradiente Azul Noche → Azul Medio + glassmorphism card.
 * Solo visible en pantallas lg+.
 */
interface LoginBrandPanelProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

export function LoginBrandPanel({
  title = 'Control total de tu red',
  subtitle = 'Plataforma OSS/BSS para operadores ISP colombianos',
  children,
}: LoginBrandPanelProps) {
  return (
    <div
      className="hidden lg:flex lg:w-2/5 flex-col justify-between p-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #17163A 0%, #2D2A9E 100%)' }}
    >
      {/* Patrón de fondo decorativo */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #A5C330 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
      />

      {/* Logo */}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(165, 195, 48, 0.2)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" />
              <path
                d="M2 17l10 5 10-5"
                stroke="#A5C330"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 12l10 5 10-5"
                stroke="#A5C330"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-white font-bold text-xl tracking-tight">iWana neXt</span>
        </div>
      </div>

      {/* Contenido central */}
      <div className="relative z-10 flex-1 flex flex-col justify-center gap-8">
        <div>
          <h1 className="text-3xl font-bold text-white leading-tight">{title}</h1>
          <p className="mt-3 text-base" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {subtitle}
          </p>
        </div>

        {/* Glassmorphism card */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          {children ?? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#A5C330]" aria-hidden="true" />
                <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  Plataforma operativa
                </span>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                &ldquo;Conecta tu mundo con tecnología de punta para ISPs colombianos&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          © 2026 iWana Technologies. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
