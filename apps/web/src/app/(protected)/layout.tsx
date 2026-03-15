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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-dark-surface">
        <p className="text-sm text-gray-600 dark:text-gray-300">Validando sesión...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-dark-surface">
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-[9998] bg-black/50 lg:hidden"
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

      <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <TopHeader
          desktopCollapsed={sidebarDesktopCollapsed}
          setDesktopCollapsed={setSidebarDesktopCollapsed}
          mobileOpen={sidebarMobileOpen}
          setMobileOpen={setSidebarMobileOpen}
        />

        <main>
          <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
