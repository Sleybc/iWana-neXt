# Informe — Auth · Límites de peticiones (L1)

**Versión:** 1.0
**Fecha:** 2026-11-06
**Módulo:** Transversal · Auth (MOD01)
**Fase:** L1
**Autor:** `sr-backend`
**Spec:** [2026-11-06-limites-de-peticiones-spec.md](../specs/2026-11-06-limites-de-peticiones-spec.md)
**Prompt:** [PROMPT-AUTH-LIMITES-PETICIONES-v1.0.md](../prompts/PROMPT-AUTH-LIMITES-PETICIONES-v1.0.md)
**Rama:** `main`, sin commit
**Estado:** implementación verificada; revisiones de §R1 registradas al final

---

## 1. Resultado en una línea

Las 11 rutas de §2 más `login` y `platform/login` aplican su límite real con el bucket `global`; `refresh` queda en 60/min, `login` en 30/min y `platform/login` en 5/min por IP. La válvula `RATE_LIMIT_E2E_RELAXED` multiplica solo los límites de ruta y la API rechaza el arranque con ella en producción.

## 2. Estado de partida

Al abrir la sesión, el working tree ya contenía los cambios de L1 sin commit. Para no duplicar trabajo se auditó el diff contra §L1, se reprodujo el rojo de forma controlada (revirtiendo temporalmente los seis controladores a `default`, con parche de respaldo y restauración verificada) y se ejecutó la verificación completa. No se reescribió la implementación.

## 3. Archivos tocados

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/auth/auth.controller.ts` | `login` 30 (`:128`), `platform/login` 5 (`:175`), `refresh` 60 (`:239`), `change-password` 10 (`:504`), todos con clave `global` |
| `apps/api/src/modules/tenant/tenant.controller.ts` | `public-branding` 60 (`:174`), `me/branding/assets` 10 (`:331`), `POST /tenants` 10 (`:716`), `:id/branding/assets` 10 (`:849`) |
| `apps/api/src/modules/users/users.controller.ts` | `PATCH :id/login-email` 10 (`:390`) |
| `apps/api/src/modules/media/media.controller.ts` | `POST /media/upload` 20 (`:71`) |
| `apps/api/src/modules/privacy/evidence/privacy-evidence.controller.ts` | `POST /privacy/evidence` 20 (`:61`) |
| `apps/api/src/modules/platform-branding/platform-branding.controller.ts` | `GET public` 60 (`:56`), `POST assets` 10 (`:100`) |
| `apps/api/src/common/rate-limit-env.ts` | Nuevo: `RATE_LIMIT_E2E_RELAXED`, multiplicador x100, guarda de producción y `resolveRouteRateLimit` |
| `apps/api/src/common/rate-limit-env.spec.ts` | Nuevo: CA-6 |
| `apps/api/src/common/rate-limiting.http.spec.ts` | Nuevo: CA-1 a CA-4 con `ThrottlerGuard` real |
| `apps/api/src/common/throttle-names.architecture.spec.ts` | Nuevo: CA-5 |
| `apps/api/src/modules/auth/auth.controller.http.spec.ts` | Spec existente ampliado: prueba HTTP del límite de `login` |
| `apps/api/src/app.config.ts` | Regla Joi de `RATE_LIMIT_E2E_RELAXED` (`:185-192`) |
| `.env.example` | Documentación de la válvula (`:186-195`) |
| `.env.production.example` | `RATE_LIMIT_E2E_RELAXED=false` y advertencia (`:33-38`) |
| `e2e/playwright.api.config.ts` | `RATE_LIMIT_E2E_RELAXED=true` en el `webServer` (`:38`) |
| `scripts/e2e-provision-operational.mjs` | `RATE_LIMIT_E2E_RELAXED=true` al arrancar la API E2E (`:746`) |

No se tocaron `app.module.ts` (el throttler ya se llamaba `global`), `rate-limit-tracker.ts`, `trust proxy`, nginx, `DB_POOL_MAX` ni migraciones.

## 4. Salida del rojo

Reversión temporal de los seis controladores a `@Throttle({ default: ... })`, con parche guardado y restaurado en `finally`:

```text
● CA-1 — Cada ruta de §2 responde 429 al superar su limite (ThrottlerGuard real) › POST /auth/refresh (60, IP)
  expect(received).toBe(expected) // Object.is equality
  Expected: 429
  Received: 200
  at common/rate-limiting.http.spec.ts:516:30
Test Suites: 1 failed, 1 total
Tests:       1 failed, 14 skipped, 15 total
```

```text
● CA-5 — @Throttle/@SkipThrottle solo usan nombres definidos en ThrottlerModule
  expect(summary).toEqual([])
  at common/throttle-names.architecture.spec.ts:132:21
Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 total
```

Con `default`, el guard no consulta el metadato y la petición `limit+1` sigue en 200; la regla de arquitectura lista los nombres no definidos. Tras restaurar, ambos vuelven a verde.

## 5. Criterios de aceptación

| # | Criterio | Prueba | Resultado |
| --- | --- | --- | --- |
| CA-1 | Cada ruta de §2 responde 429 al superar su límite, con `ThrottlerGuard` real | `rate-limiting.http.spec.ts` (11 casos `it.each`) | **Verde**: 11/11. **Rojo reproducido** antes del cambio |
| CA-2 | `login` y `platform/login` responden 429 en el valor aprobado | `rate-limiting.http.spec.ts:523-561` + `auth.controller.http.spec.ts:468-540` | **Verde** |
| CA-3 | Una segunda IP no comparte bucket en rutas públicas | `rate-limiting.http.spec.ts:563-587` | **Verde** |
| CA-4 | Dos usuarios no comparten bucket en rutas autenticadas | `rate-limiting.http.spec.ts:589-617` | **Verde** |
| CA-5 | Regla de arquitectura contra nombres no definidos | `throttle-names.architecture.spec.ts` | **Verde**; **rojo reproducido** con `default` |
| CA-6 | La API no arranca con `RATE_LIMIT_E2E_RELAXED` en producción | `rate-limit-env.spec.ts` (5 casos) | **Verde** |
| CA-7 | `execution-orders-e2e` y suites E2E de API y portal con conteo real | Proveedor E2E | **Omitido por decisión del operador** (ver §8) |
| CA-8 | Suite completa de `@iwana/api` sin caché, `DB_NAME=test` | Unit + integración | **Parcial**: unitaria **477/477 suites, 6309/6309 tests**; integración **61/73 suites, 438/486 tests** verdes. Las 8 suites rojas son prerrequisito de tenants E2E ausentes, no L1 (ver §7) |

## 6. Specs existentes modificados

| Spec | Ajuste | Motivo |
| --- | --- | --- |
| `apps/api/src/modules/auth/auth.controller.http.spec.ts` | +76 líneas: `describe` nuevo con `ThrottlerModule` y `ThrottlerGuard` reales; 30×200 y 31.ª 429 | No existía ninguna prueba HTTP del límite de `login`; el paso de `default` a `global` y el valor 30 del G0 exigen una prueba con el guard real. No sustituye ni relaja ninguna expectativa previa |
| `apps/api/src/modules/configuration/configuration.controller.http.spec.ts` | +8/−2 sobre secciones de settings | **Fuera de alcance de L1** (pertenece a la ola de facturación/settings del working tree) |

## 7. Comandos y conteos reales

| Alcance | Comando | Suites | Tests | Skipped | Fecha |
| --- | --- | --- | --- | --- | --- |
| CA-1 a CA-6 | `pnpm --filter @iwana/api exec jest src/common/rate-limit-env.spec.ts src/common/throttle-names.architecture.spec.ts src/common/rate-limiting.http.spec.ts --runInBand` | 3 | 21 | 0 | 2026-11-06 |
| Controladores afectados | `... jest src/modules/auth/auth.controller.http.spec.ts src/modules/tenant/tenant.controller.http.spec.ts src/modules/users/users.controller.http.spec.ts --runInBand` | 3 | 62 | 0 | 2026-11-06 |
| Lint | `pnpm --filter @iwana/api lint` | — | — | — | 0 errores, 7 warnings preexistentes |
| Typecheck | `pnpm --filter @iwana/api typecheck` | — | — | — | limpio |
| Unit `@iwana/api` | `pnpm --filter @iwana/api exec jest` (sin caché, `testPathIgnorePatterns` excluye `*.postgres.integration.spec.ts`) | 477 | 6309 | 0 | 2026-11-06 |
| Integración `@iwana/api` | `jest --config jest.integration.config.js --runInBand` (postgres:18-alpine propio, `DB_NAME=test`) | 73 (61 verdes, 8 rojas, 4 skipped) | 486 (438 verdes, 25 rojas, 23 skipped) | 23 | 2026-11-06 |

**Lectura de la integración:** las 8 suites rojas fallan por prerrequisito de entorno, no por L1: `No existe el tenant de integración 'srqa-mod11-r5-20261006'` y `No existe el tenant ACTIVE indicado por E2E_TENANT_SLUG` (`wfm/tests/schedule-events.execution-order`, `tasks/tests/execution-orders.*`, `crm/subscribers/subscriber-rut-responsibilities`). Son specs que esperan tenants sembrados por el proveedor E2E; una base `postgres:18-alpine` recién migrada no los tiene. L1 no toca ninguno de esos módulos. El proceso Jest quedó vivo por handles abiertos tras imprimir el resumen y se terminó; el resumen ya estaba completo.

## 8. Omisiones declaradas

- **CA-7:** omitido por decisión del operador en esta sesión. Requiere el proveedor E2E completo (`scripts/e2e-provision-operational.mjs`: docker compose E2E, build de API/worker, siembra de tenants y specs de API/web/portal). El gate queda abierto hasta correrlo y entregar `E2E_PLAYWRIGHT_*` con conteo real. Mitigación parcial: la válvula `RATE_LIMIT_E2E_RELAXED` está conectada en `e2e/playwright.api.config.ts:38` y `scripts/e2e-provision-operational.mjs:746`, y las suites unitarias de CA-1 a CA-6 están verdes.
- **Cobertura:** L1 no fija umbral propio; se reporta el conteo de suites/tests, no porcentaje.

## 9. Revisiones de §R1

- `sec-eng`: **APROBADO CON CAMBIOS — no bloqueante**. Sin P0/P1. Confirma valores del G0, bucket `global`, doble rechazo en producción (Joi + helper), válvula inactiva por defecto y ausencia de PII/secretos/cross-tenant. Hallazgos:
  - **P2-1 (seguimiento antes de beta):** `login` y `platform/login` son `@Public()`, pero el tracker global mueve el bucket de `anonymous:ip` a `tenant:sub` si la petición trae un JWT de tenant válido (`rate-limit-tracker.ts:31-43`; marker en `tenant.middleware.ts:72-87`). Un usuario autenticado amplía el presupuesto por cada `sub` que pueda presentar. No lo introduce L1 (el tracker es anterior), pero antes los límites estaban inertes. Recomendación: `getTracker` por IP en las rutas públicas de auth y un caso en CA-2 con `Authorization` de tenant.
  - **P2-2:** la válvula solo se rechaza con `NODE_ENV=production` literal; `staging` la acepta con x100 (`rate-limit-env.ts:32`, `app.config.ts:185-192`). Defensa en profundidad, no incumple el G0.
  - **P3:** el «global 100/min» es por handler, no por cliente; `trust proxy`/XFF es correcto en producción pero residual si el API se expone directo; `reuseExistingServer: true` puede reutilizar un dev server sin la válvula y poner rojo CA-7 por la razón equivocada; comentarios imprecisos en `auth.controller.http.spec.ts:475-477` y `.env.example:192-193`; CA-1/CA-3/CA-4 usan un `tenantMiddleware` propio en vez del real.
- `test-change-reviewer`: **APROBADO CON CAMBIOS**. Sin regresiones ni expectativas relajadas. Hallazgos:
  - **F1 (P3, trazabilidad):** el `describe` «CA-8» de `auth.controller.http.spec.ts:468` prueba en realidad CA-2; §7 reserva CA-8 para la suite completa.
  - **F2 (P3):** `rate-limit-env.spec.ts:37-38` afirma `30 * RATE_LIMIT_E2E_MULTIPLIER`; un multiplicador `1` seguiría verde. La magnitud x100 no está fijada por el G0.
  - **F3 (P4):** comentario obsoleto en `auth.controller.ts:127` («CA-8 (11ª petición → 200)»), referido al límite anterior de 10.
  - **F4 (P4):** el nuevo CA-8 duplica CA-2 con un `ThrottlerModule` sin `getGlobalRateLimitTracker`.
  - **F5 (P4):** timeouts por caso de 60 s en `rate-limiting.http.spec.ts`; justificables por 60 peticiones secuenciales.
  - **F6 (P4):** CA-1 no confirma por HTTP el bucket IP de las rutas de plataforma; sí está cubierto a nivel unitario por `rate-limit-tracker.spec.ts`.
