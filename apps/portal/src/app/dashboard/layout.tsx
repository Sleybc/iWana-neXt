import type { ReactNode } from 'react';
import PortalDashboardLayoutClient from './layout-client';

// La sesión se valida en el navegador; el prerender instantáneo no puede
// completar este subárbol antes de la validación del cliente.
export const instant = false;

export default function PortalDashboardLayout({ children }: { children: ReactNode }) {
  return <PortalDashboardLayoutClient>{children}</PortalDashboardLayoutClient>;
}
