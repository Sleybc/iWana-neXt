// apps/web/src/components/layout/TopHeader.tsx
'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { DropdownUser } from './DropdownUser';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    setSearchText(searchParams.get('q') ?? '');
  }, [searchParams]);

  const submitSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    const normalized = searchText.trim();

    if (normalized) {
      params.set('q', normalized);
    } else {
      params.delete('q');
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

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
    <header className="sticky top-0 z-[999] flex w-full bg-white border-b border-gray-200 dark:bg-dark-surface-2 dark:border-dark-border">
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
            className="hidden h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 lg:flex dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-surface-4"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Hamburger — abre drawer en mobile */}
          <button
            type="button"
            {...menuToggleAriaProps}
            onClick={(e) => {
              e.stopPropagation();
              setMobileOpen(!mobileOpen);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 lg:hidden dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-surface-4"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo — solo mobile */}
          <Link className="flex shrink-0 lg:hidden" href="/dashboard" aria-label="Ir al dashboard">
            <div className="w-8 h-8 rounded-md bg-iwana-secondary flex items-center justify-center">
              <span className="text-[#17163a] font-bold text-base" aria-hidden="true">
                iW
              </span>
            </div>
          </Link>
        </div>

        {/* CENTRO: buscador */}
        <div className="hidden lg:block flex-1 max-w-lg mx-6">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-500 dark:text-gray-400"
            >
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar o escribir un comando..."
              aria-label="Buscar"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-16 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-iwana-primary focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-iwana-primary-300"
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 flex items-center gap-0.5 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-500 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 pointer-events-none"
            >
              <span>⌘</span>
              <span>K</span>
            </span>
          </form>
        </div>

        {/* DERECHA: acciones + usuario */}
        <div className="flex items-center gap-2">
          {/* Botón dark mode */}
          <ThemeToggle />

          <NotificationBell />

          {/* Usuario */}
          <DropdownUser />
        </div>
      </div>
    </header>
  );
};
