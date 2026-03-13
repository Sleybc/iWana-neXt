// apps/portal/src/app/dashboard/layout.tsx
'use client';
import { useState, type ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';

/**
 * Layout Base del Portal Suscriptor.
 *
 * Estado de sidebar separado segun HLD-TRANSVERSAL-ADOPCION-TAILADMIN:
 * - sidebarDesktopCollapsed: colapso del sidebar en desktop (persiste en localStorage via Sidebar)
 * - sidebarMobileOpen: drawer overlay en mobile (transitorio, no persiste)
 */
export default function PortalDashboardLayout({ children }: { children: ReactNode }) {
  // Estado desktop: el sidebar arranca expandido
  const [sidebarDesktopCollapsed, setSidebarDesktopCollapsed] = useState(false);
  // Estado mobile: el drawer arranca cerrado
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-gray-950">
      {/* OVERLAY para mobile — cierra el drawer al hacer click externo */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-[9998] bg-black/50 lg:hidden"
          onClick={() => setSidebarMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* COMPONENTE SIDEBAR */}
      <Sidebar
        desktopCollapsed={sidebarDesktopCollapsed}
        setDesktopCollapsed={setSidebarDesktopCollapsed}
        mobileOpen={sidebarMobileOpen}
        setMobileOpen={setSidebarMobileOpen}
      />

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {/* HEADER */}
        <TopHeader
          desktopCollapsed={sidebarDesktopCollapsed}
          setDesktopCollapsed={setSidebarDesktopCollapsed}
          mobileOpen={sidebarMobileOpen}
          setMobileOpen={setSidebarMobileOpen}
        />

        {/* CONTENIDO DE LA PÁGINA */}
        <main>
          <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
