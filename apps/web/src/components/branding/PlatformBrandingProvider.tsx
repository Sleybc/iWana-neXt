'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { platformBrandingApi, type PlatformPublicBranding } from '@/lib/api-client';

export const PLATFORM_BRANDING_DEFAULTS: PlatformPublicBranding = {
  productName: 'iWana neXt',
  surfaceName: 'Portal administrativo',
  metadataTitle: 'iWana neXt — Portal Administrativo',
  metadataDescription: 'Portal administrativo para operadores ISP iWana neXt',
  logoUrl: '/brand/iwiso6.png',
  faviconUrl: '/brand/favicon-gecko.svg',
  loginBackgroundLightUrl: null,
  loginBackgroundDarkUrl: null,
};

interface PlatformBrandingContextValue {
  branding: PlatformPublicBranding;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const PlatformBrandingContext = createContext<PlatformBrandingContextValue | undefined>(undefined);

function resolveBrandingUrl(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function applyDocumentBranding(branding: PlatformPublicBranding): void {
  document.title = branding.metadataTitle || PLATFORM_BRANDING_DEFAULTS.metadataTitle;

  const description =
    document.querySelector<HTMLMetaElement>('meta[name="description"]') ??
    document.head.appendChild(document.createElement('meta'));
  description.name = 'description';
  description.content =
    branding.metadataDescription || PLATFORM_BRANDING_DEFAULTS.metadataDescription;

  const faviconUrl = resolveBrandingUrl(
    branding.faviconUrl,
    PLATFORM_BRANDING_DEFAULTS.faviconUrl ?? '/brand/favicon-gecko.svg',
  );
  const icon =
    document.querySelector<HTMLLinkElement>('link[rel="icon"][data-platform-branding="true"]') ??
    document.head.appendChild(document.createElement('link'));
  icon.rel = 'icon';
  icon.href = faviconUrl;
  icon.setAttribute('data-platform-branding', 'true');
}

export function PlatformBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<PlatformPublicBranding>(PLATFORM_BRANDING_DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await platformBrandingApi.getPublic();
      setBranding({ ...PLATFORM_BRANDING_DEFAULTS, ...data });
      applyDocumentBranding({ ...PLATFORM_BRANDING_DEFAULTS, ...data });
    } catch {
      setBranding(PLATFORM_BRANDING_DEFAULTS);
      applyDocumentBranding(PLATFORM_BRANDING_DEFAULTS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ branding, isLoading, refresh }), [branding, isLoading, refresh]);

  return (
    <PlatformBrandingContext.Provider value={value}>{children}</PlatformBrandingContext.Provider>
  );
}

export function usePlatformBranding(): PlatformBrandingContextValue {
  const context = useContext(PlatformBrandingContext);
  if (!context) {
    throw new Error('usePlatformBranding debe usarse dentro de PlatformBrandingProvider.');
  }
  return context;
}

export function usePlatformBrandingAssets() {
  const { branding, refresh, isLoading } = usePlatformBranding();

  return {
    branding,
    refresh,
    isLoading,
    logoUrl: resolveBrandingUrl(branding.logoUrl, PLATFORM_BRANDING_DEFAULTS.logoUrl ?? ''),
    faviconUrl: resolveBrandingUrl(
      branding.faviconUrl,
      PLATFORM_BRANDING_DEFAULTS.faviconUrl ?? '',
    ),
    loginBackgroundLightUrl: branding.loginBackgroundLightUrl,
    loginBackgroundDarkUrl: branding.loginBackgroundDarkUrl,
  };
}
