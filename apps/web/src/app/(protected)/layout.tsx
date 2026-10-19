import type { ReactNode } from 'react';
import ProtectedLayoutClient from './layout-client';

// La sesión se valida en el navegador; el prerender instantáneo no puede
// completar este subárbol antes de la validación del cliente.
export const instant = false;

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <ProtectedLayoutClient>{children}</ProtectedLayoutClient>;
}
