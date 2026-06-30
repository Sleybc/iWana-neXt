// apps/web/src/components/layout/TopHeader.tsx
'use client';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { DropdownUser } from './DropdownUser';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

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
  const { logoUrl } = usePlatformBrandingAssets();
  const menuToggleAriaProps = {
    'aria-controls': 'sidebar',
    'aria-expanded': mobileOpen,
    'aria-label': mobileOpen ? PLATFORM_UI_COPY.shell.closeMenu : PLATFORM_UI_COPY.shell.openMenu,
  } as const;

  const desktopMenuToggleAriaProps = {
    'aria-controls': 'sidebar',
    'aria-expanded': !desktopCollapsed,
    'aria-label': desktopCollapsed
      ? PLATFORM_UI_COPY.shell.expandSidebar
      : PLATFORM_UI_COPY.shell.collapseSidebar,
  } as const;

  return (
    <header className="sticky top-0 z-[999] flex w-full border-b border-transparent bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-transparent dark:bg-dark-surface-2/95">
      <div className="flex flex-grow items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            {...desktopMenuToggleAriaProps}
            onClick={(e) => {
              e.stopPropagation();
              setDesktopCollapsed(!desktopCollapsed);
            }}
            className="portal-input-surface hidden h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary lg:flex dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            type="button"
            {...menuToggleAriaProps}
            onClick={(e) => {
              e.stopPropagation();
              setMobileOpen(!mobileOpen);
            }}
            className="portal-input-surface flex h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link
            className="flex shrink-0 lg:hidden"
            href="/dashboard"
            aria-label={PLATFORM_UI_COPY.shell.goHome}
          >
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-iwana-surface-soft ring-1 ring-inset ring-iwana-primary-100 dark:bg-dark-surface-3 dark:ring-dark-border-2">
              <img src={logoUrl} alt="" className="h-6 w-6 object-contain" aria-hidden="true" />
            </div>
          </Link>

          <div className="hidden min-w-0 xl:block">
            <p className="portal-eyebrow-muted">{PLATFORM_UI_COPY.shell.workspace}</p>
            <p className="truncate text-sm font-semibold text-iwana-primary dark:text-white">
              {PLATFORM_UI_COPY.navigation.home}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {PLATFORM_UI_COPY.shell.workspaceSubtitle}
            </p>
          </div>
        </div>

        <div className="mx-6 hidden flex-1 lg:flex lg:justify-center">
          <div className="w-full max-w-2xl">
            <GlobalSearch />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell />
          <DropdownUser />
        </div>
      </div>
    </header>
  );
};
