// apps/web/src/components/layout/TopHeader.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, Search, X } from 'lucide-react';
import { cn, interactiveFocusClassName } from '@iwana/ui';
import { DropdownUser } from './DropdownUser';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { PlatformBrandMark } from './PlatformBrandMark';

interface TopHeaderProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const MOBILE_SEARCH_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const TopHeader = ({
  desktopCollapsed,
  setDesktopCollapsed,
  mobileOpen,
  setMobileOpen,
}: TopHeaderProps) => {
  const { logoUrl } = usePlatformBrandingAssets();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileSearchOverlayRef = useRef<HTMLDivElement>(null);
  const wasMobileSearchOpenRef = useRef(false);
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

  useEffect(() => {
    if (mobileSearchOpen) {
      wasMobileSearchOpenRef.current = true;
      const frameId = window.requestAnimationFrame(() => {
        const input =
          mobileSearchOverlayRef.current?.querySelector<HTMLInputElement>('input[role="combobox"]');
        input?.focus();
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    if (wasMobileSearchOpenRef.current) {
      wasMobileSearchOpenRef.current = false;
      searchTriggerRef.current?.focus();
    }

    return undefined;
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (!mobileSearchOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileSearchOpen(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const overlay = mobileSearchOverlayRef.current;
      if (!overlay) {
        return;
      }

      const focusables = Array.from(
        overlay.querySelectorAll<HTMLElement>(MOBILE_SEARCH_FOCUSABLE_SELECTOR),
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        return;
      }

      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !overlay.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !overlay.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileSearchOpen]);

  return (
    <header className="sticky top-0 z-20 flex w-full border-b border-transparent bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-transparent dark:bg-dark-surface-2/95">
      <div className="flex flex-grow items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            {...desktopMenuToggleAriaProps}
            onClick={(e) => {
              e.stopPropagation();
              setDesktopCollapsed(!desktopCollapsed);
            }}
            className={cn(
              'portal-input-surface hidden h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white lg:flex',
              interactiveFocusClassName,
            )}
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
            className={cn(
              'portal-input-surface flex h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white lg:hidden',
              interactiveFocusClassName,
            )}
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link
            className={cn('flex shrink-0 lg:hidden', interactiveFocusClassName)}
            href="/dashboard"
            aria-label={PLATFORM_UI_COPY.shell.goHome}
          >
            <PlatformBrandMark logoUrl={logoUrl} />
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
          <button
            ref={searchTriggerRef}
            type="button"
            aria-label="Buscar en la plataforma"
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-global-search"
            onClick={() => setMobileSearchOpen(true)}
            className={cn(
              'portal-input-surface flex h-11 w-11 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white lg:hidden',
              interactiveFocusClassName,
            )}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
          <ThemeToggle />
          <NotificationBell />
          <DropdownUser />
        </div>
      </div>

      {mobileSearchOpen ? (
        <div
          ref={mobileSearchOverlayRef}
          id="mobile-global-search"
          role="dialog"
          aria-modal="true"
          aria-label="Buscar en la plataforma"
          className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-dark-surface lg:hidden"
        >
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-dark-border">
            <button
              type="button"
              aria-label="Cerrar búsqueda"
              onClick={() => setMobileSearchOpen(false)}
              className={cn(
                'portal-input-surface flex h-11 w-11 shrink-0 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white',
                interactiveFocusClassName,
              )}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <p className="truncate text-sm font-semibold text-iwana-primary dark:text-white">
              Buscar en la plataforma
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <GlobalSearch />
          </div>
        </div>
      ) : null}
    </header>
  );
};
