// apps/portal/src/components/layout/Sidebar.tsx
'use client';
import React, { Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import {
  CalendarClock,
  LayoutDashboard,
  Settings,
  Users,
  BriefcaseBusiness,
  HandCoins,
  LifeBuoy,
  ClipboardList,
  Package,
  X,
} from 'lucide-react';
import { cn, interactiveFocusClassName } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePermissions } from '@/components/access-control/permissions-context';
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
  /**
   * Permiso efectivo requerido — mapeo congelado (plan §2 / spec MOD00 §1.2).
   * Un array expresa semántica OR (ítem Operaciones). `undefined` = sin gate
   * (Inicio, siempre visible).
   */
  permission?: AccessPermissionKey | readonly AccessPermissionKey[];
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

type ItemVisibility = 'visible' | 'hidden' | 'skeleton';

const DESKTOP_STORAGE_KEY = 'iwana-portal-sidebar-collapsed';
const MOBILE_DRAWER_QUERY = '(max-width: 1023px)';

const NAV_LOADING_ANNOUNCEMENT = 'Cargando navegación';

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
 * Visibilidad por ítem: (techo estático `allowedRoles`) AND (permisos
 * efectivos del contexto compartido). Mapeo congelado en el plan §2 y la
 * spec MOD00 §1.2; `crm.customers.*` (deprecadas) no aparecen.
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §4.3
 */
const navGroups: NavGroup[] = [
  {
    group: 'Menú',
    items: [
      { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
      {
        href: '/dashboard/crm/expedientes',
        label: 'Oportunidades',
        icon: BriefcaseBusiness,
        permission: AccessPermissionKey.CRM_EXPEDIENTES_READ,
      },
      {
        href: '/dashboard/crm/subscribers',
        label: 'Suscriptores',
        icon: Users,
        permission: AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      },
      {
        href: '/dashboard/scheduling',
        label: 'Programación',
        icon: CalendarClock,
        permission: AccessPermissionKey.WFM_SCHEDULE_READ,
      },
      {
        href: '/dashboard/assurance',
        label: 'Mesa de ayuda',
        icon: LifeBuoy,
        permission: AccessPermissionKey.ASSURANCE_TICKETS_READ,
      },
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
        permission: [
          AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
          AccessPermissionKey.OPERATIONS_TASKS_READ,
          AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE,
        ],
      },
      {
        href: '/dashboard/inventory',
        label: 'Inventario',
        icon: Package,
        allowedRoles: [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT],
        permission: AccessPermissionKey.INVENTORY_STOCK_READ,
      },
    ],
  },
  {
    group: 'Administración',
    items: [
      {
        href: '/dashboard/settings',
        label: 'Configuración',
        icon: Settings,
        permission: AccessPermissionKey.SETTINGS_READ,
      },
      {
        href: '/dashboard/users',
        label: 'Usuarios',
        icon: Users,
        permission: AccessPermissionKey.USERS_READ,
      },
      {
        href: '/dashboard/commercial',
        label: 'Comercial',
        icon: HandCoins,
        permission: AccessPermissionKey.COMMERCIAL_CATALOG_READ,
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
  const { status, effectivePermissions, hasAnyPermission } = usePermissions();

  // Tripwire anti-nav vacía (spec MOD00 §1.5 / CA-DEP-02): fetch exitoso con
  // set vacío en no-ADMIN ("tenant sin corte") → filtrado estático. La nav
  // vacía para no-ADMIN es inaceptable en cualquier estado.
  const isTripwireActive =
    status === 'ready' && effectivePermissions.size === 0 && user?.role !== UserRole.ADMIN;
  const useStaticFiltering = status === 'degraded' || isTripwireActive;

  const resolveVisibility = (item: NavItem): ItemVisibility => {
    if (!item.permission) {
      return 'visible';
    }

    // Techo estático (espejo del @Roles estructural): un permiso efectivo
    // jamás muestra un ítem cuyo techo de rol no lo contempla.
    if (item.allowedRoles) {
      if (!user?.role || !item.allowedRoles.includes(user.role as UserRole)) {
        return 'hidden';
      }
    }

    if (useStaticFiltering) {
      return 'visible';
    }

    if (status === 'loading') {
      return 'skeleton';
    }

    const required = Array.isArray(item.permission) ? item.permission : [item.permission];
    return hasAnyPermission(required) ? 'visible' : 'hidden';
  };

  return (
    <>
      {navGroups.map((navGroup, groupIndex) => {
        const resolvedItems = navGroup.items.map((item) => ({
          item,
          visibility: resolveVisibility(item),
        }));

        // Un grupo sin ítems visibles no renderiza su encabezado (CA-NAV-09).
        if (!resolvedItems.some(({ visibility }) => visibility !== 'hidden')) {
          return null;
        }

        return (
          <div key={navGroup.group} className="mb-2">
            <p
              className={cn(
                'mt-6 mb-2 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300',
                groupIndex === 0 && 'mt-0',
                desktopCollapsed && 'lg:hidden',
              )}
            >
              {navGroup.group}
            </p>

            <ul className="flex flex-col gap-1 px-2">
              {resolvedItems.map(({ item, visibility }) => {
                if (visibility === 'hidden') {
                  return null;
                }

                if (visibility === 'skeleton') {
                  return (
                    <li key={`${item.href}-skeleton`} aria-hidden="true">
                      <span
                        className={cn(
                          'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2',
                          desktopCollapsed && 'lg:justify-center lg:px-2',
                        )}
                      >
                        <span
                          className={cn(
                            'h-5 w-5 shrink-0 animate-pulse bg-gray-100 dark:bg-dark-surface-3',
                            desktopCollapsed ? 'lg:rounded-full' : 'rounded-md',
                          )}
                        />
                        <span
                          className={cn(
                            'h-3 w-24 animate-pulse rounded-md bg-gray-100 dark:bg-dark-surface-3',
                            desktopCollapsed && 'lg:hidden',
                          )}
                        />
                      </span>
                    </li>
                  );
                }

                const isActive =
                  !item.disabled &&
                  (pathname === item.href || pathname.startsWith(`${item.href}/`));

                if (item.disabled) {
                  return (
                    <li key={item.href}>
                      <span
                        title={desktopCollapsed ? item.label : undefined}
                        className={cn(
                          'flex min-h-11 cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 dark:text-gray-400',
                          desktopCollapsed && 'lg:justify-center lg:px-2',
                        )}
                        aria-disabled="true"
                      >
                        <item.icon
                          className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-400"
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
                        'group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                        interactiveFocusClassName,
                        isActive
                          ? 'relative bg-iwana-primary-50 font-medium text-iwana-primary-700 dark:bg-iwana-primary-800/30 dark:text-iwana-primary-200'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-surface-3',
                        desktopCollapsed && 'lg:justify-center lg:px-2',
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary dark:bg-iwana-secondary-400"
                        />
                      )}
                      <item.icon
                        className={cn(
                          'h-5 w-5 shrink-0',
                          isActive
                            ? 'text-iwana-primary-600 dark:text-iwana-primary-300'
                            : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-400 dark:group-hover:text-gray-300',
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
        );
      })}
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tenantDisplayName = resolveTenantDisplayName(profile);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const drawerInert = isMobileViewport && !mobileOpen;
  const { status } = usePermissions();

  // Persistir estado desktop en localStorage — solo al montar
  const setDesktopCollapsedRef = useRef(setDesktopCollapsed);
  setDesktopCollapsedRef.current = setDesktopCollapsed;
  useEffect(() => {
    const stored = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (stored === 'true') setDesktopCollapsedRef.current(true);
    else if (stored === 'false') setDesktopCollapsedRef.current(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_DRAWER_QUERY);
    const update = () => setIsMobileViewport(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  // Cerrar drawer mobile con tecla Escape
  useEffect(() => {
    const keyHandler = ({ key }: KeyboardEvent) => {
      if (mobileOpen && key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, [mobileOpen, setMobileOpen]);

  // Al abrir el drawer, el foco entra al panel (botón cerrar)
  useEffect(() => {
    if (mobileOpen && isMobileViewport) {
      closeButtonRef.current?.focus();
    }
  }, [mobileOpen, isMobileViewport]);

  return (
    <aside
      id="sidebar"
      ref={sidebar}
      aria-label="Navegación principal"
      inert={drawerInert || undefined}
      aria-hidden={drawerInert ? true : undefined}
      className={cn(
        'fixed left-0 top-0 z-(--z-drawer) flex h-screen flex-col overflow-y-hidden border-r border-transparent bg-white transition-all duration-200 ease-linear dark:border-transparent dark:bg-dark-surface-2',
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
          className={cn(
            'flex min-h-11 items-center gap-3 min-w-0',
            interactiveFocusClassName,
            desktopCollapsed && 'lg:hidden',
          )}
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
          className={cn(
            'hidden min-h-11 min-w-11 items-center justify-center',
            interactiveFocusClassName,
            desktopCollapsed && 'lg:flex',
          )}
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
          ref={closeButtonRef}
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white lg:hidden',
            interactiveFocusClassName,
          )}
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* MENÚ DE NAVEGACIÓN */}
      <div className="no-scrollbar flex flex-col overflow-y-auto flex-1 py-4">
        <nav aria-label="Menú principal" aria-busy={status === 'loading' || undefined}>
          {status === 'loading' ? (
            <p role="status" aria-live="polite" className="sr-only">
              {NAV_LOADING_ANNOUNCEMENT}
            </p>
          ) : null}
          <Suspense fallback={null}>
            <NavItems desktopCollapsed={desktopCollapsed} />
          </Suspense>
        </nav>
      </div>
    </aside>
  );
};
