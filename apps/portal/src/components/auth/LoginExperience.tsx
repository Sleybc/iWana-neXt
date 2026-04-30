'use client';

import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { LoginForm } from '@/components/auth/LoginForm';
import { tenantSelfApi, type TenantPublicBranding } from '@/lib/api-client';

const DEFAULT_FAVICON_PATH = '/brand/iwiso6.png';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function normalizeTenantSlug(value: string): string {
  return value.trim().toLowerCase();
}

function resolvePublicFaviconUrl(branding: TenantPublicBranding | null, isDark: boolean): string {
  if (!branding) {
    return DEFAULT_FAVICON_PATH;
  }

  const themedFavicon = isDark
    ? (branding.faviconDarkUrl ?? branding.faviconLightUrl)
    : (branding.faviconLightUrl ?? branding.faviconDarkUrl);

  if (themedFavicon) {
    return themedFavicon;
  }

  const themedSeal = isDark
    ? (branding.sealDarkUrl ?? branding.sealLightUrl)
    : (branding.sealLightUrl ?? branding.sealDarkUrl);

  return themedSeal ?? DEFAULT_FAVICON_PATH;
}

function upsertFaviconLink(kind: string, rel: string, href: string): void {
  if (!isBrowser()) {
    return;
  }

  let link = document.head.querySelector<HTMLLinkElement>(
    `link[data-iwana-login-favicon="${kind}"]`,
  );
  if (!link) {
    link = document.createElement('link');
    link.dataset.iwanaLoginFavicon = kind;
    document.head.appendChild(link);
  }

  link.rel = rel;
  link.href = href;
}

function applyFavicon(href: string): void {
  upsertFaviconLink('icon', 'icon', href);
  upsertFaviconLink('shortcut', 'shortcut icon', href);
}

export function LoginExperience() {
  const [tenantSlug, setTenantSlug] = useState(process.env.NEXT_PUBLIC_TENANT_SLUG ?? '');
  const [branding, setBranding] = useState<TenantPublicBranding | null>(null);
  const [isBrandingLoading, setIsBrandingLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const deferredTenantSlug = useDeferredValue(tenantSlug);

  useEffect(() => {
    if (!isBrowser()) {
      return;
    }

    const html = document.documentElement;
    const updateTheme = () => setIsDark(html.classList.contains('dark'));

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const normalizedSlug = normalizeTenantSlug(deferredTenantSlug);

    if (!normalizedSlug) {
      startTransition(() => setBranding(null));
      setIsBrandingLoading(false);
      return;
    }

    let active = true;
    setIsBrandingLoading(true);

    void tenantSelfApi
      .getPublicBranding(normalizedSlug)
      .then((result) => {
        if (!active) {
          return;
        }

        startTransition(() => setBranding(result));
      })
      .catch(() => {
        if (!active) {
          return;
        }

        startTransition(() => setBranding(null));
      })
      .finally(() => {
        if (active) {
          setIsBrandingLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [deferredTenantSlug]);

  useEffect(() => {
    applyFavicon(resolvePublicFaviconUrl(branding, isDark));
  }, [branding, isDark]);

  return (
    <main
      className="group/login relative flex min-h-screen w-full flex-col overflow-hidden bg-[#181818] lg:flex-row"
      aria-label="Página de inicio de sesión"
    >
      <LoginBrandPanel branding={branding} isLoadingBranding={isBrandingLoading} />

      <div className="relative flex w-full items-center justify-center bg-[#181818] p-6 lg:w-1/2 lg:p-12">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:32px_32px]" />

        <div className="relative z-10 w-full max-w-[520px] rounded-[30px] border border-white/70 bg-white/95 p-8 shadow-iwana-lg lg:p-12">
          <div className="mb-10">
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#A5C330]">
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
              <span className="font-bold text-[#181818]">
                {branding?.showTenantName ? branding.displayName : 'iWana neXt'}
              </span>
            </div>

            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700">
              Portal corporativo
            </p>
            <h2 className="mb-2 text-3xl font-bold text-[#181818]">
              {branding?.showTenantName
                ? `Bienvenido a ${branding.displayName}`
                : 'Bienvenido al portal'}
            </h2>
            <p className="text-base text-slate-500">
              Ingresa tus credenciales para acceder a tus servicios y a la operación de la empresa.
            </p>
          </div>

          <LoginForm tenantSlug={tenantSlug} onTenantSlugChange={setTenantSlug} />
        </div>
      </div>
    </main>
  );
}
