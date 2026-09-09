'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Layout protegido: aplica shell administrativo y valida sesión activa.
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  const [sidebarDesktopCollapsed, setSidebarDesktopCollapsed] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/auth/login?next=${encodeURIComponent(pathname ?? '/dashboard')}`);
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-iwana-surface-soft dark:bg-dark-surface">
        <p className="text-sm text-gray-600 dark:text-gray-300">Validando sesión...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-dark-surface-2">
      {/* Velo del sidebar mobile. Adopta el token `--color-veil` (/45 en claro,
          /60 en oscuro) y gana así el valor de modo oscuro que no tenía. NO
          consume `ModalLayer`: es la excepción de §2bis —su panel es el
          `Sidebar`, chrome que no puede portalarse—, así que sigue siendo un
          constructo de dos escalones con el velo por DEBAJO del panel. Sin
          desenfoque a propósito. */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-(--z-shell-raised) bg-(--color-veil) lg:hidden"
          onClick={() => setSidebarMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        desktopCollapsed={sidebarDesktopCollapsed}
        setDesktopCollapsed={setSidebarDesktopCollapsed}
        mobileOpen={sidebarMobileOpen}
        setMobileOpen={setSidebarMobileOpen}
      />

      <div className="relative flex flex-1 flex-col overflow-x-hidden">
        <TopHeader
          desktopCollapsed={sidebarDesktopCollapsed}
          setDesktopCollapsed={setSidebarDesktopCollapsed}
          mobileOpen={sidebarMobileOpen}
          setMobileOpen={setSidebarMobileOpen}
        />

        {/* Canvas: radio 3xl en el canto con el sidebar (operador 2026-08-11; deroga CA-SB-02). */}
        <main className="flex-1 overflow-y-auto bg-iwana-surface-soft dark:bg-dark-surface lg:rounded-3xl">
          <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
