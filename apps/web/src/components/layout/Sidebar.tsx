// apps/web/src/components/layout/Sidebar.tsx
'use client';
import { Suspense, useEffect, useRef, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Building2, ClipboardList, LayoutDashboard, Settings, Users, X } from 'lucide-react';
import { cn, interactiveFocusClassName } from '@iwana/ui';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { PlatformBrandMark } from './PlatformBrandMark';

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

const DESKTOP_STORAGE_KEY = 'iwana-web-sidebar-collapsed';

const navItems: NavItem[] = [
  { href: '/dashboard', label: PLATFORM_UI_COPY.navigation.home, icon: LayoutDashboard },
  { href: '/tenants', label: PLATFORM_UI_COPY.navigation.tenants, icon: Building2 },
  { href: '/users', label: PLATFORM_UI_COPY.navigation.users, icon: Users },
  { href: '/audit-logs', label: PLATFORM_UI_COPY.navigation.audit, icon: ClipboardList },
  { href: '/settings', label: PLATFORM_UI_COPY.navigation.settings, icon: Settings },
];

interface NavItemsProps {
  desktopCollapsed: boolean;
}

const NavItems = ({ desktopCollapsed }: NavItemsProps) => {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1 px-2">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              title={desktopCollapsed ? item.label : undefined}
              className={cn(
                'group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'relative bg-iwana-surface-soft text-iwana-primary dark:bg-dark-surface-3 dark:text-white'
                  : 'text-gray-600 hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-gray-100',
                desktopCollapsed && 'lg:justify-center lg:px-2',
                interactiveFocusClassName,
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary dark:bg-iwana-secondary-400"
                />
              )}
              <Icon
                aria-hidden
                className={cn(
                  'h-5 w-5 shrink-0',
                  isActive
                    ? 'text-iwana-secondary-700 dark:text-iwana-secondary'
                    : 'text-gray-400 group-hover:text-iwana-secondary-700 dark:text-gray-400 dark:group-hover:text-iwana-secondary',
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
      aria-label={PLATFORM_UI_COPY.shell.navLandmark}
      className={cn(
        'fixed left-0 top-0 z-(--z-drawer) flex h-screen flex-col overflow-y-hidden',
        'border-r border-transparent bg-white dark:border-transparent dark:bg-dark-surface-2',
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
          className={cn(
            'flex min-h-11 min-w-0 items-center gap-3',
            desktopCollapsed && 'lg:hidden',
            interactiveFocusClassName,
          )}
        >
          <PlatformBrandMark logoUrl={logoUrl} />
          <span className="min-w-0">
            <span className="portal-eyebrow-muted block">{PLATFORM_UI_COPY.shell.workspace}</span>
            <span className="block truncate text-sm font-semibold text-iwana-primary dark:text-white">
              {branding.productName}
            </span>
          </span>
        </Link>

        <Link
          href="/dashboard"
          className={cn(
            'hidden min-h-11 items-center justify-center',
            desktopCollapsed && 'lg:flex',
            interactiveFocusClassName,
          )}
          aria-label={PLATFORM_UI_COPY.shell.goHome}
          title={`${branding.productName} - ${PLATFORM_UI_COPY.navigation.home}`}
        >
          <PlatformBrandMark logoUrl={logoUrl} />
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label={PLATFORM_UI_COPY.shell.closeMenu}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center text-gray-500 transition-colors hover:text-iwana-primary dark:text-gray-400 dark:hover:text-white lg:hidden',
            interactiveFocusClassName,
          )}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="no-scrollbar flex flex-col overflow-y-auto flex-1 py-4">
        <nav aria-label={PLATFORM_UI_COPY.shell.menuLandmark}>
          <Suspense fallback={null}>
            <NavItems desktopCollapsed={desktopCollapsed} />
          </Suspense>
        </nav>
      </div>
    </aside>
  );
};
