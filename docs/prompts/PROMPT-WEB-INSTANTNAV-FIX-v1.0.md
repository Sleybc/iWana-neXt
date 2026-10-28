# PROMPT-WEB-INSTANTNAV-FIX-v1.0

**Modulo:** WEB (+ paridad PORTAL) · **Fase:** correccion de incidente en desarrollo · **Version:** v1.0 · **Estado:** aprobado para ejecucion
**Agente destinatario:** AI-FE-PLATFORM (`fe-platform`)
**Modo de sesion:** ejecutor bajo gobernanza AI-EM-ARCH
**Fecha:** 2026-10-22 · **Plan:** `docs/plans/2026-10-22-web-instantnav-fix.md`
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2
**Artefactos de entrada:** plan `2026-10-22-web-instantnav-fix.md`; `INFORME-PORTAL-FIX-INSTANTNAV-v1.0.md` §9; `apps/web/next.config.ts`; `apps/portal/next.config.ts`; `apps/web/src/app/page.tsx`; `apps/portal/src/app/page.tsx`; `apps/web/src/app/auth/login/page.tsx`

## 1. Sintoma reportado

Al ejecutar `pnpm dev`, la consola de plataforma emite en el overlay de Next.js 16.4.2:

```text
Route "/": Could not validate `instant` because an error prevented the target segment from rendering.
[cause]: Error: NEXT_REDIRECT
Route "/dashboard": Could not validate that a segment in your UI has instant navigation.
Route "/auth/login": Next.js encountered runtime data during prerendering or a navigation.
```

Cuatro errores en total; los tres mensajes anteriores son las causas distintas. El portal tiene el mismo patron en `/` y en `/dashboard/**`.

## 2. Causa raiz verificada (no renegociar en esta fase)

1. **`/`** — `apps/web/src/app/page.tsx` y `apps/portal/src/app/page.tsx` llaman `redirect()` dentro de una pagina que Cache Components prerenderiza. El `NEXT_REDIRECT` se registra como error de render del shell: la respuesta sale 200 con meta-refresh y template `data-dgst="NEXT_REDIRECT..."`, y la validacion de navegacion instantanea no puede completarse.
2. **`/dashboard` y rutas protegidas** — el layout protegido es un Server Component con `instant = false`, pero **`instant = false` solo excluye el segmento que lo exporta; los segmentos descendientes se siguen validando** (docs oficiales `route-segment-config/instant` y `messages/instant-unrendered-segment`). El layout cliente (`AuthReadyGate`) no renderiza `{children}` durante el SSR, asi que la pagina hija se considera "dropped segment". Ademas, 5 de las 8 paginas protegidas de web son Client Components (`users`, `tenants`, `audit-logs`, `settings`, `profile`) y **no pueden exportar `instant`** porque Next lo prohibe en Client Components.
3. **`/auth/login`** — `apps/web/src/app/auth/login/page.tsx` hace `await searchParams` sin un boundary `<Suspense>` propio con fallback real. Bajo Cache Components eso es runtime data durante el prerender/navegacion.

## 3. Decision aprobada

- **D1 — Redirect de raiz a nivel de configuracion.** Sustituir la pagina `/` por `redirects()` en `next.config.ts` (web: `/` -> `/dashboard`; portal: `/` -> `/auth/login`). Elimina el segmento y el `NEXT_REDIRECT`; devuelve 307 real.
- **D2 — Login con shell instantaneo.** Envolver la lectura de `searchParams` en `<Suspense fallback={<PlatformLoginExperience />}>` y exportar `const instant = true` en la pagina para conservar la validacion de la unica ruta publica que si puede ser instantanea.
- **D3 — Opt-out global explicito para arboles con auth cliente.** Agregar `experimental.instantInsights.validationLevel: 'manual-warning'` en `apps/web/next.config.ts` y `apps/portal/next.config.ts`. Solo se validan segmentos con `instant` explicito. Es la unica opcion documentada que cubre el arbol completo cuando las paginas hijas son Client Components; coincide con el tradeoff ya aceptado en `INFORME-PORTAL-FIX-INSTANTNAV-v1.0.md` §9.

## 4. Alcance exacto

| Archivo                                               | Cambio                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/next.config.ts`                             | `experimental.instantInsights.validationLevel: 'manual-warning'` + `redirects()` con `/` -> `/dashboard`                  |
| `apps/web/src/app/page.tsx`                           | eliminar (el redirect vive en config)                                                                                     |
| `apps/web/src/app/auth/login/page.tsx`                | `Suspense` con fallback de la experiencia premium + `export const instant = true`; conservar metadata y variante `sobria` |
| `apps/portal/next.config.ts`                          | `experimental.instantInsights.validationLevel: 'manual-warning'` + `redirects()` con `/` -> `/auth/login`                 |
| `apps/portal/src/app/page.tsx`                        | eliminar (el redirect vive en config)                                                                                     |
| `docs/informes/INFORME-PORTAL-FIX-INSTANTNAV-v1.0.md` | nueva seccion §10 con la correccion, evidencia y tradeoff; anotar en §9 que el opt-out del padre no cubre descendientes   |

No tocar: `AuthProvider`, `AuthReadyGate`, `(protected)/layout.tsx`, `dashboard/layout.tsx`, endpoints, contratos de API, tokens, estilos, migraciones ni E2E existentes.

## 5. Criterios de aceptacion

- **CA-1** `GET http://127.0.0.1:3001/` responde `307` con `Location: /dashboard`; sin meta-refresh ni `data-dgst` de `NEXT_REDIRECT`.
- **CA-2** `GET http://127.0.0.1:3002/` responde `307` con `Location: /auth/login`.
- **CA-3** En `next dev` reiniciado, cargar `/auth/login` no emite "Next.js encountered runtime data during prerendering or a navigation"; el HTML inicial contiene el shell de login (no un boundary vacio).
- **CA-4** En `next dev` reiniciado, cargar `/dashboard`, `/users`, `/tenants`, `/audit-logs`, `/settings` y `/profile` no emite "Could not validate ... instant".
- **CA-5** Un usuario sin sesion que entra a `/dashboard` sigue siendo redirigido a `/auth/login?next=...` por el gate cliente.
- **CA-6** `pnpm --filter @iwana/web run typecheck`, `pnpm --filter @iwana/portal run typecheck`, `pnpm --filter @iwana/web build` y `pnpm --filter @iwana/portal build` terminan en 0.
- **CA-7** Suite web y suite portal sin regresiones (conteo real, `Cached: 0` cuando aplique).

## 6. Evidencia obligatoria en el reporte

- Diff de cada archivo y justificacion de una linea.
- Salida real de los comandos de CA-6 y CA-7 con conteos.
- Para CA-1..CA-4: comandos ejecutados, puerto, respuestas HTTP y lineas de log relevantes (sin PII).
- Deuda nueva por severidad; si no hay, declararlo.
- Confirmacion de que no se toco auth, contratos ni boundaries.

## 7. Stop/go

- **Stop:** si al reiniciar el dev server aparece un error distinto que no sea de validacion instantanea, o si `manual-warning` no existe en la version instalada de Next. Reportar `[BLOQUEO]` con la salida exacta; no inventar una alternativa.
- **Go:** CA-1..CA-7 verificados con evidencia.
