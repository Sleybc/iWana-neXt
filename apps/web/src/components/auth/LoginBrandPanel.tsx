'use client';

// apps/web/src/components/auth/LoginBrandPanel.tsx
import type { ReactNode } from 'react';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';

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
  subtitle = 'Autenticación segura, trazabilidad activa y gobierno centralizado para la operación de plataforma.',
  children,
}: LoginBrandPanelProps) {
  const { branding, logoUrl, faviconUrl, loginBackgroundLightUrl, loginBackgroundDarkUrl } =
    usePlatformBrandingAssets();
  const backgroundUrl = loginBackgroundDarkUrl || loginBackgroundLightUrl;
  const showBrandWatermark = !backgroundUrl;

  return (
    <div className="relative hidden overflow-hidden border-r border-white/5 bg-[#181818] p-8 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-16">
      <div
        className="absolute inset-0 z-0 bg-[linear-gradient(135deg,#181818_0%,#17163A_58%,#0F0E24_100%)]"
        style={
          backgroundUrl
            ? {
                backgroundImage: `linear-gradient(135deg, rgba(24,24,24,0.58), rgba(23,22,58,0.36), rgba(15,14,36,0.5)), url(${backgroundUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      />
      {showBrandWatermark ? (
        <img
          src={faviconUrl}
          alt=""
          aria-hidden="true"
          className="absolute -right-24 top-1/2 z-0 h-auto w-[560px] -translate-y-1/2 opacity-[0.08]"
        />
      ) : null}

      {/* Top Header */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#A5C330] text-[#181818]">
          <img src={logoUrl} alt="" className="h-7 w-7 object-contain" aria-hidden="true" />
        </div>
        <span className="text-2xl font-bold tracking-tight text-white">{branding.productName}</span>
      </div>

      {/* Center Content */}
      <div className="relative z-10 my-auto">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#A5C330]">
          Gobierno de plataforma
        </p>
        <h1 className="mb-6 max-w-xl text-4xl font-bold leading-tight tracking-tight text-white lg:text-6xl">
          {title}
          <br />
          <span className="text-[#A5C330]">Sistema Integrado</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-md leading-relaxed">{subtitle}</p>
        {children ?? (
          <div className="mt-8 flex gap-4">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-300 backdrop-blur-md">
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
              <span className="text-sm font-medium">Acceso seguro</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-300 backdrop-blur-md">
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
              <span className="text-sm font-medium">Operación interna</span>
            </div>
          </div>
        )}

        <div className="mt-10 grid max-w-xl grid-cols-2 gap-3">
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#A5C330]">
              Velocidad
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Navegación rápida para tenants, usuarios y auditoría global.
            </p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#A5C330]">
              Expertos
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Flujo pensado para soporte, gobierno y control de plataforma.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 text-sm text-slate-500">
        © 2026 {branding.productName}. Todos los derechos reservados.
      </div>
    </div>
  );
}
