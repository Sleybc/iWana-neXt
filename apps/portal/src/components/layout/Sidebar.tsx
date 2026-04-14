// apps/portal/src/components/layout/Sidebar.tsx
'use client';
import React, { useEffect, useRef, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Settings,
  Users,
  ShieldCheck,
  BarChart3,
  BriefcaseBusiness,
  X,
} from 'lucide-react';
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
  { href: '/dashboard/crm', label: 'CRM', icon: BriefcaseBusiness, disabled: false },
  { href: '/dashboard/settings', label: 'Configuración', icon: Settings, disabled: false },
  { href: '/dashboard/users', label: 'Usuarios', icon: Users, disabled: false },
  { href: '/security', label: 'Seguridad', icon: ShieldCheck, disabled: true, badge: 'Siguiente fase' },
  { href: '/reports', label: 'Reportes', icon: BarChart3, disabled: true, badge: 'Siguiente fase' },
];

interface NavItemsProps {
  desktopCollapsed: boolean;
}

/**
 * Sub-componente aislado que usa usePathname().
 * Debe estar envuelto en <Suspense> en el árbol del Sidebar para evitar
 * que Next.js bloquee el prerenderizado estático (requisito desde Next.js 15+).
 */
const NavItems = ({ desktopCollapsed }: NavItemsProps) => {
  const pathname = usePathname();

  return (
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
                  'flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium opacity-50',
                  desktopCollapsed && 'lg:justify-center lg:px-2',
                )}
                aria-disabled="true"
              >
                <item.icon className="w-5 h-5 shrink-0 text-white/40" aria-hidden="true" />
                <span className={cn('flex items-center gap-2', desktopCollapsed && 'lg:hidden')}>
                  {item.label}
                  {item.badge && (
                    <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
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
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold duration-200 hover:bg-white/10 dark:hover:bg-dark-surface-3',
                isActive
                  ? 'bg-white/12 text-iwana-secondary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] dark:bg-dark-surface-3'
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
  );
};

export const Sidebar = ({
  desktopCollapsed,
  setDesktopCollapsed,
  mobileOpen,
  setMobileOpen,
  profile,
}: SidebarProps) => {
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
          'flex min-h-[4.75rem] items-center gap-2 border-b border-white/8 px-4 py-5',
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
              'mb-3 px-4 text-[11px] font-bold uppercase tracking-[0.22em] text-white/55 dark:text-gray-500',
              desktopCollapsed && 'lg:sr-only',
            )}
          >
            EMPRESA
          </h3>

          {/* NavItems aislado en Suspense — usePathname() requiere boundary desde Next.js 15+ */}
          <Suspense fallback={null}>
            <NavItems desktopCollapsed={desktopCollapsed} />
          </Suspense>
        </nav>
      </div>
    </aside>
  );
};
