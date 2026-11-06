# Informe — CRM · marcas de privacidad en la transacción (B1-R)

**Versión:** 1.0
**Fecha:** 2026-11-06
**Bloque:** §B1-R de [PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md](../prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md)
**Spec:** [2026-11-06-crm-marcas-en-transaccion-spec.md](../specs/2026-11-06-crm-marcas-en-transaccion-spec.md), §4 de [2026-11-06-transacciones-conexiones-y-efectos-spec.md](../specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md)
**Plan:** [2026-11-06-crm-marcas-en-transaccion-orquestacion.md](../plans/2026-11-06-crm-marcas-en-transaccion-orquestacion.md)
**Evidencia:** [crm-marcas-en-transaccion-2026-11-06/](evidence/crm-marcas-en-transaccion-2026-11-06/)
**Ejecutor:** `sr-backend`. Rama `main`, sin commit.

---

## 1. Resultado en una línea

B1-R queda verificado: CA-3 ahora prueba el rollback con sonda dentro de la transacción (alta y mutación) y `PLAN_UNAVAILABLE` ante `22P02` en la misma conexión; D3 (catálogo `getPlanById`/`createSnapshot` y media `findOne` con `ctx`) funciona en verde con adaptador real y queda cubierto por CA-1 ampliada, CA-5 y CA-6. La suite completa de `@iwana/api` sigue bloqueada por cambios paralelos sin commitear ajenos a B1-R (ola Auth y deriva de integración en tasks/wfm).

## 2. Estado al entrar (sin cambios de producción en esta sesión)

El árbol ya contenía D3 implementado en producción (sin commit, en `main`):
`CommercialCatalogReadPort.getPlanById`/`createSnapshot` con `ctx?: { manager }`, `CommercialCatalogReadAdapter.loadPlanById`/`loadSnapshot` sobre el manager recibido, `MediaService.findOne` con `ctx`, y `ContractsService` pasando `qr.manager` en `changePlan`, `_resolveVatSnapshot` (6 sitios) y `_hasVerifiedStratumEvidence`. La spec de integración ya contenía CA-3 reescrito (doble que deja pasar la primera llamada y falla en la segunda, sonda dentro de la tx) y CA-1 ampliada (`changePlan` con catálogo real y `updateServicePoint` con evidencia). Esta sesión no cambió código de producción neto; sus parches rojos fueron temporales y se restauraron.

## 3. Archivos tocados en esta sesión

### 3.1 Specs existentes modificados (único ajuste admitido: argumento nuevo en `toHaveBeenCalledWith`)

| Archivo:línea | Ajuste | Motivo |
| --- | --- | --- |
| `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts:1964` | Cuarto argumento `expect.objectContaining({ manager: expect.anything() })` a `getPlanById` | D3: `activate`/`_resolveVatSnapshot` ya pasa la tx. La expectativa de IVA no cambia |
| `apps/api/src/modules/crm/contracts/tests/contract-plan-change.service.spec.ts:127` y `:154` | Quinto argumento con manager a `createSnapshot` (SOHO y CORPORATE) | D3: `changePlan` ya pasa la tx. Segmento, snapshot e IVA no cambian |
| `apps/api/src/modules/crm/contracts/tests/contract-plan-change.postgres.integration.spec.ts:251` | Quinto argumento con manager a `createSnapshot` | Mismo ajuste en la suite de integración con mocks |

### 3.2 Pruebas nuevas o ampliadas

| Archivo | Contenido |
| --- | --- |
| `apps/api/src/modules/crm/tests/crm-privacy-marks-tx.arch.spec.ts` | CA-6 extendida a D3: `TRANSACTIONAL_RULES` suma `getPlanById` (arg 3), `createSnapshot` (arg 4) y `_resolveVatSnapshot` (arg 2), con mínimos ≥2/≥1/≥5 dentro de `runInTenantSchema`; nuevo test `toda lectura de catálogo y media... (D3)` (filtra `findOne` a `mediaService`) y nuevo test `las ayudas de IVA y estrato pasan el manager a catálogo y media (D3)` (toda `getPlanById` de `commercialCatalogPort` ≥3 y todo `mediaService.findOne` ≥1 con manager) |
| `apps/api/src/modules/commercial/ports/commercial-catalog-read.adapter.ctx.spec.ts` | CA-5 para catálogo: 4 tests — `getPlanById` con `ctx` usa el manager y no llama a `runInTenantSchema`; sin `ctx` conserva `runInTenantSchema`; ídem `createSnapshot` |
| `apps/api/src/modules/media/media.service.ctx.spec.ts` | CA-5 para media: 2 tests — `findOne` con `ctx` usa `manager.getRepository` y no el repositorio propio; sin `ctx` conserva el propio |

### 3.3 Logs de evidencia nuevos

| Archivo | Contenido |
| --- | --- |
| `docs/informes/evidence/crm-marcas-en-transaccion-2026-11-06/b1r-red-fresco-ca1.log` | Rojo CA-1/D3 al quitar `ctx` del catálogo/media en el servicio |
| `docs/informes/evidence/crm-marcas-en-transaccion-2026-11-06/b1r-red-fresco-ca3.log` | Rojo CA-3 al volver al doble débil que falla siempre |
| `docs/informes/evidence/crm-marcas-en-transaccion-2026-11-06/b1r-green-fresco-ca1.log` | Verde completo CA-1 a CA-4 (15/15) |
| `docs/informes/evidence/crm-marcas-en-transaccion-2026-11-06/b1r-unit-full.log` | Unitarias completas sin caché (ver §6) |
| `docs/informes/evidence/crm-marcas-en-transaccion-2026-11-06/b1r-integration-full.log` | Integración completa sin caché (ver §6) |
| `docs/informes/evidence/crm-marcas-en-transaccion-2026-11-06/b1r-coverage-privacy.log` | Cobertura `privacy/**` (ver §6) |

No se tocaron `DB_POOL_MAX`, migraciones, OpenAPI, otros consumidores del catálogo o de media, ni tablas ajenas. No se movió ninguna lectura fuera de la transacción.

## 4. Rojos frescos (antes del cambio, en esta sesión)

### 4.1 CA-1 ampliada de D3

Se quitó temporalmente `{ manager: qr.manager }` de las llamadas de catálogo/media en `ContractsService` (los adaptadores con `ctx` opcional abren su propia transacción, como antes). Con `DataSource` de `max: 1` y `connectionTimeoutMillis: 1500`:

```text
  CRM · marcas de privacidad dentro de la transacción (PostgreSQL real)
    CA-1 · pool de una sola conexión
      √ CA-1 · la agenda de corte responde sin pedir otra conexión (24 ms)
      √ CA-1 · el listado de contratos responde sin pedir otra conexión (14 ms)
      √ CA-1 · el detalle de contrato responde sin pedir otra conexión (8 ms)
      √ CA-1 · la ficha 360° responde sin pedir otra conexión (25 ms)
      √ CA-1 · el alta de contrato responde sin pedir otra conexión (32 ms)
      × CA-1 · el cambio de plan responde sin pedir otra conexión (catálogo real) (1553 ms)
      × CA-1 · el punto de servicio con evidencia de estrato responde sin pedir otra conexión (1565 ms)
      √ CA-1 · la actualización de contrato responde sin pedir otra conexión (22 ms)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 13 passed, 15 total
```

Causa en las dos: `timeout exceeded when trying to connect` (`pg-pool/index.js:224`). Salida literal en `b1r-red-fresco-ca1.log`. Tras restaurar, verde 15/15 en `b1r-green-fresco-ca1.log`.

### 4.2 CA-3 con el doble débil de B1

Se sustituyó temporalmente `if (calls >= 2)` por `if (calls >= 1)` (falla siempre, como en B1: la guarda falla antes del `save`). Con la sonda nueva dentro de la transacción, las dos pruebas rojas`:

```text
    CA-3 · el fallo de la proyección revierte la escritura ya hecha
      × CA-3 · el alta: la proyección falla después del save y no queda fila nueva (61 ms)
      × CA-3 · la mutación: la proyección falla después del save y el contrato no cambia (15 ms)

    - Expected  - 1
    + Received  + 1
      Array [ Object { - "total": 1, + "total": 0 } ]
    - "alias": "Alias que debe revertirse", + "alias": "Servicio sintético de integración"

Test Suites: 1 failed, 1 total
Tests:       2 failed, 12 skipped, 1 passed, 15 total
```

La sonda queda en 0 (alta) y en el alias viejo (mutación): el doble débil nunca llegó al `save`, así que el `COUNT = 0` de B1 pasaba sin haber probado rollback. Con el doble corregido (`calls >= 2`) la sonda ve 1 / el alias nuevo dentro de la transacción y el rollback lo deshace: verde 2/2. Salida literal en `b1r-red-fresco-ca3.log`.

## 5. Matriz de criterios

| # | Prueba | Resultado |
| --- | --- | --- |
| CA-1 | `crm-privacy-marks-in-transaction.postgres.integration.spec.ts` — agenda, listado, detalle, ficha 360°, `create`, `changePlan` (catálogo real), `updateServicePoint` (estrato con evidencia), `update` con `max: 1` | **Rojo 2/15 → verde 15/15** |
| CA-2 | Mismo archivo — titular con `DATOS_BLOQUEADOS`: 409 `PRIVACY_DATA_BLOCKED`, enmascarado y `blockedServed: 1` | **3/3 verdes** (heredado de B1, sin cambios de expectativa) |
| CA-3 | Mismo archivo — doble que falla en la segunda llamada (proyección tras `save`): `probed` [{total:1}] y `COUNT = 0` final; mutación con `probed` alias nuevo y alias persistido distinto; `PLAN_UNAVAILABLE` ante `22P02` con la misma conexión (sin `25P02`, contrato y `updatedAt` intactos) | **3/3 verdes**; rojo 2/3 con el doble débil (ver §4.2) |
| CA-4 | Mismo archivo — 20 listados simultáneos con pool de 10 | **1/1 verde** |
| CA-5 | `privacy-marks.adapter.ctx.spec.ts` (3, B1), `privacy-authorization.adapter.ctx.spec.ts` (3, B1), `commercial-catalog-read.adapter.ctx.spec.ts` (**4, nuevo**), `media.service.ctx.spec.ts` (**2, nuevo**) | **12/12 verdes** |
| CA-6 | `crm-privacy-marks-tx.arch.spec.ts` — AST: ninguna llamada a `activeMarks`/`hasActive`/`getPlanById`/`createSnapshot`/`_resolveVatSnapshot` dentro de `runInTenantSchema` sin manager; ayudas reenvían manager | **5/5 verdes** (antes 3; 2 nuevos de D3) |
| CA-7 | Ver §6 | **Parcial**: acotado de B1-R verde; suite completa bloqueada por paralelos ajenos |

## 6. Evidencia de ejecución (sin caché)

| Paquete | Comando | Suites | Tests | Omitidos | Cobertura |
| --- | --- | --- | --- | --- | --- |
| `@iwana/api` integración acotada B1-R | `jest --config jest.integration.config.js --runTestsByPath src/modules/crm/contracts/tests/crm-privacy-marks-in-transaction.postgres.integration.spec.ts --forceExit` (`DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=test E2E_TENANT_SLUG=test`) | 1/1 | **15 aprobados, 0 fallidos** | 0 | — |
| `@iwana/api` `contract-plan-change` | `jest --config jest.integration.config.js --runTestsByPath src/modules/crm/contracts/tests/contract-plan-change.postgres.integration.spec.ts --forceExit` | 1/1 | **47 aprobados, 0 fallidos** | 0 | — |
| `@iwana/api` unitaria acotada | `jest crm-privacy-marks-tx.arch.spec`, `commercial-catalog-read.adapter.ctx.spec.ts`, `media.service.ctx.spec.ts`, `contract-plan-change.service.spec.ts`, `contracts.service.spec.ts` | 5/5 | **5 + 4 + 2 + 18 + 119 = 148 aprobados, 0 fallidos** | 0 | — |
| `@iwana/api` unitaria completa | `pnpm --filter @iwana/api exec jest` | 473/474 | **6.283 aprobados, 1 fallido** | 0 | — |
| `@iwana/api` integración completa | `E2E_TENANT_SLUG=test pnpm --filter @iwana/api exec jest --config jest.integration.config.js --forceExit` | 60/73 (4 omitidas, 9 fallidas) | **437 aprobados, 26 fallidos, 23 omitidos** | 4 suites | — |
| `@iwana/api` `privacy/**` | `jest src/modules/privacy --coverage --collectCoverageFrom='modules/privacy/**/*.ts'` | 37/37 | **192 aprobados** | 0 | Ver §6.3 |
| Typecheck | `pnpm --filter @iwana/api typecheck` | — | — | — | exit 0 |
| Lint | `pnpm --filter @iwana/api lint` | — | — | — | exit 0; 0 errores, 10 warnings preexistentes |

### 6.1 Entorno

`postgres:18-alpine` propio (`iwana_crm_marks_pg18`, `127.0.0.1:55432`), base `test`, tenant `test` activo, roles least-privilege creados (`iwana`, `iwana_app`, `iwana_migrator`). Nunca se usó `tenant_iwana`. La spec aborta si `DB_NAME` no es `test`/`dbiw`/`iwana_it_*`.

### 6.2 Omisiones declaradas y fallos ajenos (no de B1-R)

- Unitario: 1 suite / 1 test fallido ajeno en `src/modules/auth/auth.controller.http.spec.ts` — `POST /api/v1/auth/login — límite de intentos (CA-8) › responde 429 al superar el límite aprobado (10/min)`: `expected 429, got 200`. La causa es el cambio paralelo sin commitear de Ola A: `AuthController.login` declara `@Throttle({ default: { ttl: 60000, limit: 10 } })` mientras el spec levanta `ThrottlerModule.forRoot([{ name: 'global', ttl: 60000, limit: 100 }])` con el guard real; el nombre `default` no coincide con `global`, así que la regla de 10/min no se aplica y la 11ª pasa (100/min). Este archivo no lo tocó B1-R (no está entre los archivos tocados de esta sesión y el fallo es independiente de `ctx`/catálogo/media). Se reporta para AI-EM-ARCH; no se corrigió por estar fuera de alcance.
- Integración: 9 suites / 26 tests fallidos ajenos, por deriva de esquema o precondiciones de base desactualizada respecto al árbol sin commitear (no timeouts ni marcas): `auth-login-lockout` (ola Auth), `execution-orders.*` (5 suites: `annulment`, `assign-persistence`, `origin-identity`, `close-by-result`, `dispatch`, `postgres` — esquema E1 incompleto de `execution_orders`), `schedule-events.execution-order` (wfm), y `subscriber-rut-responsibilities` (`relation "party" does not exist`). Ninguno toca `crm/contracts`, catálogo comercial ni media. Las 4 suites omitidas son las de `integration-expected-skips.json` (sin omisión nueva). Logs en `b1r-integration-full.log`.
- Cero PII en código, tests o esta evidencia (fixtures sintéticos, correos `*.example.invalid`, claves hex sintéticas).

### 6.3 Cobertura de `privacy/**`

La producción de `privacy/**` no cambió en B1-R (D3 toca `commercial/**` y `media/**`). La base vigente sigue siendo la de B1: `coverage-summary.json` declara `statements 1.395/1.455 = 95,88 %`, `branches 379/440 = 86,14 %`, `functions 205/223 = 91,93 %`, `lines 1.273/1.321 = 96,37 %`, por encima de 80 %. La corrida acotada de `src/modules/privacy` (37 suites, 192 tests) pasa y los adaptadores de marcas/autorización mantienen su cobertura con los specs `*.ctx.spec.ts` de B1; los nuevos specs `*.ctx.spec.ts` de catálogo/media son unitarios sobre esos adaptadores y no alteran `privacy/**`.

## 7. Observaciones para las revisiones

- **Acoplamiento de transacción:** igual que en B1. Si la lectura de catálogo/media falla dentro de la transacción, esta se revierte (CA-3). La lectura de `22P02` de `changePlan` queda cubierta: la transacción queda abortada al usar la misma conexión, pero al relanzarse como `PLAN_UNAVAILABLE` sin otra consulta no se ejecuta `25P02` (prueba CA-3).
- **`ctx` confía en el llamante:** el adaptador no valida el tenant del `manager` recibido. Los llamantes actuales pasan su propio `qr.manager` de `runInTenantSchema`. Otros consumidores del catálogo y de media siguen sin `ctx` (transacción propia, como antes).
- **Spec existente modificado:** los tres ajustes de `toHaveBeenCalledWith` añaden solo el argumento `{ manager }` nuevo; ninguna expectativa de IVA, segmento, plan ni auditoría cambió. `test-change-reviewer` debe clasificarlos como regla nueva explícita (D3).
- **Gate del plan:** el gate **Entrada** (MOD14 Fase 01 commiteado) sigue abierto: el árbol mantiene cambios sin commitear de MOD14/billing además de los de B1/B1-R y Ola A. No se registró ningún gate.

## 8. Veredicto del ejecutor

B1-R entregado en `main`, sin commit: CA-1 ampliada (catálogo real + estrato) rojo → verde, CA-3 que sí prueba el rollback (alta y mutación) más `PLAN_UNAVAILABLE` en la misma conexión, CA-5 de catálogo/media y CA-6 extendida a D3, todo con adaptadores reales. CA-7 completo queda abierto por 1 fallo unitario y 9 suites de integración ajenos a B1-R (ola Auth y deriva de esquema), declarados arriba.
