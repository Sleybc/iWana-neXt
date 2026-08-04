import type { NextConfig } from 'next';

function resolveWebApiProxyBase(): string {
  const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim();

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
  cacheComponents: true,
  turbopack: {},
  allowedDevOrigins: ['127.0.0.1', 'localhost', '0.0.0.0'],
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
