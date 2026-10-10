import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@iwana/ui/styles/globals.css';
import './portal-typography.css';
import { ThemeProvider, THEME_BOOTSTRAP_SCRIPT } from '@iwana/ui';
import localFont from 'next/font/local';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { SessionRecoveryModal } from '@/components/auth/SessionRecoveryModal';
import { TenantFavicon } from '@/components/layout/TenantFavicon';

const exo2 = localFont({
  src: '../../../../packages/ui/src/styles/fonts/exo2-latin.woff2',
  weight: '100 800',
  display: 'swap',
  variable: '--font-exo-2',
});

const jetbrainsMono = localFont({
  src: '../../../../packages/ui/src/styles/fonts/jetbrains-mono-latin.woff2',
  weight: '400 500',
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
      <body className={`${exo2.className} ${exo2.variable} ${jetbrainsMono.variable} antialiased`}>
        <ThemeProvider>
          <Suspense fallback={null}>
            <AuthProvider>
              <TenantFavicon />
              {children}
              {/* Recuperación de sesión en sitio: una sola instancia global
                  escucha `iwana:session-expired` y re-autentica sin recargar. */}
              <SessionRecoveryModal />
            </AuthProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
