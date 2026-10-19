# INFORME-PORTAL-FIX-INSTANTNAV-v1.0

**Fecha:** 2026-10-18 · **Módulo:** PORTAL (+ paridad WEB) · **Tipo:** corrección — consola de dev · **Modo de sesión:** ejecutor bajo gobernanza AI-EM-ARCH (AGENTS.md)

> **Addendum 2026-10-19:** la solución inicial de §3 mantuvo los segmentos para la validación instantánea, pero dejó abierto el stream SSR cuando la promesa de `AuthReadyGate` esperaba indefinidamente el efecto cliente. La corrección vigente y su tradeoff están en §9; §3 conserva la historia de la primera intervención.

## 1. Problema

En desarrollo, el portal emitía en overlay/console por cada ruta del dashboard:

```
Error: Route "/dashboard/crm/subscribers": Could not validate that a segment in your UI has instant navigation.
```

(incl. `/dashboard`, `/dashboard/crm/subscribers/[id]`, `/dashboard/crm/expedientes`, `/dashboard/crm/expedientes/[id]` — 13 errores en la corrida).

## 2. Causa raíz (verificada contra fuente oficial)

Feature «Instant Navigation» de Next.js **16.3+** (portal y web corren `next ^16.4.2` con `cacheComponents` activo): en dev se valida que **cada segmento del prerender produzca UI instantánea**. Insight oficial: `nextjs.org/docs/messages/instant-unrendered-segment` — un layout que **omite `{children}`** del árbol durante el prerender dropea todos los segmentos del subárbol y la validación "no puede correr".

El portal lo cumplía exactamente: `apps/portal/src/app/dashboard/layout.tsx` (líneas 206–216 pre-fix) hacía early-return **sin children** en `authLoading && !user` («Validando sesión...») y `return null` sin user. Como el `AuthProvider` arranca con `isLoading=true` + `user=null`, el prerender de **todas** las rutas bajo `/dashboard` pasaba por ese branch → drop de segmentos → insight por ruta. Mismo pattern en `apps/web/src/app/(protected)/layout.tsx` (líneas 26–36 pre-fix).

Descartado: `export const instant = false` — **prohibido en Client Components** (docs oficiales: "instant cannot be used in Client Components. It will throw an error"), y ambos layouts son `'use client'`.

## 3. Solución (patrón sancionado por docs: `<Suspense>` arriba)

Componente nuevo por app — `AuthReadyGate` (`apps/portal/src/components/auth/AuthReadyGate.tsx` y espejo en `apps/web/src/components/auth/AuthReadyGate.tsx`):

- **Loader-validación de sesión (`isLoading=true`, estado del prerender):** el subárbol **SUSPENDE** —no se omite— vía `use(promise)` dentro de `<Suspense fallback={<AuthValidatingShell/>}>`; los children permanecen en el árbol (deferidos) → la validación de navegación instantánea queda satisfecha.
- **Sesión lista:** `<>{children}</>` — árbol idéntico al previo.
- **Sesión descartada (`isLoading=false && !user`):** shell «Validando sesión...» como contenido real **sin suspender**. Desviación de contrato documentada del agente ejecutor (§4-a de su reporte): con el boundary suspendido en montaje, React congela los efectos del ancestro — verificado empíricamente en el spec — y el redirect a `/auth/login` nunca correría. El markup del shell es textualmente el del early-return previo: cambio visual nulo.

Ediciones de layout: eliminados los dos early-returns; el árbol completo (`PermissionsProvider → Sidebar → TopHeader → main → children`) queda envuelto en `<AuthReadyGate>`. Redirects, branding, título, drawer y listeners intactos. UX pre/sesión idéntica a la previa.

## 4. Tests

- Portal: `layout.spec.tsx` ampliado con mock mutable de `useAuth` + 3 tests (fallback sin chrome/hijos y sin redirect; sin sesión → `replace('/auth/login')`; loading→autenticado resuelve el gate). 4 tests previos intactos.
- Web: `layout.spec.tsx` nuevo con los 3 casos espejo (`next=` codificado).

## 5. Evidencia de gates (re-ejecutada por el orquestador tras el agente — aprobador ≠ productor)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Spec aislado portal | `pnpm --filter @iwana/portal exec jest src/app/dashboard/layout.spec.tsx` | 7/7 ✓ |
| Spec aislado web | `pnpm --filter @iwana/web exec jest "protected./layout"` | 3/3 ✓ |
| Suite portal | `pnpm --filter @iwana/portal test` | **307 suites, 3.124/3.125 tests** (1 `it.skip` preexistente en `InventoryClient.spec.tsx`, cubierto por E2E) ✓ |
| Suite web | `pnpm --filter @iwana/web test` | **37 suites, 232/232** ✓ |
| Typecheck | `pnpm --filter @iwana/portal run typecheck` · `…@iwana/web run typecheck` | exit 0 ambos ✓ |
| Lint | `…run lint` ambos | 0 errores (43/10 warnings preexistentes) ✓ |

## 6. Archivos

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/auth/AuthReadyGate.tsx` | nuevo |
| `apps/portal/src/app/dashboard/layout.tsx` | gate + early-returns fuera |
| `apps/portal/src/app/dashboard/layout.spec.tsx` | +3 tests |
| `apps/web/src/components/auth/AuthReadyGate.tsx` | nuevo (espejo) |
| `apps/web/src/app/(protected)/layout.tsx` | gate + early-returns fuera |
| `apps/web/src/app/(protected)/layout.spec.tsx` | nuevo |

## 7. Verificación runtime pendiente (manual)

En `pnpm dev`, tras HMR: visitar portal `/dashboard`, `/dashboard/crm/subscribers(/new/[id])`, `/dashboard/crm/expedientes(/new/[id])` y consola web `/dashboard` — no debe aparecer el insight `Could not validate that a segment…`.

## 8. Deuda y traeraza

- Deuda nueva: **ninguna**. Desviación de contrato documentada en §3 (decisión del agente con evidencia; orquestador la ratifica — el estado descartado no suspende).
- No toca: `next.config.ts`, `cacheComponents`, `AuthProvider`, permisos, E2E, tokens. Swagger/OpenAPI: N/A. Migraciones: N/A.
- PII en logs: sin cambios (no hay logs nuevos).
- Prompt de lanzamiento: `docs/prompts/PROMPT-PORTAL-FIX-INSTANTNAV-LAUNCH-v1.0.md`.

## 9. Corrección SSR del gate (2026-10-19)

### Causa y decisión

El smoke Chromium de MOD05 quedó bloqueado antes de la primera interacción: `AuthReadyGate` consumía con `use()` una promesa que solo se resolvía desde un efecto cliente. En SSR el efecto no corre, así que React enviaba el shell «Validando sesión...» y mantenía abierta la respuesta. El mismo patrón existía en portal y web.

Con autorización del usuario, el gate ahora renderiza el shell durante `isLoading` y sin usuario, y monta `{children}` solo después de validar la sesión. Los layouts de ruta son wrappers Server Component que exportan `instant = false`; el componente cliente se trasladó a `layout-client.tsx`. Next reserva esa opción para módulos de servidor; el wrapper hace explícita la exclusión del árbol protegido de la validación de navegación instantánea. La respuesta SSR cierra sin serializar el hijo protegido y la sesión sigue validándose en el navegador.

La decisión desactiva la validación de navegación instantánea para `/dashboard/**` del portal y el grupo `(protected)` de web. Mantiene la protección del contenido y hace visible el fallback mientras se valida. Se acepta esa pérdida de validación instantánea para los árboles que dependen del estado de autenticación cliente.

### Evidencia de verificación

- SSR portal/web: `pnpm --filter @iwana/portal exec jest --runInBand --runTestsByPath src/components/auth/AuthReadyGate.ssr.spec.tsx` y equivalente `@iwana/web`; 1 suite y 1 test aprobados por app. El stream cierra, contiene el shell y excluye «Contenido protegido».
- Layouts portal/web: `pnpm --filter @iwana/portal exec jest --runInBand --runTestsByPath src/app/dashboard/layout.spec.tsx` y equivalente `@iwana/web` para `(protected)`; 2 suites/8 tests en portal, 2 suites/4 tests en web.
- Chromium portal: `pnpm exec playwright test --config=e2e/playwright.portal.config.ts e2e/tests/portal-auth-ready-gate.spec.ts --project=chromium`; 1/1. La respuesta inicial no incluye «Suscriptor Sintético»; tras autenticar aparecen las tabs de la ficha y no se registran errores del navegador.
- Chromium web: `pnpm exec playwright test --config=e2e/playwright.web.config.ts e2e/tests/web/admin-bootstrap.spec.ts --project=chromium`; 1/1 bootstrap administrativo completado.
- `pnpm --filter @iwana/portal build` y `pnpm --filter @iwana/web build`: exit 0; ambas aplicaciones compilaron y generaron sus rutas estáticas/parciales.
- Typecheck portal/web: exit 0. Lint focalizado en los dos gates y wrappers: exit 0.

### Archivos de autenticación fuera del commit E4

`apps/portal/src/components/auth/AuthReadyGate.tsx`, `apps/portal/src/components/auth/AuthReadyGate.ssr.spec.tsx`, `apps/portal/src/app/dashboard/layout.tsx`, `apps/portal/src/app/dashboard/layout-client.tsx`, `apps/web/src/components/auth/AuthReadyGate.tsx`, `apps/web/src/components/auth/AuthReadyGate.ssr.spec.tsx`, `apps/web/src/app/(protected)/layout.tsx`, `apps/web/src/app/(protected)/layout-client.tsx`, ambos specs de layout y este informe de corrección pertenecen al arreglo transversal de SSR; se mantienen fuera del commit E4.
