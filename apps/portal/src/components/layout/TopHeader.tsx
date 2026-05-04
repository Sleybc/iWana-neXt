// apps/portal/src/components/layout/TopHeader.tsx
'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { Menu } from 'lucide-react';
import { TenantSeal } from './TenantSeal';
import { DropdownUser } from './DropdownUser';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import type { TenantSelf } from '@/lib/api-client';

interface TopHeaderProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  profile?: TenantSelf | null;
}

function resolveTenantDisplayName(profile?: TenantSelf | null): string {
  const brandingProductName = profile?.brandingProductName?.trim();

  if (brandingProductName) {
    return brandingProductName;
  }

  return profile?.name ?? 'iWana Empresa';
}

export const TopHeader = ({
  desktopCollapsed,
  setDesktopCollapsed,
  mobileOpen,
  setMobileOpen,
  profile,
}: TopHeaderProps) => {
  const tenantDisplayName = resolveTenantDisplayName(profile);
  const menuToggleAriaProps = {
    'aria-controls': 'sidebar',
    'aria-expanded': mobileOpen,
    'aria-label': mobileOpen ? 'Cerrar menú' : 'Abrir menú',
  } as const;

  const desktopMenuToggleAriaProps = {
    'aria-controls': 'sidebar',
    'aria-expanded': !desktopCollapsed,
    'aria-label': desktopCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral',
  } as const;

  return (
    <header className="sticky top-0 z-[999] flex w-full border-b border-transparent bg-white dark:border-transparent dark:bg-dark-surface-2">
      <div className="flex flex-grow items-center justify-between px-4 py-3 md:px-6">
        {/* IZQUIERDA: botón hamburger + logo mobile */}
        <div className="flex items-center gap-3">
          {/* Hamburger desktop — colapsa/expande sidebar */}
          <button
            type="button"
            {...desktopMenuToggleAriaProps}
            onClick={(e) => {
              e.stopPropagation();
              setDesktopCollapsed(!desktopCollapsed);
            }}
            className={`hidden h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 lg:flex dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-surface-4 ${interactiveFocusClassName}`}
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            type="button"
            {...menuToggleAriaProps}
            onClick={(e) => {
              e.stopPropagation();
              setMobileOpen(!mobileOpen);
            }}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 lg:hidden dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-surface-4 ${interactiveFocusClassName}`}
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link
            className={`flex shrink-0 items-center rounded-lg lg:hidden ${interactiveFocusClassName}`}
            href="/dashboard"
            aria-label={`Ir al dashboard de ${tenantDisplayName}`}
          >
            <TenantSeal
              sealLightUrl={profile?.sealLightUrl ?? null}
              sealDarkUrl={profile?.sealDarkUrl ?? null}
              name={tenantDisplayName}
              size="sm"
            />
          </Link>
        </div>

        {/* CENTRO: buscador — Suspense requerido por useSearchParams */}
        <div className="hidden lg:block flex-1 max-w-lg mx-6">
          <Suspense
            fallback={
              <div className="h-10 rounded-lg border border-gray-200 bg-white dark:border-dark-border-2 dark:bg-dark-surface-3" />
            }
          >
            <GlobalSearch />
          </Suspense>
        </div>

        {/* DERECHA: acciones + usuario */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          <NotificationBell />

          <DropdownUser />
        </div>
      </div>
    </header>
  );
};
