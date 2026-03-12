import type { Metadata } from 'next';
import '@iwana/ui/styles/globals.css';

export const metadata: Metadata = {
  title: 'iWana neXt — Portal Administrativo',
  description: 'Portal administrativo para operadores ISP iWana neXt',
};

/**
 * Layout raiz del Portal Administrativo.
 *
 * Sprint 0 — Scaffold minimo.
 * Sprint 1 Semana 3-4: Se integra ThemeProvider, AuthProvider,
 * navegacion lateral y componentes del design system.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
