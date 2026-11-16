import type { NextConfig } from 'next';

import { buildContentSecurityPolicy } from './src/lib/content-security-policy';

function resolvePortalApiProxyBase(): string {
  // C-4 (ADR-081): variable de URL del API por aplicacion. Sin definir, el
  // bundle del navegador resuelve mismo-origen (/api/v1) y el rewrite apunta al
  // API local de desarrollo.
  const configuredApiBase = process.env.NEXT_PUBLIC_PORTAL_API_URL?.trim();

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
 * (vercel/next.js#80997). La construccion vive en src/lib/content-security-policy.ts;
 * `img-src` y `media-src` admiten el origen exacto de S3_ENDPOINT (enlaces firmados
 * de adjuntos) y nada si falta. `headers()` se resuelve en `next build`: S3_ENDPOINT
 * debe estar definido al construir la imagen.
 */
const contentSecurityPolicy = buildContentSecurityPolicy({
  nodeEnv: process.env.NODE_ENV,
  // Producción: el origen público con el que la API firma (S3_PUBLIC_ENDPOINT, D2 MOD09).
  // Desarrollo: sin él, el endpoint directo de MinIO, que también es el que firma la API.
  storageEndpoint: process.env.S3_PUBLIC_ENDPOINT?.trim() || process.env.S3_ENDPOINT,
});

const cacheComponents = process.env.IWANA_DISABLE_CACHE_COMPONENTS !== '1';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@iwana/ui', '@iwana/shared'],
  cacheComponents,
  ...(cacheComponents ? { partialPrefetching: false } : {}),
  agentRules: false,
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: {},
  experimental: {
    // El arbol del dashboard depende del estado de sesion del cliente y no
    // puede validarse de forma implicita: solo se validan segmentos con
    // `instant` explicito. Ver INFORME-PORTAL-FIX-INSTANTNAV-v1.0 §10.
    instantInsights: {
      validationLevel: 'manual-warning',
    },
    // Proxy de `/api/v1/*` (rewrites): por defecto Next corta el cuerpo en 10 MB y espera
    // 30 s, así que un ZIP de UISP de 27,7 MB terminaba en 500 (2026-11-15). Alineado con
    // MIGRATION_IMPORT_LIMITS.maxBatchBytes (200 MB) + holgura del multipart, igual que nginx
    // (210M), y con el tiempo de espera de la subida en el cliente (10 min).
    proxyClientMaxBodySize: '210mb',
    proxyTimeout: 10 * 60_000,
  },
  async redirects() {
    // La raiz se resuelve en configuracion (307) para no prerenderizar un
    // segmento con `redirect()`, que rompe la validacion de instant navigation.
    return [
      {
        source: '/',
        destination: '/auth/login',
        permanent: false,
      },
    ];
  },
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
    remotePatterns: [],
  },
};

export default nextConfig;
