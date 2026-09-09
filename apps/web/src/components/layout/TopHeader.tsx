// apps/web/src/components/layout/TopHeader.tsx
'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, Search, X } from 'lucide-react';
import {
  cn,
  headerIconControlClassName,
  interactiveFocusClassName,
  ShellSearchSheet,
} from '@iwana/ui';
import { DropdownUser } from './DropdownUser';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { PlatformBrandMark } from './PlatformBrandMark';

interface TopHeaderProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

export const TopHeader = ({
  desktopCollapsed,
  setDesktopCollapsed,
  mobileOpen,
  setMobileOpen,
}: TopHeaderProps) => {
  const { logoUrl } = usePlatformBrandingAssets();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const menuToggleAriaProps = {
    'aria-controls': 'sidebar',
    'aria-expanded': mobileOpen,
    'aria-label': mobileOpen ? PLATFORM_UI_COPY.shell.closeMenu : PLATFORM_UI_COPY.shell.openMenu,
  } as const;

  const desktopMenuToggleAriaProps = {
    'aria-controls': 'sidebar',
    'aria-expanded': !desktopCollapsed,
    'aria-label': desktopCollapsed
      ? PLATFORM_UI_COPY.shell.expandSidebar
      : PLATFORM_UI_COPY.shell.collapseSidebar,
  } as const;

  return (
    // El escalón de la hoja de búsqueda móvil es ESTE, no el de la hoja: el header
    // es `sticky` y crea contexto de apilamiento, así que cualquier z declarado en
    // un descendiente ordena solo hermanos. Se queda en --z-sticky (100) porque
    // apps/web no tiene ninguna barra de shell adherida posterior en el DOM con la
    // que competir; el gemelo del portal está en 200 por su subnav de módulo, y esa
    // diferencia es correcta: el escalón describe la vecindad, no el componente
    // (ADR-075 §2). Disparo para subir a --z-shell-raised: el día que apps/web
    // incorpore su propio subnav en --z-sticky. No copiar el 200 del portal antes.
    //
    // [PENDIENTE de verificación en navegador] `backdrop-blur` convierte a este
    // header en bloque contenedor de descendientes `fixed`: si el navegador lo
    // aplica como especifica Filter Effects L2, el `fixed inset-0` de la hoja
    // cubre la caja del header, no el viewport. La corrección sería del constructo
    // (portalar la hoja fuera del header), no del token, y exige reasignación de
    // escalón por AI-DS-OWNER.
    <header className="sticky top-0 z-(--z-sticky) flex w-full border-b border-transparent bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-transparent dark:bg-dark-surface-2/95">
      <div className="flex flex-grow items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            {...desktopMenuToggleAriaProps}
            onClick={(e) => {
              e.stopPropagation();
              setDesktopCollapsed(!desktopCollapsed);
            }}
            className={cn(headerIconControlClassName, interactiveFocusClassName, 'hidden lg:flex')}
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
            className={cn(headerIconControlClassName, interactiveFocusClassName, 'lg:hidden')}
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link
            className={cn('flex shrink-0 lg:hidden', interactiveFocusClassName)}
            href="/dashboard"
            aria-label={PLATFORM_UI_COPY.shell.goHome}
          >
            <PlatformBrandMark logoUrl={logoUrl} />
          </Link>

          <div className="hidden min-w-0 xl:block">
            <p className="portal-eyebrow-muted">{PLATFORM_UI_COPY.shell.workspace}</p>
            <p className="truncate text-sm font-semibold text-iwana-primary dark:text-white">
              {PLATFORM_UI_COPY.navigation.home}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {PLATFORM_UI_COPY.shell.workspaceSubtitle}
            </p>
          </div>
        </div>

        <div className="mx-6 hidden flex-1 lg:flex lg:justify-center">
          <div className="w-full max-w-2xl">
            <GlobalSearch />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            ref={searchTriggerRef}
            type="button"
            aria-label="Buscar en la plataforma"
            aria-expanded={mobileSearchOpen}
            aria-controls="shell-search-sheet"
            onClick={() => setMobileSearchOpen(true)}
            className={cn(headerIconControlClassName, interactiveFocusClassName, 'lg:hidden')}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
          <ThemeToggle />
          <NotificationBell />
          <DropdownUser />
        </div>
      </div>

      <ShellSearchSheet
        open={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
        title="Buscar en la plataforma"
        closeLabel="Cerrar búsqueda"
        triggerRef={searchTriggerRef}
      >
        <GlobalSearch />
      </ShellSearchSheet>
    </header>
  );
};
