import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@iwana/ui/styles/globals.css';
import './portal-typography.css';
import { ThemeProvider, THEME_BOOTSTRAP_SCRIPT } from '@iwana/ui';
import { Exo_2, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { TenantFavicon } from '@/components/layout/TenantFavicon';

const exo2 = Exo_2({
  subsets: ['latin'],
  weight: ['100', '300', '400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  preload: false,
  variable: '--font-jetbrains-mono',
});

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={`${exo2.className} ${jetbrainsMono.variable} antialiased`}>
        <ThemeProvider>
          <Suspense fallback={null}>
            <AuthProvider>
              <TenantFavicon />
              {children}
            </AuthProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
