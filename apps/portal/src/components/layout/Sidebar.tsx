// apps/portal/src/components/layout/Sidebar.tsx
'use client';
import React, { Suspense, useEffect, useRef, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { UserRole } from '@iwana/shared';
import {
  CalendarClock,
  LayoutDashboard,
  Settings,
  Users,
  BarChart3,
  BriefcaseBusiness,
  HandCoins,
  LifeBuoy,
  ClipboardList,
  Package,
  X,
} from 'lucide-react';
import { cn } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';
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

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  disabled?: boolean;
  badge?: string;
  allowedRoles?: UserRole[];
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const DESKTOP_STORAGE_KEY = 'iwana-portal-sidebar-collapsed';

function resolveTenantDisplayName(profile?: TenantSelf | null): string {
  const brandingProductName = profile?.brandingProductName?.trim();

  if (brandingProductName) {
    return brandingProductName;
  }

  return profile?.name ?? 'iWana Empresa';
}

/**
 * Ítems de navegación del portal empresarial del tenant.
 *
 * Rutas activas en MVP: /dashboard, /dashboard/scheduling, /dashboard/settings.
 * Rutas futuras marcadas como disabled para no generar 404.
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §4.3
 */
const navGroups: NavGroup[] = [
  {
    group: 'MENÚ',
    items: [
      { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
      { href: '/dashboard/commercial', label: 'Comercial', icon: HandCoins },
      { href: '/dashboard/crm/expedientes', label: 'CRM', icon: BriefcaseBusiness },
      { href: '/dashboard/crm/subscribers', label: 'Suscriptores', icon: Users },
      { href: '/dashboard/scheduling', label: 'Programacion', icon: CalendarClock },
      { href: '/dashboard/assurance', label: 'Mesa de ayuda', icon: LifeBuoy },
      {
        href: '/dashboard/operations',
        label: 'Operaciones',
        icon: ClipboardList,
        allowedRoles: [
          UserRole.ADMIN,
          UserRole.NOC,
          UserRole.SUPPORT,
          UserRole.SALES,
          UserRole.TECHNICIAN,
          UserRole.CONTRACTOR,
        ],
      },
      {
        href: '/dashboard/inventory',
        label: 'Inventario',
        icon: Package,
        allowedRoles: [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT],
      },
    ],
  },
  {
    group: 'ADMINISTRACIÓN',
    items: [
      { href: '/dashboard/settings', label: 'Configuración', icon: Settings },
      { href: '/dashboard/users', label: 'Usuarios', icon: Users },
      {
        href: '/reports',
        label: 'Reportes',
        icon: BarChart3,
        disabled: true,
        badge: 'Siguiente fase',
      },
    ],
  },
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
  const { user } = useAuth();

  return (
    <>
      {navGroups.map((navGroup, groupIndex) => (
        <div key={navGroup.group} className="mb-2">
          <p
            className={cn(
              'mt-6 mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300',
              groupIndex === 0 && 'mt-0',
              desktopCollapsed && 'lg:hidden',
            )}
          >
            {navGroup.group}
          </p>

          <ul className="flex flex-col gap-1 px-2">
            {navGroup.items
              .filter((item) => {
                if (!item.allowedRoles) {
                  return true;
                }

                if (!user?.role) {
                  return false;
                }

                return item.allowedRoles.includes(user.role as UserRole);
              })
              .map((item) => {
                const isActive =
                  !item.disabled &&
                  (pathname === item.href || pathname.startsWith(`${item.href}/`));

                if (item.disabled) {
                  return (
                    <li key={item.href}>
                      <span
                        title={desktopCollapsed ? item.label : undefined}
                        className={cn(
                          'flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 opacity-60 dark:text-gray-500',
                          desktopCollapsed && 'lg:justify-center lg:px-2',
                        )}
                        aria-disabled="true"
                      >
                        <item.icon
                          className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500"
                          aria-hidden
                        />
                        <span
                          className={cn('flex items-center gap-2', desktopCollapsed && 'lg:hidden')}
                        >
                          {item.label}
                          {item.badge && (
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
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
                        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                        isActive
                          ? 'bg-iwana-primary-50 font-medium text-iwana-primary-700 dark:bg-iwana-primary-800/30 dark:text-iwana-primary-200'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5',
                        desktopCollapsed && 'lg:justify-center lg:px-2',
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <item.icon
                        className={cn(
                          'h-5 w-5 shrink-0',
                          isActive
                            ? 'text-iwana-primary-600 dark:text-iwana-primary-300'
                            : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300',
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          'whitespace-nowrap overflow-hidden transition-all duration-200',
                          desktopCollapsed ? 'lg:w-0 lg:opacity-0' : 'w-auto opacity-100',
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </>
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
  const tenantDisplayName = resolveTenantDisplayName(profile);

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
        'fixed left-0 top-0 z-40 flex h-screen flex-col overflow-y-hidden border-r border-transparent bg-white transition-all duration-200 ease-linear dark:border-transparent dark:bg-dark-surface-2',
        'lg:static lg:translate-x-0',
        desktopCollapsed ? 'lg:w-[90px]' : 'lg:w-[290px]',
        mobileOpen ? 'translate-x-0 w-[290px]' : 'max-lg:-translate-x-full w-[290px]',
      )}
    >
      {/* SIDEBAR HEADER */}
      <div
        className={cn(
          'flex min-h-16 items-center gap-2 border-b border-transparent px-4 py-3 dark:border-transparent',
          desktopCollapsed ? 'lg:justify-center lg:px-2' : 'justify-between',
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
            name={tenantDisplayName}
            size="sm"
            className="shrink-0"
          />
          {(profile?.showTenantName ?? true) && (
            <span className="truncate text-lg font-bold tracking-tight text-iwana-primary dark:text-white">
              {tenantDisplayName}
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
            name={tenantDisplayName}
            size="sm"
          />
        </Link>

        {/* Botón cerrar — solo mobile */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          className="shrink-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* MENÚ DE NAVEGACIÓN */}
      <div className="no-scrollbar flex flex-col overflow-y-auto flex-1 py-4">
        <nav aria-label="Menú principal">
          <Suspense fallback={null}>
            <NavItems desktopCollapsed={desktopCollapsed} />
          </Suspense>
        </nav>
      </div>
    </aside>
  );
};
