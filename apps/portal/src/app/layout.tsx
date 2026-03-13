import type { Metadata } from 'next';
import '@iwana/ui/styles/globals.css';
import { ThemeProvider } from '@iwana/ui';

export const metadata: Metadata = {
  title: 'iWana neXt — Portal de Suscriptores',
  description: 'Portal de autoservicio para suscriptores iWana neXt',
};

/**
 * Layout raiz del Portal de Suscriptores.
 * ThemeProvider aplica la clase 'dark' en el elemento html cuando corresponde.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
