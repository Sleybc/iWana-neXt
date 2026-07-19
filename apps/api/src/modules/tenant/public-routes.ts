/**
 * Clasificación de las rutas públicas frente al contexto de tenant.
 *
 * `TenantMiddleware` corre **antes** que los guards y no ve el handler
 * resuelto, así que no puede leer el metadato de `@Public()`. Necesita saber
 * por ruta si debe exigir contexto de tenant.
 *
 * Hasta 2026-07-19 esa información vivía como una lista literal dentro del
 * middleware que **nunca estuvo sincronizada** con los `@Public()` reales:
 * 6 de las rutas públicas devolvían 401 anónimo, entre ellas
 * `/auth/platform/login`, `/platform-users/bootstrap` y
 * `/platform/branding/public`. Efecto: en una instalación con cero tenants no
 * se podía crear el primer administrador de plataforma ni cargar el branding
 * de la pantalla de login — `apps/web` era inalcanzable de extremo a extremo.
 * `apps/portal` no lo sufría solo porque fija `X-Tenant-Slug` en todas sus
 * peticiones, lo que enmascaraba el defecto en vez de evitarlo.
 *
 * Ser público y no necesitar tenant son cosas distintas. Hay **tres** estados:
 *
 * 1. **Pública sin tenant** — anónima y de ámbito plataforma. El middleware no
 *    debe exigir header ni resolver contexto.
 * 2. **Pública con tenant obligatorio** — anónima, pero opera sobre un tenant
 *    concreto (su handler llama `TenantContext.getOrThrow()`), así que el
 *    header `X-Tenant-Slug` sigue siendo obligatorio.
 * 3. **Protegida** — el tenant sale de los claims del JWT verificado.
 *
 * `@Public()` distingue 1 y 2 de 3, pero no separa 1 de 2. Por eso estas dos
 * listas son la fuente de verdad y `tenant-public-routes.spec.ts` obliga a que
 * **toda** ruta con `@Public()` esté clasificada en exactamente una: una ruta
 * pública nueva rompe el build hasta que alguien decida a cuál pertenece.
 *
 * Las rutas se escriben normalizadas: sin el prefijo global `/api/v1`, sin
 * barra final y en minúsculas — el mismo formato que produce
 * `TenantMiddleware.getNormalizedPath()`.
 */

/** Rutas públicas de ámbito plataforma: no requieren contexto de tenant. */
export const PUBLIC_ROUTES_WITHOUT_TENANT: readonly string[] = [
  '/auth/platform/login',
  '/platform-users/bootstrap',
  '/platform-users/bootstrap/status',
  '/platform/branding/public',
] as const;

/**
 * Rutas públicas que sí operan sobre un tenant concreto.
 *
 * Siguen exigiendo `X-Tenant-Slug` porque su handler resuelve
 * `TenantContext`. Esta lista no la consume el middleware: existe para que la
 * clasificación sea explícita y para que el test de deriva pueda comprobar que
 * ninguna ruta pública quedó sin decidir.
 */
export const PUBLIC_ROUTES_WITH_TENANT: readonly string[] = [
  '/auth/login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/email/verify',
  '/auth/email/resend-verification',
] as const;
