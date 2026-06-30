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
      : 'Autenticación segura, MFA y trazabilidad para la operación empresarial.');

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
          {isLoadingBranding ? 'Resolviendo identidad' : 'Acceso empresarial'}
        </p>
        <h1 className="mb-4 max-w-xl text-3xl font-bold leading-tight tracking-tight text-white lg:text-5xl">
          {resolvedTitle}
          <br />
          <span className="text-[#A5C330]">
            {branding?.showTenantName ? surfaceName : 'Sistema Integrado'}
          </span>
        </h1>
        <p className="max-w-md text-base leading-relaxed text-slate-400">{resolvedSubtitle}</p>
        {children ?? (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-[#A5C330]" aria-hidden="true" />
            MFA y trazabilidad activas por empresa
          </div>
        )}
      </div>

      <div className="relative z-10 text-sm text-slate-500">
        © 2026 iWana Network Inc. Todos los derechos reservados.
      </div>
    </div>
  );
}
