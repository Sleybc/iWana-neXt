import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@iwana/ui/styles/globals.css';
import './web-typography.css';
import { ThemeProvider, THEME_BOOTSTRAP_SCRIPT } from '@iwana/ui';
import { Exo_2, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { PlatformBrandingProvider } from '@/components/branding/PlatformBrandingProvider';

const exo2 = Exo_2({
  subsets: ['latin'],
  weight: ['100', '300', '400', '500', '600', '700', '800'],
  display: 'swap',
  fallback: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'iWana neXt — Portal Administrativo',
  description: 'Portal administrativo para operadores ISP iWana neXt',
  icons: {
    icon: '/brand/iwiso6.png',
    shortcut: '/brand/iwiso6.png',
  },
};

/**
 * Layout raiz del Portal Administrativo.
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
            <PlatformBrandingProvider>
              <AuthProvider>{children}</AuthProvider>
            </PlatformBrandingProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
