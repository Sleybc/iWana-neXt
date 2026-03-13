// apps/portal/src/components/layout/Sidebar.tsx
'use client';
import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Receipt,
  Headphones,
  User,
  Waves,
  X,
} from 'lucide-react';
import { cn } from '@iwana/ui';

interface SidebarProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const DESKTOP_STORAGE_KEY = 'iwana-portal-sidebar-collapsed';

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/services', label: 'Servicios', icon: Waves },
  { href: '/billing', label: 'Facturación', icon: Receipt },
  { href: '/support', label: 'Soporte', icon: Headphones },
  { href: '/profile', label: 'Mi perfil', icon: User },
];

export const Sidebar = ({
  desktopCollapsed,
  setDesktopCollapsed,
  mobileOpen,
  setMobileOpen,
}: SidebarProps) => {
  const pathname = usePathname();
  const sidebar = useRef<HTMLElement>(null);

  // Persistir estado desktop en localStorage
  useEffect(() => {
    const stored = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (stored === 'true') setDesktopCollapsed(true);
    else if (stored === 'false') setDesktopCollapsed(false);
  // Solo al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDesktopToggle = () => {
    const next = !desktopCollapsed;
    setDesktopCollapsed(next);
    localStorage.setItem(DESKTOP_STORAGE_KEY, String(next));
  };

  // Cerrar drawer mobile con tecla Escape
  useEffect(() => {
    const keyHandler = ({ key }: KeyboardEvent) => {
      if (mobileOpen && key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, [mobileOpen, setMobileOpen]);

  return (
    <aside
      id="sidebar"
      ref={sidebar}
      aria-label="Navegación principal"
      className={cn(
        'fixed left-0 top-0 z-[9999] flex h-screen flex-col overflow-y-hidden bg-iwana-primary text-white duration-300 ease-linear',
        'lg:static lg:translate-x-0',
        desktopCollapsed ? 'lg:w-[72px]' : 'lg:w-64',
        mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64 lg:translate-x-0',
      )}
    >
      {/* SIDEBAR HEADER */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-5 min-h-[4.5rem]',
          desktopCollapsed ? 'lg:justify-center' : 'justify-between',
        )}
      >
        {/* Logo — visible cuando está expandido */}
        <Link
          href="/dashboard"
          className={cn('flex items-center gap-3 min-w-0', desktopCollapsed && 'lg:hidden')}
        >
          <div className="w-8 h-8 shrink-0 rounded-md bg-iwana-secondary flex items-center justify-center">
            <span className="text-white font-bold text-base">iW</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-white truncate">iWana Portal</span>
        </Link>

        {/* Icono solo — visible cuando está colapsado en desktop */}
        <Link
          href="/dashboard"
          className={cn('hidden items-center justify-center', desktopCollapsed && 'lg:flex')}
          aria-label="Ir al dashboard"
        >
          <div className="w-8 h-8 rounded-md bg-iwana-secondary flex items-center justify-center">
            <span className="text-white font-bold text-base">iW</span>
          </div>
        </Link>

        {/* Botón cerrar — solo mobile */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          className="lg:hidden text-white/70 hover:text-white shrink-0"
        >
          <X className="w-5 h-5" />
        </button>

      </div>
      {/* /SIDEBAR HEADER */}

      {/* MENÚ DE NAVEGACIÓN */}
      <div className="no-scrollbar flex flex-col overflow-y-auto flex-1 py-4">
        <nav aria-label="Menú principal">
          <h3
            className={cn(
              'mb-3 px-4 text-xs font-semibold text-white/40 uppercase tracking-widest',
              desktopCollapsed && 'lg:sr-only',
            )}
          >
            MENÚ
          </h3>

          <ul className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={desktopCollapsed ? item.label : undefined}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium duration-200 hover:bg-white/10',
                      isActive ? 'bg-white/10 text-iwana-secondary' : 'text-white/80',
                      desktopCollapsed && 'lg:justify-center lg:px-2',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'w-5 h-5 shrink-0',
                        isActive ? 'text-iwana-secondary' : 'text-white/60 group-hover:text-white/90',
                      )}
                      aria-hidden="true"
                    />
                    <span className={cn(desktopCollapsed && 'lg:hidden')}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      {/* /MENÚ DE NAVEGACIÓN */}
    </aside>
  );
};
