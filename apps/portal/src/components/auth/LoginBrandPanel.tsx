'use client';

import type { ReactNode } from 'react';
import { type TenantPublicBranding } from '@/lib/api-client';

/**
 * Panel izquierdo del login — identidad iWana neXt.
 * Adaptado del prototipo de identidad visual.
 */
interface LoginBrandPanelProps {
  branding?: TenantPublicBranding | null;
  isLoadingBranding?: boolean;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

export function LoginBrandPanel({
  branding,
  isLoadingBranding = false,
  title,
  subtitle,
  children,
}: LoginBrandPanelProps) {
  const headerLogo = branding?.logoDarkUrl ?? branding?.logoLightUrl;
  const productName = branding?.productName ?? branding?.displayName ?? 'iWana neXt';
  const surfaceName = branding?.surfaceName ?? 'Portal empresarial';
  const resolvedTitle = title ?? (branding?.showTenantName ? productName : 'iWana neXt');
  const resolvedSubtitle =
    subtitle ??
    (branding?.showTenantName
      ? `Acceso seguro al portal de ${productName} con políticas activas y trazabilidad por empresa.`
      : 'Autenticación segura, trazabilidad activa y una experiencia premium para la operación empresarial.');

  return (
    <div className="relative hidden border-r border-white/10 p-8 text-white lg:flex lg:flex-col lg:justify-between lg:p-16">
      <div className="relative z-10 flex items-center gap-3">
        {headerLogo ? (
          <div className="flex h-12 min-w-[140px] items-center rounded-2xl bg-white/8 px-4 backdrop-blur-md">
            <img src={headerLogo} alt={resolvedTitle} className="max-h-7 w-auto object-contain" />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#A5C330] text-[#181818]">
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
        )}
        <span className="text-2xl font-bold tracking-tight text-white">{resolvedTitle}</span>
      </div>

      <div className="relative z-10 my-auto">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#A5C330]">
          {isLoadingBranding ? 'Resolviendo identidad' : 'Conectividad premium'}
        </p>
        <h1 className="mb-6 max-w-xl text-4xl font-bold leading-tight tracking-tight text-white lg:text-6xl">
          {resolvedTitle}
          <br />
          <span className="text-[#A5C330]">
            {branding?.showTenantName ? surfaceName : 'Sistema Integrado'}
          </span>
        </h1>
        <p className="text-lg text-slate-400 max-w-md leading-relaxed">{resolvedSubtitle}</p>
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
              <span className="text-sm font-medium">Cifrado AES-256</span>
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
              <span className="text-sm font-medium">Baja Latencia</span>
            </div>
          </div>
        )}

        <div className="mt-10 grid max-w-xl grid-cols-2 gap-3">
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#A5C330]">
              Velocidad
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Inicio rápido con políticas activas y rutas seguras por empresa.
            </p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#A5C330]">
              Expertos
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Flujo pensado para operación empresarial, soporte y control de acceso.
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 text-sm text-slate-500">
        © 2026 iWana Network Inc. Todos los derechos reservados.
      </div>
    </div>
  );
}
