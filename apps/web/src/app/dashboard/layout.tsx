// apps/web/src/app/dashboard/layout.tsx
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';

/**
 * Layout de las páginas autenticadas del portal administrativo.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto">{children}</div>
    </div>
  );
}
