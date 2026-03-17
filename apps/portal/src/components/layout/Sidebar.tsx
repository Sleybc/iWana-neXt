// apps/portal/src/components/layout/Sidebar.tsx
'use client';
import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Settings, Users, ShieldCheck, BarChart3, X } from 'lucide-react';
import { cn } from '@iwana/ui';
import { TenantSeal } from './TenantSeal';
import type { TenantSelf } from '@/lib/api-client';

interface SidebarProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  /** Datos del tenant autenticado — para mostrar sello y nombre en el header del sidebar */
  profile?: TenantSelf | null;
}

const DESKTOP_STORAGE_KEY = 'iwana-portal-sidebar-collapsed';

/**
 * Ítems de navegación del portal empresarial del tenant.
 *
 * Rutas activas en MVP: /dashboard, /settings.
 * Rutas futuras marcadas como disabled para no generar 404.
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §4.3
 */
const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, disabled: false },
  { href: '/dashboard/settings', label: 'Configuración', icon: Settings, disabled: false },
  { href: '/users', label: 'Usuarios', icon: Users, disabled: true, badge: 'Próximo' },
  { href: '/security', label: 'Seguridad', icon: ShieldCheck, disabled: true, badge: 'Próximo' },
  { href: '/reports', label: 'Reportes', icon: BarChart3, disabled: true, badge: 'Próximo' },
];

export const Sidebar = ({
  desktopCollapsed,
  setDesktopCollapsed,
  mobileOpen,
  setMobileOpen,
  profile,
}: SidebarProps) => {
  const pathname = usePathname();
  const sidebar = useRef<HTMLElement>(null);

  // Persistir estado desktop en localStorage — solo al montar
  const setDesktopCollapsedRef = useRef(setDesktopCollapsed);
  setDesktopCollapsedRef.current = setDesktopCollapsed;
  useEffect(() => {
    const stored = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (stored === 'true') setDesktopCollapsedRef.current(true);
    else if (stored === 'false') setDesktopCollapsedRef.current(false);
  }, []);

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
        'fixed left-0 top-0 z-[9999] flex h-screen flex-col overflow-y-hidden bg-iwana-primary dark:bg-dark-surface-2 text-white duration-300 ease-linear',
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
        {/* Marca del tenant — expandido */}
        <Link
          href="/dashboard"
          className={cn('flex items-center gap-3 min-w-0', desktopCollapsed && 'lg:hidden')}
        >
          <TenantSeal
            sealLightUrl={profile?.sealLightUrl ?? null}
            sealDarkUrl={profile?.sealDarkUrl ?? null}
            name={profile?.name ?? 'iW'}
            size="sm"
            className="shrink-0"
          />
          {(profile?.showTenantName ?? true) && (
            <span className="text-lg font-bold tracking-tight text-white truncate">
              {profile?.name ?? 'iWana Empresa'}
            </span>
          )}
        </Link>

        {/* Sello solo — colapsado desktop */}
        <Link
          href="/dashboard"
          className={cn('hidden items-center justify-center', desktopCollapsed && 'lg:flex')}
          aria-label="Ir al dashboard"
        >
          <TenantSeal
            sealLightUrl={profile?.sealLightUrl ?? null}
            sealDarkUrl={profile?.sealDarkUrl ?? null}
            name={profile?.name ?? 'iW'}
            size="sm"
          />
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

      {/* MENÚ DE NAVEGACIÓN */}
      <div className="no-scrollbar flex flex-col overflow-y-auto flex-1 py-4">
        <nav aria-label="Menú principal">
          <h3
            className={cn(
              'mb-3 px-4 text-xs font-semibold text-white/60 dark:text-gray-500 uppercase tracking-widest',
              desktopCollapsed && 'lg:sr-only',
            )}
          >
            EMPRESA
          </h3>

          <ul className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const isActive =
                !item.disabled && (pathname === item.href || pathname.startsWith(`${item.href}/`));

              // Ítems deshabilitados: no navegan para evitar 404
              if (item.disabled) {
                return (
                  <li key={item.href}>
                    <span
                      title={desktopCollapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium cursor-not-allowed opacity-50',
                        desktopCollapsed && 'lg:justify-center lg:px-2',
                      )}
                      aria-disabled="true"
                    >
                      <item.icon className="w-5 h-5 shrink-0 text-white/40" aria-hidden="true" />
                      <span
                        className={cn('flex items-center gap-2', desktopCollapsed && 'lg:hidden')}
                      >
                        {item.label}
                        {item.badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-medium">
                            {item.badge}
                          </span>
                        )}
                      </span>
                    </span>
                  </li>
                );
              }

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
    </aside>
  );
};
