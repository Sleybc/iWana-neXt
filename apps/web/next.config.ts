import type { NextConfig } from 'next';

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
};

export default nextConfig;
