'use client';

import { useEffect, useState } from 'react';
import { tenantSelfApi, type TenantSelf } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';

const DEFAULT_FAVICON_PATH = '/brand/iwiso6.png';
const BRANDING_EVENT_NAME = 'tenant-branding-updated';

type BrandingSnapshot = Pick<TenantSelf, 'name' | 'sealLightUrl' | 'sealDarkUrl'>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function resolveFaviconUrl(branding: BrandingSnapshot | null, isDark: boolean): string {
  if (!branding) {
    return DEFAULT_FAVICON_PATH;
  }

  const themedUrl = isDark
    ? (branding.sealDarkUrl ?? branding.sealLightUrl)
    : (branding.sealLightUrl ?? branding.sealDarkUrl);

  return themedUrl ?? DEFAULT_FAVICON_PATH;
}

function upsertFaviconLink(kind: string, rel: string, href: string): void {
  if (!isBrowser()) {
    return;
  }

  let link = document.head.querySelector<HTMLLinkElement>(`link[data-iwana-favicon="${kind}"]`);
  if (!link) {
    link = document.createElement('link');
    link.dataset.iwanaFavicon = kind;
    document.head.appendChild(link);
  }

  link.rel = rel;
  link.href = href;
}

function applyFavicon(href: string): void {
  upsertFaviconLink('icon', 'icon', href);
  upsertFaviconLink('shortcut', 'shortcut icon', href);
}

/**
 * Sincroniza el favicon del portal con el sello actual del tenant autenticado.
 * Si el tenant no tiene branding configurado, usa un favicon base local del portal.
 */
export function TenantFavicon() {
  const { user } = useAuth();
  const [branding, setBranding] = useState<BrandingSnapshot | null>(null);
  const [isDark, setIsDark] = useState(false);

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
    let active = true;

    const loadBranding = async () => {
      if (!user) {
        if (active) {
          setBranding(null);
        }
        return;
      }

      try {
        const profile = await tenantSelfApi.getProfile();
        if (active) {
          setBranding({
            name: profile.name,
            sealLightUrl: profile.sealLightUrl,
            sealDarkUrl: profile.sealDarkUrl,
          });
        }
      } catch {
        if (active) {
          setBranding(null);
        }
      }
    };

    void loadBranding();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!isBrowser()) {
      return;
    }

    const handleBrandingUpdated = (event: Event) => {
      const detail = (event as CustomEvent<BrandingSnapshot>).detail;
      if (!detail) {
        return;
      }

      setBranding(detail);
    };

    window.addEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);

    return () => {
      window.removeEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);
    };
  }, []);

  useEffect(() => {
    applyFavicon(resolveFaviconUrl(branding, isDark));
  }, [branding, isDark]);

  return null;
}