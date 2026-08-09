import type { NextConfig } from 'next';

function resolvePortalApiProxyBase(): string {
  const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configuredApiBase && /^https?:\/\//.test(configuredApiBase)) {
    return configuredApiBase.replace(/\/$/, '');
  }

  return 'http://127.0.0.1:3000/api/v1';
}

/**
 * Configuracion Next.js — Portal de Suscriptores (@iwana/portal)
 *
 * Sprint 0 — Scaffold. Configuracion completa en Sprint 1:
 * - Variables de entorno publicas (NEXT_PUBLIC_*)
 * - Rewrites para proxy al API
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 5 (Frontend)
 * - ADR-023 (Hybrid auth: proxy + AuthProvider)
 */

/**
 * Politica baseline de CSP sin nonces (documentacion oficial de Next.js para
 * apps sin proxy.ts): 'unsafe-inline' en script-src/style-src es requerido por
 * los scripts de bootstrap inline de Next y los estilos inline de React
 * (vercel/next.js#80997). El portal anade https://www.gravatar.com a img-src,
 * consistente con images.remotePatterns. Normalizada a una sola linea antes de
 * emitirse.
 */
const contentSecurityPolicy = `default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://www.gravatar.com;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;`
  .replace(/\s+/g, ' ')
  .trim();

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@iwana/ui', '@iwana/shared'],
  cacheComponents: process.env.IWANA_DISABLE_CACHE_COMPONENTS !== '1',
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: {},
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
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
