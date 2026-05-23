import type { NextConfig } from 'next';

function resolvePortalApiProxyBase(): string {
  const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configuredApiBase && /^https?:\/\//.test(configuredApiBase)) {
    return configuredApiBase.replace(/\/$/, '');
  }

  return 'http://localhost:3000/api/v1';
}

/**
 * Configuracion Next.js — Portal de Suscriptores (@iwana/portal)
 *
 * Sprint 0 — Scaffold. Configuracion completa en Sprint 1:
 * - Variables de entorno publicas (NEXT_PUBLIC_*)
 * - Headers de seguridad (CSP, HSTS)
 * - Rewrites para proxy al API
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 5 (Frontend)
 * - ADR-023 (Hybrid auth: proxy + AuthProvider)
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@iwana/ui', '@iwana/shared'],
  cacheComponents: process.env.IWANA_DISABLE_CACHE_COMPONENTS !== '1',
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: {},
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${resolvePortalApiProxyBase()}/:path*`,
      },
    ];
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.gravatar.com',
        pathname: '/avatar/**',
      },
    ],
  },
};

export default nextConfig;
