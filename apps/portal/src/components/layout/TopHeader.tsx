// apps/portal/src/components/layout/TopHeader.tsx
'use client';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Menu, Search, X } from 'lucide-react';
import { cn, headerIconControlClassName, interactiveFocusClassName } from '@iwana/ui';
import { DropdownUser } from './DropdownUser';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { GlobalSearch } from '@/components/search/GlobalSearch';

interface TopHeaderProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  /**
   * True mientras un drawer modal del portal está abierto (p. ej. el detalle
   * de producto de Inventario). El header se mantiene en z-(--z-sticky), por
   * debajo del velo (z-overlay), para atenuarse y desenfocarse con el resto
   * del chrome, y queda inerte + aria-hidden para confinar el foco al panel.
   */
  modalDrawerOpen?: boolean;
}

export const TopHeader = ({
  desktopCollapsed,
  setDesktopCollapsed,
  mobileOpen,
  setMobileOpen,
  modalDrawerOpen = false,
}: TopHeaderProps) => {
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const wasMobileOpen = useRef(mobileOpen);
  const openedSearchFromTrigger = useRef(false);
  const wasSearchOpen = useRef(false);
  const [searchOpenRequestId, setSearchOpenRequestId] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

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

  useEffect(() => {
    if (wasMobileOpen.current && !mobileOpen) {
      mobileMenuButtonRef.current?.focus();
    }
    wasMobileOpen.current = mobileOpen;
  }, [mobileOpen]);

  useEffect(() => {
    if (wasSearchOpen.current && !searchOpen && openedSearchFromTrigger.current) {
      openedSearchFromTrigger.current = false;
      searchTriggerRef.current?.focus();
    }
    wasSearchOpen.current = searchOpen;
  }, [searchOpen]);

  const requestMobileSearchOpen = () => {
    openedSearchFromTrigger.current = true;
    setSearchOpenRequestId((current) => current + 1);
  };

  const closeMobileSearch = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    setSearchOpen(false);
  };

  return (
    <header
      inert={modalDrawerOpen || undefined}
      aria-hidden={modalDrawerOpen ? true : undefined}
      className={cn(
        'sticky top-0 flex w-full border-b border-transparent bg-white dark:border-transparent dark:bg-dark-surface-2',
        // La búsqueda global abierta eleva el header un escalón (sticky 100 →
        // shell-raised 200) para que su panel pinte sobre el subnav del módulo, que
        // vive en sticky 100 y va después en el DOM. Al cerrar vuelve a sticky.
        //
        // El --z-shell-raised del contenedor interior de la hoja es ordenación local
        // dentro del contexto de apilamiento que crea este header `sticky`: el escalón
        // real lo fija esta línea. El gemelo de apps/web se queda en --z-sticky por no
        // tener subnav con el que competir; no unificar los dos números — lo que debe
        // unificarse es el constructo (anatomía y estados), no el escalón.
        //
        // Un drawer modal no altera este escalón: su capa (`--z-modal`) pinta
        // por encima de ambos. `modalDrawerOpen` aquí solo gobierna la inercia.
        searchOpen ? 'z-(--z-shell-raised)' : 'z-(--z-sticky)',
      )}
    >
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
            className={cn(headerIconControlClassName, interactiveFocusClassName, 'hidden lg:flex')}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            ref={mobileMenuButtonRef}
            type="button"
            {...menuToggleAriaProps}
            onClick={(e) => {
              e.stopPropagation();
              setMobileOpen(!mobileOpen);
            }}
            className={cn(headerIconControlClassName, interactiveFocusClassName, 'lg:hidden')}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <Link
            className={cn(
              'flex min-h-11 min-w-11 shrink-0 items-center justify-center lg:hidden',
              interactiveFocusClassName,
            )}
            href="/dashboard"
            aria-label="Ir al dashboard"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-iwana-secondary">
              <span className="text-base font-bold text-iwana-primary" aria-hidden="true">
                iW
              </span>
            </div>
          </Link>
        </div>

        {/* CENTRO: una sola instancia de GlobalSearch — hoja móvil cuando abre */}
        <div
          className={cn(
            'mx-6 flex-1 max-w-lg',
            searchOpen
              ? 'max-lg:fixed max-lg:inset-0 max-lg:z-(--z-shell-raised) max-lg:mx-0 max-lg:flex max-lg:max-w-none max-lg:flex-col max-lg:bg-white max-lg:p-4 dark:max-lg:bg-dark-surface'
              : 'max-lg:hidden',
          )}
        >
          {searchOpen ? (
            <div className="mb-3 flex items-center gap-2 lg:hidden">
              <button
                type="button"
                aria-label="Cerrar"
                onClick={closeMobileSearch}
                className={cn(headerIconControlClassName, interactiveFocusClassName)}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <p className="truncate text-sm font-semibold text-iwana-primary dark:text-white">
                Buscar
              </p>
            </div>
          ) : null}
          <Suspense
            fallback={
              <div className="h-11 rounded-lg border border-gray-200 bg-white dark:border-dark-border-2 dark:bg-dark-surface-3" />
            }
          >
            <GlobalSearch openRequestId={searchOpenRequestId} onOpenChange={setSearchOpen} />
          </Suspense>
        </div>

        {/* DERECHA: acciones + usuario */}
        <div className="flex items-center gap-2">
          <button
            ref={searchTriggerRef}
            type="button"
            aria-label="Buscar"
            aria-expanded={searchOpen}
            onClick={requestMobileSearchOpen}
            className={cn(headerIconControlClassName, interactiveFocusClassName, 'lg:hidden')}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>

          <ThemeToggle />

          <NotificationBell />

          <DropdownUser />
        </div>
      </div>
    </header>
  );
};
