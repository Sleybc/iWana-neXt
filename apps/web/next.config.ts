import type { NextConfig } from 'next';

function resolveWebApiProxyBase(): string {
  // C-4 (ADR-081): variable de URL del API por aplicacion. Sin definir, el
  // bundle del navegador resuelve mismo-origen (/api/v1) y el rewrite apunta al
  // API local de desarrollo.
  const configuredApiBase = process.env.NEXT_PUBLIC_WEB_API_URL?.trim();

  if (configuredApiBase && /^https?:\/\//.test(configuredApiBase)) {
    return configuredApiBase.replace(/\/$/, '');
  }

  return 'http://localhost:3000/api/v1';
}

/**
 * Configuracion Next.js — Portal Administrativo (@iwana/web)
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
 * (vercel/next.js#80997). En desarrollo, webpack necesita ademas 'unsafe-eval'.
 * Normalizada a una sola linea antes de emitirse.
 */
const scriptSrcDirective =
  process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const contentSecurityPolicy = `default-src 'self';
  ${scriptSrcDirective};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
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
  cacheComponents: true,
  turbopack: {},
  allowedDevOrigins: ['127.0.0.1', 'localhost', '0.0.0.0'],
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
        destination: `${resolveWebApiProxyBase()}/:path*`,
      },
    ];
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

export default nextConfig;
