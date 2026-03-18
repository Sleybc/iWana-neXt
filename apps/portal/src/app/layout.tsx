import type { Metadata } from 'next';
import '@iwana/ui/styles/globals.css';
import { ThemeProvider } from '@iwana/ui';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { TenantFavicon } from '@/components/layout/TenantFavicon';

export const metadata: Metadata = {
  title: 'iWana neXt — Portal Corporativo',
  description: 'Portal corporativo de autoservicio para empresas en iWana neXt',
  icons: {
    icon: '/brand/iwiso6.png',
    shortcut: '/brand/iwiso6.png',
  },
};

/**
 * Layout raiz del Portal Corporativo.
 * ThemeProvider aplica la clase 'dark' en el elemento html cuando corresponde.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <TenantFavicon />
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
