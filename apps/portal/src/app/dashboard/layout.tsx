// apps/portal/src/app/dashboard/layout.tsx
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { tenantSelfApi, type TenantSelf } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';

const BRANDING_EVENT_NAME = 'tenant-branding-updated';

type BrandingSnapshot = Pick<
  TenantSelf,
  | 'name'
  | 'showTenantName'
  | 'logoLightUrl'
  | 'logoDarkUrl'
  | 'sealLightUrl'
  | 'sealDarkUrl'
  | 'faviconLightUrl'
  | 'faviconDarkUrl'
  | 'loginBackgroundLightUrl'
  | 'loginBackgroundDarkUrl'
  | 'brandingProductName'
  | 'brandingSurfaceName'
  | 'brandingMetadataTitle'
  | 'brandingMetadataDescription'
>;

function resolveDashboardTitle(profile: TenantSelf | null): string {
  const metadataTitle = profile?.brandingMetadataTitle?.trim();
  if (metadataTitle) {
    return metadataTitle;
  }

  const brandingProductName = profile?.brandingProductName?.trim();
  if (brandingProductName) {
    return `${brandingProductName} — Portal empresarial`;
  }

  if (profile?.name) {
    return `${profile.name} — Portal empresarial`;
  }

  return 'iWana neXt';
}

/**
 * Layout Base del Portal Suscriptor.
 *
 * Estado de sidebar separado segun HLD-TRANSVERSAL-ADOPCION-TAILADMIN:
 * - sidebarDesktopCollapsed: colapso del sidebar en desktop (persiste en localStorage via Sidebar)
 * - sidebarMobileOpen: drawer overlay en mobile (transitorio, no persiste)
 */
export default function PortalDashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Estado desktop: el sidebar arranca expandido
  const [sidebarDesktopCollapsed, setSidebarDesktopCollapsed] = useState(false);
  // Estado mobile: el drawer arranca cerrado
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  // Perfil del tenant — cargado una vez para sidebar y otros consumidores del layout
  const [tenantProfile, setTenantProfile] = useState<TenantSelf | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) {
      setTenantProfile(null);
      return;
    }

    void tenantSelfApi
      .getMe()
      .then(setTenantProfile)
      .catch(() => null);
  }, [user]);

  useEffect(() => {
    const handleBrandingUpdated = (event: Event) => {
      const detail = (event as CustomEvent<BrandingSnapshot>).detail;
      if (!detail) {
        return;
      }

      setTenantProfile((currentProfile) => {
        if (!currentProfile) {
          return currentProfile;
        }

        return {
          ...currentProfile,
          ...detail,
        };
      });
    };

    window.addEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);

    return () => {
      window.removeEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.title = resolveDashboardTitle(tenantProfile);
  }, [tenantProfile]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-dark-surface">
        <p className="text-sm text-gray-600 dark:text-gray-300">Validando sesión...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-white dark:bg-dark-surface-2">
      {/* OVERLAY para mobile — cierra el drawer al hacer click externo */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-[9998] bg-black/50 lg:hidden"
          onClick={() => setSidebarMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* COMPONENTE SIDEBAR */}
      <Sidebar
        desktopCollapsed={sidebarDesktopCollapsed}
        setDesktopCollapsed={setSidebarDesktopCollapsed}
        mobileOpen={sidebarMobileOpen}
        setMobileOpen={setSidebarMobileOpen}
        profile={tenantProfile}
      />

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <div className="relative flex min-h-screen flex-1 flex-col overflow-x-hidden">
        {/* HEADER */}
        <TopHeader
          desktopCollapsed={sidebarDesktopCollapsed}
          setDesktopCollapsed={setSidebarDesktopCollapsed}
          mobileOpen={sidebarMobileOpen}
          setMobileOpen={setSidebarMobileOpen}
        />

        {/* CONTENIDO DE LA PÁGINA */}
        <main className="flex-1 bg-slate-50 dark:bg-dark-surface lg:rounded-3xl">
          <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
