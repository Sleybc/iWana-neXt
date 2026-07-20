// apps/web/src/components/layout/Sidebar.tsx
'use client';
import { Suspense, useEffect, useRef, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Building2, ClipboardList, LayoutDashboard, Settings, Users, X } from 'lucide-react';
import { cn } from '@iwana/ui';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

interface SidebarProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const DESKTOP_STORAGE_KEY = 'iwana-web-sidebar-collapsed';

// Grupos de navegación con sus ítems
const navGroups: NavGroup[] = [
  {
    group: PLATFORM_UI_COPY.navigationGroups.operation,
    items: [
      { href: '/dashboard', label: PLATFORM_UI_COPY.navigation.home, icon: LayoutDashboard },
      { href: '/tenants', label: PLATFORM_UI_COPY.navigation.tenants, icon: Building2 },
      { href: '/users', label: PLATFORM_UI_COPY.navigation.users, icon: Users },
    ],
  },
  {
    group: PLATFORM_UI_COPY.navigationGroups.governance,
    items: [
      { href: '/audit-logs', label: PLATFORM_UI_COPY.navigation.audit, icon: ClipboardList },
      { href: '/settings', label: PLATFORM_UI_COPY.navigation.settings, icon: Settings },
    ],
  },
];

interface NavItemsProps {
  desktopCollapsed: boolean;
}

const NavItems = ({ desktopCollapsed }: NavItemsProps) => {
  const pathname = usePathname();

  return (
    <>
      {navGroups.map((navGroup, groupIndex) => (
        <div key={navGroup.group} className="mb-2">
          <p
            className={cn(
              'portal-eyebrow-muted mb-2 mt-6 px-4 text-[11px]',
              groupIndex === 0 && 'mt-0',
              desktopCollapsed && 'lg:hidden',
            )}
          >
            {navGroup.group}
          </p>

          <ul className="flex flex-col gap-1 px-2">
            {navGroup.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={desktopCollapsed ? item.label : undefined}
                    className={cn(
                      'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-iwana-surface-soft text-iwana-primary shadow-[var(--shadow-iwana-card)] ring-1 ring-inset ring-iwana-primary-100 dark:bg-dark-surface-3 dark:text-white dark:ring-dark-border-2'
                        : 'text-gray-600 hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-gray-100',
                      desktopCollapsed && 'lg:justify-center lg:px-2',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon
                      aria-hidden
                      className={cn(
                        'h-5 w-5 shrink-0',
                        isActive
                          ? 'text-iwana-secondary-700 dark:text-iwana-secondary'
                          : 'text-gray-400 group-hover:text-iwana-secondary-700 dark:text-gray-500 dark:group-hover:text-iwana-secondary',
                      )}
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
}: SidebarProps) => {
  const sidebar = useRef<HTMLElement>(null);
  const { branding, logoUrl } = usePlatformBrandingAssets();

  // Persistir estado desktop en localStorage
  useEffect(() => {
    const stored = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (stored === 'true') setDesktopCollapsed(true);
    else if (stored === 'false') setDesktopCollapsed(false);
  }, [setDesktopCollapsed]);

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
        'fixed left-0 top-0 z-40 flex h-screen flex-col overflow-y-hidden',
        'border-r border-transparent bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-transparent dark:bg-dark-surface-2/95',
        'transition-all duration-200 ease-linear',
        'lg:static lg:translate-x-0',
        desktopCollapsed ? 'lg:w-[90px]' : 'lg:w-[290px]',
        mobileOpen ? 'translate-x-0 w-[290px]' : '-translate-x-full w-[290px] lg:translate-x-0',
      )}
    >
      <div
        className={cn(
          'flex min-h-16 items-center gap-2 border-b border-transparent px-4 py-3 dark:border-transparent',
          desktopCollapsed ? 'lg:justify-center lg:px-2' : 'justify-between',
        )}
      >
        <Link
          href="/dashboard"
          className={cn('flex items-center gap-3 min-w-0', desktopCollapsed && 'lg:hidden')}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-iwana-surface-soft ring-1 ring-inset ring-iwana-primary-100 dark:bg-dark-surface-3 dark:ring-dark-border-2">
            <img src={logoUrl} alt="" className="h-6 w-6 object-contain" aria-hidden="true" />
          </div>
          <span className="min-w-0">
            <span className="portal-eyebrow-muted block">{PLATFORM_UI_COPY.shell.workspace}</span>
            <span className="block truncate text-sm font-semibold text-iwana-primary dark:text-white">
              {branding.productName}
            </span>
          </span>
        </Link>

        <Link
          href="/dashboard"
          className={cn('hidden items-center justify-center', desktopCollapsed && 'lg:flex')}
          aria-label={PLATFORM_UI_COPY.shell.goHome}
          title={`${branding.productName} - ${PLATFORM_UI_COPY.navigation.home}`}
        >
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-iwana-surface-soft ring-1 ring-inset ring-iwana-primary-100 dark:bg-dark-surface-3 dark:ring-dark-border-2">
            <img src={logoUrl} alt="" className="h-6 w-6 object-contain" aria-hidden="true" />
          </div>
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label={PLATFORM_UI_COPY.shell.closeMenu}
          className="shrink-0 text-gray-500 transition-colors hover:text-iwana-primary dark:text-gray-400 dark:hover:text-white lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

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
