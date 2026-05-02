'use client';

import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { LoginForm } from '@/components/auth/LoginForm';
import { tenantSelfApi, type TenantPublicBranding } from '@/lib/api-client';
import { resolveTenantSlug } from '@/lib/tenant-resolution';
import { AuthBrandHeader, AuthPremiumShell } from '@iwana/ui';

const DEFAULT_FAVICON_PATH = '/brand/iwiso6.png';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
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
  const [tenantSlug, setTenantSlug] = useState('');
  const [branding, setBranding] = useState<TenantPublicBranding | null>(null);
  const [isBrandingLoading, setIsBrandingLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const tenantResolution = resolveTenantSlug(tenantSlug);
  const deferredTenantSlug = useDeferredValue(tenantResolution.slug);

  useEffect(() => {
    const initialResolution = resolveTenantSlug();
    if (initialResolution.slug) {
      setTenantSlug(initialResolution.slug);
    }
  }, []);

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
    if (!deferredTenantSlug) {
      startTransition(() => setBranding(null));
      setIsBrandingLoading(false);
      return;
    }

    let active = true;
    setIsBrandingLoading(true);

    void tenantSelfApi
      .getPublicBranding(deferredTenantSlug)
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

  useEffect(() => {
    if (!isBrowser()) {
      return;
    }

    document.title = branding?.metadataTitle ?? 'iWana neXt';
  }, [branding]);

  const tenantProductName = branding?.productName ?? branding?.displayName ?? 'iWana neXt';
  const tenantSurfaceName = branding?.surfaceName ?? 'Portal corporativo';
  const tenantName = branding?.showTenantName ? tenantProductName : 'iWana neXt';
  const tenantLogo = branding?.logoDarkUrl ?? branding?.logoLightUrl ?? null;
  const backgroundUrl =
    branding?.loginBackgroundDarkUrl ?? branding?.loginBackgroundLightUrl ?? null;

  return (
    <AuthPremiumShell
      ariaLabel="Página de inicio de sesión"
      backgroundUrl={backgroundUrl}
      shellClassName="w-full max-w-[1160px]"
      panelClassName="max-w-[560px] lg:max-w-[520px]"
      aside={<LoginBrandPanel branding={branding} isLoadingBranding={isBrandingLoading} />}
      mobileHeader={
        <AuthBrandHeader
          name={tenantName}
          logoUrl={tenantLogo}
          className="mb-6 lg:hidden"
          logoContainerClassName="h-8 w-8"
          textClassName="text-[#181818]"
        />
      }
      intro={
        <>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
            {tenantSurfaceName}
          </p>
          <h2 className="mb-2 text-3xl font-bold text-[#181818] dark:text-white">
            {branding?.showTenantName
              ? `Bienvenido a ${tenantProductName}`
              : 'Bienvenido al portal'}
          </h2>
          <p className="text-base text-slate-500 dark:text-gray-400">
            Ingresa tus credenciales para acceder a tus servicios y a la operación de la empresa.
          </p>
        </>
      }
      form={
        <LoginForm
          tenantSlug={tenantSlug}
          tenantLocked={tenantResolution.isLocked}
          onTenantSlugChange={setTenantSlug}
        />
      }
    />
  );
}
