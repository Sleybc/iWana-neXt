import type { Metadata } from 'next';
import '@iwana/ui/styles/globals.css';

export const metadata: Metadata = {
  title: 'iWana neXt — Portal de Suscriptores',
  description: 'Portal de autoservicio para suscriptores iWana neXt',
};

/**
 * Layout raiz del Portal de Suscriptores.
 *
 * Sprint 0 — Scaffold minimo.
 * Sprint 1 Semana 3-4: Se integra ThemeProvider, AuthProvider
 * y componentes del design system para suscriptores.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
