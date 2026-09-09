// apps/portal/src/app/dashboard/layout.tsx
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PermissionsProvider } from '@/components/access-control/permissions-context';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { tenantSelfApi, type TenantSelf } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import { resolveTenantSlug } from '@/lib/tenant-resolution';
import {
  PORTAL_MODAL_DRAWER_STATE_EVENT,
  type PortalModalDrawerStateDetail,
} from '@/components/shared/portal-side-drawer-layers';

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
  // Un drawer modal del portal (p. ej. detalle de producto en Inventario) está
  // abierto: el chrome (Sidebar y TopHeader) queda bajo el velo —atenuado y
  // desenfocado— e inerte, y el sidebar mobile se cierra para no coexistir con
  // el drawer.
  const [modalDrawerOpen, setModalDrawerOpen] = useState(false);
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

    // HLD-MOD02 §5.2: GET /tenants/me solo ADMIN/NOC/ACCOUNTANT/SUPPORT.
    // TÉCNICO/SALES/etc usan public-branding para no generar 403.
    const operationalRoles = new Set(['ADMIN', 'NOC', 'ACCOUNTANT', 'SUPPORT']);
    if (!operationalRoles.has(user.role)) {
      // Fallback no sensible para TÉCNICO: public-branding
      const slug = resolveTenantSlug().slug;
      if (!slug) {
        setTenantProfile(null);
        return;
      }
      void tenantSelfApi
        .getPublicBranding(slug)
        .then((branding) =>
          setTenantProfile({
            id: '',
            name: branding.displayName,
            slug,
            status: 'ACTIVE',
            contactEmail: '',
            legalName: null,
            nit: null,
            nitDv: null,
            city: null,
            department: null,
            countryCode: null,
            phone: null,
            website: null,
            createdAt: new Date(0).toISOString(),
            logoLightUrl: branding.logoLightUrl,
            logoLightAssetId: null,
            logoDarkUrl: branding.logoDarkUrl,
            logoDarkAssetId: null,
            sealLightUrl: branding.sealLightUrl,
            sealLightAssetId: null,
            sealDarkUrl: branding.sealDarkUrl,
            sealDarkAssetId: null,
            faviconLightUrl: branding.faviconLightUrl,
            faviconLightAssetId: null,
            faviconDarkUrl: branding.faviconDarkUrl,
            faviconDarkAssetId: null,
            loginBackgroundLightUrl: branding.loginBackgroundLightUrl,
            loginBackgroundLightAssetId: null,
            loginBackgroundDarkUrl: branding.loginBackgroundDarkUrl,
            loginBackgroundDarkAssetId: null,
            showTenantName: branding.showTenantName,
            brandingProductName: branding.productName,
            brandingSurfaceName: branding.surfaceName,
            brandingMetadataTitle: branding.metadataTitle,
            brandingMetadataDescription: branding.metadataDescription,
          }),
        )
        .catch(() => setTenantProfile(null));
      return;
    }

    void tenantSelfApi
      .getMe()
      .then(setTenantProfile)
      .catch(() => setTenantProfile(null));
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

  // Drawer modal del portal (difundido por `usePortalModalDrawerBroadcast`):
  // vuelve el chrome inerte y cierra el sidebar mobile para no abrir ambos a
  // la vez. El drawer vive después en el DOM, así que manda él.
  useEffect(() => {
    const handleModalDrawerState = (event: Event) => {
      const detail = (event as CustomEvent<PortalModalDrawerStateDetail>).detail;
      if (!detail) {
        return;
      }

      setModalDrawerOpen(detail.open);
      if (detail.open) {
        setSidebarMobileOpen(false);
      }
    };

    window.addEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, handleModalDrawerState);
    return () => {
      window.removeEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, handleModalDrawerState);
    };
  }, []);

  if (authLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-iwana-neutral-50 dark:bg-dark-surface">
        <p className="text-sm text-gray-600 dark:text-gray-300">Validando sesión...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <PermissionsProvider>
      <div className="flex min-h-screen overflow-x-hidden bg-white dark:bg-dark-surface-2">
        {/* OVERLAY para mobile — cierra el drawer al hacer click externo.
            Adopta el token `--color-veil` (/45 en claro, /60 en oscuro) y gana
            así el valor de modo oscuro que no tenía. NO consume `ModalLayer`:
            es la excepción de §2bis —su panel es el `Sidebar`, chrome que no
            puede portalarse—, así que sigue siendo un constructo de dos
            escalones con el velo por DEBAJO del panel. Sin desenfoque a
            propósito: es el único velo de la familia que no debe desenfocar. */}
        {sidebarMobileOpen && (
          <div
            className="fixed inset-0 z-(--z-shell-raised) bg-(--color-veil) lg:hidden"
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
          modalDrawerOpen={modalDrawerOpen}
        />

        {/* ÁREA DE CONTENIDO PRINCIPAL */}
        <div className="relative flex min-h-screen flex-1 flex-col overflow-x-hidden">
          {/* HEADER */}
          <TopHeader
            desktopCollapsed={sidebarDesktopCollapsed}
            setDesktopCollapsed={setSidebarDesktopCollapsed}
            mobileOpen={sidebarMobileOpen}
            setMobileOpen={setSidebarMobileOpen}
            modalDrawerOpen={modalDrawerOpen}
          />

          {/* CONTENIDO DE LA PÁGINA */}
          <main className="flex-1 bg-iwana-neutral-50 dark:bg-dark-surface lg:rounded-3xl">
            <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">{children}</div>
          </main>
        </div>
      </div>
    </PermissionsProvider>
  );
}
