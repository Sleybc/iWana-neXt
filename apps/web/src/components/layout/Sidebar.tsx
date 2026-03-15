// apps/web/src/components/layout/Sidebar.tsx
'use client';
import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, Building2, ShieldAlert, Settings, X } from 'lucide-react';
import { cn } from '@iwana/ui';

interface SidebarProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const DESKTOP_STORAGE_KEY = 'iwana-web-sidebar-collapsed';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tenants', label: 'Empresas', icon: Building2 },
  { href: '/users', label: 'Usuarios', icon: Users },
  { href: '/audit', label: 'Auditoría', icon: ShieldAlert },
  { href: '/settings', label: 'Configuración', icon: Settings },
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
    // Solo al montar — dependencias omitidas intencionalmente
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
        // Base
        'fixed left-0 top-0 z-[9999] flex h-screen flex-col overflow-y-hidden bg-iwana-primary dark:bg-dark-surface-2 text-white duration-300 ease-linear',
        // Desktop: estático, ancho variable según colapso
        'lg:static lg:translate-x-0',
        desktopCollapsed ? 'lg:w-[72px]' : 'lg:w-64',
        // Mobile: drawer overlay, translate
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
            <span className="text-[#17163a] font-bold text-base" aria-hidden="true">
              iW
            </span>
          </div>
          <span className="text-lg font-bold tracking-tight text-white truncate">iWana neXt</span>
        </Link>

        {/* Icono solo — visible cuando está colapsado en desktop */}
        <Link
          href="/dashboard"
          className={cn('hidden items-center justify-center', desktopCollapsed && 'lg:flex')}
          aria-label="Ir al dashboard"
        >
          <div className="w-8 h-8 rounded-md bg-iwana-secondary flex items-center justify-center">
            <span className="text-[#17163a] font-bold text-base" aria-hidden="true">
              iW
            </span>
          </div>
        </Link>

        {/* Botón cerrar — solo mobile */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          className={cn(
            'lg:hidden text-white/70 hover:text-white shrink-0',
            desktopCollapsed && 'lg:hidden',
          )}
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
              'mb-3 px-4 text-xs font-semibold text-white/60 dark:text-gray-500 uppercase tracking-widest',
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
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium duration-200 hover:bg-white/10 dark:hover:bg-dark-surface-3',
                      isActive
                        ? 'bg-white/10 dark:bg-dark-surface-3 text-iwana-secondary'
                        : 'text-white/80 dark:text-gray-300',
                      desktopCollapsed && 'lg:justify-center lg:px-2',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'w-5 h-5 shrink-0',
                        isActive
                          ? 'text-iwana-secondary'
                          : 'text-white/60 dark:text-gray-400 group-hover:text-white/90 dark:group-hover:text-white',
                      )}
                      aria-hidden="true"
                    />
                    <span className={cn(desktopCollapsed && 'lg:hidden')}>{item.label}</span>
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
