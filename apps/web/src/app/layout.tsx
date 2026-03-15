import type { Metadata } from 'next';
import '@iwana/ui/styles/globals.css';
import { ThemeProvider } from '@iwana/ui';
import { AuthProvider } from '@/components/auth/AuthProvider';

export const metadata: Metadata = {
  title: 'iWana neXt — Portal Administrativo',
  description: 'Portal administrativo para operadores ISP iWana neXt',
};

/**
 * Layout raiz del Portal Administrativo.
 * ThemeProvider aplica la clase 'dark' en el elemento html cuando corresponde.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
