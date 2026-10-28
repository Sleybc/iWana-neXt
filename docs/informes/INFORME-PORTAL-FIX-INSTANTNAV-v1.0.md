# INFORME-PORTAL-FIX-INSTANTNAV-v1.0

**Fecha:** 2026-10-18 · **Versión:** 1.0 · **Estado:** vigente (verificado 2026-10-22) · **Módulo:** PORTAL (+ paridad WEB) · **Tipo:** corrección — consola de dev · **Modo de sesión:** ejecutor bajo gobernanza AI-EM-ARCH (AGENTS.md)

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

## 9. Corrección SSR del gate (2026-10-19) — superado por §10

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

> **Nota de corrección (2026-10-22):** la exclusión descrita en esta sección no cubría los segmentos descendientes. `instant = false` solo excluye el segmento que lo exporta; Next seguía validando las páginas hijas del árbol protegido. La corrección definitiva, con el redirect de raíz en configuración y el opt-out global de la validación, está en §10.

## 10. Corrección definitiva (2026-10-22)

**Encargo:** `docs/prompts/PROMPT-WEB-INSTANTNAV-FIX-v1.0.md` · **Plan:** `docs/plans/2026-10-22-web-instantnav-fix.md` · **Launcher:** `docs/prompts/PROMPT-WEB-INSTANTNAV-FIX-LAUNCH-v1.0.md`

Este apartado se mantiene en el informe de PORTAL porque el incidente se diagnosticó y corrigió una sola vez para ambas aplicaciones; duplicarlo en un informe WEB crearía dos fuentes de verdad para el mismo cambio.

### Síntoma

Con `next@16.4.2` y `cacheComponents: true`, la consola de desarrollo de web emitía cuatro errores por navegación y el portal replicaba el mismo patrón:

```text
Route "/": Could not validate `instant` because an error prevented the target segment from rendering.
[cause]: Error: NEXT_REDIRECT
Route "/dashboard": Could not validate that a segment in your UI has instant navigation.
Route "/auth/login": Next.js encountered runtime data during prerendering or a navigation.
```

### Causa raíz

1. **`/`** — `apps/web/src/app/page.tsx` y `apps/portal/src/app/page.tsx` llamaban `redirect()` dentro de una página que Cache Components prerenderiza. El `NEXT_REDIRECT` se registraba como error de render del shell y la validación de navegación instantánea no podía completarse.
2. **Árbol protegido** — la semántica real de `instant = false` es **excluir únicamente el segmento que lo exporta**; los segmentos descendientes se siguen validando (docs oficiales de `route-segment-config/instant` y del insight `instant-unrendered-segment`). El layout protegido de web (`(protected)/layout.tsx`) y el de portal (`dashboard/layout.tsx`) exportaban `instant = false`, pero `AuthReadyGate` no renderiza `{children}` durante el SSR: las páginas hijas quedaban como segmentos descartados. Además, cinco páginas protegidas de web (`users`, `tenants`, `audit-logs`, `settings`, `profile`) son Client Components y Next prohíbe exportar `instant` en ellos.
3. **`/auth/login`** — la página resolvía `await searchParams` sin un boundary `<Suspense>` propio con fallback real, lo que introducía runtime data durante el prerender y la navegación.

### Decisiones aplicadas

| ID | Decisión | Efecto |
| --- | --- | --- |
| D1 | El redirect de `/` vive en `redirects()` de `next.config.ts` (web: `/` → `/dashboard`; portal: `/` → `/auth/login`, ambos `permanent: false`) y se elimina la página `app/page.tsx` | 307 medido: web `Location: /dashboard`, portal `Location: /auth/login`; sin segmento prerenderizado ni `NEXT_REDIRECT` (CA-1/CA-2) |
| D2 | `/auth/login` exporta `instant = true`; la lectura de `searchParams` ocurre en un componente interno `async` dentro de `<Suspense fallback={<PlatformLoginExperience />}>` | El shell estático contiene la experiencia real y conserva la validación instantánea en la única ruta pública que puede cumplirla |
| D3 | `experimental.instantInsights.validationLevel: 'manual-warning'` en web y portal | Solo se validan segmentos con `instant` explícito; es la única opción documentada que cubre el árbol completo cuando las páginas hijas son Client Components |

### Archivos

| Archivo | Cambio |
| --- | --- |
| `apps/web/next.config.ts` | `experimental.instantInsights.validationLevel: 'manual-warning'` + `redirects()` de `/` → `/dashboard` |
| `apps/web/src/app/page.tsx` | eliminado (el redirect vive en configuración) |
| `apps/web/src/app/auth/login/page.tsx` | `instant = true` + `Suspense` con fallback de la experiencia real; metadata y variante `sobria` conservadas |
| `apps/portal/next.config.ts` | `experimental.instantInsights.validationLevel: 'manual-warning'` + `redirects()` de `/` → `/auth/login`; se conserva `IWANA_DISABLE_CACHE_COMPONENTS` |
| `apps/portal/src/app/page.tsx` | eliminado (el redirect vive en configuración) |

### Evidencia de verificación

Verificación de `gate-verifier` sobre el árbol sin commitear. CA-1 a CA-5 se midieron con `next dev` levantado; CA-6 y CA-7, con el stack detenido y los puertos libres:

| Criterio | Comando / medición | Resultado |
| --- | --- | --- |
| CA-1 | `curl.exe -D - http://127.0.0.1:3001/` | `HTTP/1.1 307 Temporary Redirect`, `location: /dashboard` |
| CA-2 | `curl.exe -D - http://127.0.0.1:3002/` | `HTTP/1.1 307 Temporary Redirect`, `location: /auth/login` |
| CA-3 | `curl.exe http://127.0.0.1:3001/auth/login` y `?variant=sobria` | `200` en ambas, HTML inicial con «Bienvenido», sin `data-dgst`; cero coincidencias de «runtime data during prerendering» en consola del navegador y en el log de `next dev` |
| CA-4 | Playwright sobre `next dev` reiniciado: `/dashboard`, `/users`, `/tenants`, `/audit-logs`, `/settings` por navegación cliente y `/profile` por carga completa | `200` en las seis rutas; cero coincidencias de «Could not validate», «instant navigation» o `NEXT_REDIRECT` en consola y log; portal `/dashboard` sin sesión también sin insights |
| CA-5 | Playwright sin sesión contra `/dashboard` | redirige a `/auth/login?next=%2Fdashboard&reason=session-expired` y muestra el shell de login |
| CA-6 | `pnpm --filter @iwana/web run typecheck` · `pnpm --filter @iwana/portal run typecheck` | exit `0` en ambos (1.620 y 2.309 archivos) |
| CA-6 | `pnpm --filter @iwana/web build` | exit `0`, 15/15 páginas, 0 errores/warnings; tabla sin fila `/` |
| CA-6 | `pnpm --filter @iwana/portal build` | exit `0`, 41/41 páginas, 0 errores/warnings; tabla sin fila `/` |
| CA-7 | `pnpm --filter @iwana/web test` | 38 suites, 233/233 tests aprobados, 0 omitidos |
| CA-7 | `pnpm --filter @iwana/portal test` | 320 suites, 3.240 aprobados y 1 omitido de 3.241; 0 fallos |

- Los conteos de CA-7 provienen de corridas Jest directas de `gate-verifier` (sin caché de Turbo). El delta frente a §5 se reparte entre las suites documentadas en §9 y pruebas preexistentes de otros cambios sin commitear; el bloque §10 no agrega ni modifica pruebas. El único omitido es `apps/portal/src/components/inventory/InventoryClient.spec.tsx:2244`, preexistente y ajeno al cambio.
- Ruta `/` ausente en tres artefactos de build: tabla de rutas, `app-path-routes-manifest.json` y `prerender-manifest.json`; tampoco existe `server/app/page.js` de raíz en ninguna app.
- `routes-manifest.json`: web `/` → `/dashboard` 307, portal `/` → `/auth/login` 307.
- Prettier y ESLint focalizados: exit `0`, sin mensajes. `pnpm exec playwright test --config=e2e/playwright.web.config.ts e2e/tests/web-auth-dashboard.spec.ts --project=chromium`: 2/2 aprobados contra el `next dev` reiniciado.
- Nota de verificación: durante la implementación, `tsc` falló por `.next/types/validator.ts`, un artefacto generado que todavía importaba `src/app/page.js`. Los builds lo regeneraron sin la ruta raíz y los typechecks posteriores pasaron.

#### Límites de evidencia declarados

- `instant` no forma parte de `.next/types/validator.ts`: su validez la da el tipo `InstantConfig` de Next 16.4.2 (`app-segment-config.d.ts:70`), no `tsc`.
- `manual-warning` valida **solo en desarrollo** y solo segmentos con `instant` explícito. Un build limpio acredita que la configuración se acepta y que las rutas compilan; no acredita validación de instant navigation en producción.
- La cobertura ≥ 80 % de módulos core no se midió en esta corrida (`pnpm test:coverage`): el diff no toca lógica de módulo core.

### Tradeoff aceptado

La validación implícita de instant navigation queda desactivada en ambas aplicaciones: el reporte de desarrollo solo evalúa segmentos que declaren `instant` explícitamente. Las páginas futuras que quieran conservar la validación deben añadir `export const instant = true` cuando su shell pueda prerenderizarse. `instant = false` permanece en los layouts protegidos como documentación de intención, pero ya no es el mecanismo que silencia el insight.

Esa ausencia de cambio de comportamiento aplica solo a D3: el opt-out es exclusivamente de validación de desarrollo. D1 sí es observable en producción, porque `/` deja de responder 200 con meta-refresh y pasa a responder 307 desde la configuración de Next; el destino no cambia (`/dashboard` en web, `/auth/login` en portal).

### Deuda y alcance

- Deuda nueva: **ninguna**. El tradeoff anterior es el ya aceptado en §9 y ahora queda acotado por el opt-in explícito.
- No se tocaron `AuthProvider`, `AuthReadyGate`, los layouts protegidos, endpoints, contratos de API, tokens, estilos, migraciones ni pruebas E2E existentes.
- Sin cambios de multi-tenancy, seguridad ni regulación: el gate de sesión del cliente y el redirect a `/auth/login?next=...` no cambian.
