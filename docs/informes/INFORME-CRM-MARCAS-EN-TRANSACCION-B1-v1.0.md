# Informe — CRM · marcas de privacidad en la transacción (B1)

**Versión:** 1.0
**Fecha:** 2026-11-06
**Bloque:** B1 de [PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md](../prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md)
**Spec:** [2026-11-06-crm-marcas-en-transaccion-spec.md](../specs/2026-11-06-crm-marcas-en-transaccion-spec.md)
**Plan:** [2026-11-06-crm-marcas-en-transaccion-orquestacion.md](../plans/2026-11-06-crm-marcas-en-transaccion-orquestacion.md)
**Evidencia:** [crm-marcas-en-transaccion-2026-11-06/](evidence/crm-marcas-en-transaccion-2026-11-06/)
**Ejecutor:** `sr-backend`. Rama `main`, sin commit.

---

## 1. Resultado en una línea

`activeMarks` y `hasActive` aceptan el `manager` del llamante, y las tres llamadas reales de CRM contratos (agenda, guarda y proyección) más la autorización contractual lo pasan. Con un pool de una sola conexión, agenda, listado, detalle, ficha 360°, alta y actualización responden sin pedir otra conexión (CA-1 rojo → verde).

## 2. Condición de entrada (gate del plan)

El gate **Entrada** del plan exige «MOD14 Fase 01 commiteado: `contracts.service.ts` hoy tiene cambios sin commitear». **No se cumple**: el árbol de trabajo sigue con cambios sin commitear de MOD14 (módulo `billing`, `contracts.service.ts` con RS-21/RS-22, migraciones 173–175, portal de facturación). Se ejecutó B1 por instrucción directa del encargo, sin commit. Queda declarado para AI-EM-ARCH; no se registra ningún gate.

## 3. Archivos tocados

### 3.1 Código de producción

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/privacy/ports/privacy-marks-read.port.ts:5-16` | `activeMarks(partyIds, ctx?: { manager })`; documenta que sin `ctx` la conducta no cambia |
| `apps/api/src/modules/privacy/ports/privacy-authorization-read.port.ts:4-26` | `hasActive(partyId, purpose, ctx?: { manager })`; el tipo de retorno pasa a `PrivacyAuthorizationState` (misma forma) |
| `apps/api/src/modules/privacy/marks/privacy-marks.adapter.ts:13-40` | con `ctx` usa ese manager; sin `ctx`, `withPrivacyTenant`; la lectura se extrae a `loadMarkRows(partyIds, manager)` (:62-70) y `loadMarkRowsByMark` (:72-80) |
| `apps/api/src/modules/privacy/authorizations/privacy-authorization.adapter.ts:25-37` | con `ctx` usa ese manager; sin `ctx`, `withPrivacyTenant`; la lectura se extrae a `loadAuthorizationState` (:58-86) |
| `apps/api/src/modules/crm/contracts/contracts.service.ts:607` | agenda de corte: `activeMarks(partyIds, { manager: qr.manager })` |
| `apps/api/src/modules/crm/contracts/contracts.service.ts:801-818` | `assertSubscriberNotBlocked(partyId, anonymizedAt, manager?)`; pasa `{ manager }` solo si existe |
| `apps/api/src/modules/crm/contracts/contracts.service.ts:1535-1552` | `requireContractualAuthorization(partyId, manager?)`; pasa `{ manager }` a `hasActive` |
| `apps/api/src/modules/crm/contracts/contracts.service.ts:177, 188, 282, 293, 871, 986, 1126, 1144, 1209, 1249, 1302, 1507, 1687` | las 13 llamadas dentro de `runInTenantSchema` (11 de la guarda + 2 de la autorización) pasan `qr.manager`; las de :839 y :843, fuera de transacción, siguen sin manager |
| `apps/api/src/modules/crm/contracts/contract-read-projection.ts:54-58` | `activeMarks(partyIds, { manager })` — cubre listado, detalle y ficha 360° |

No se consultó `party_privacy_marks` ni `data_authorizations` desde CRM: el acceso a esas tablas sigue dentro de los adaptadores de Privacy. No se movió ninguna lectura fuera de la transacción. No se tocó el catálogo comercial, `DB_POOL_MAX`, migraciones, OpenAPI ni otros módulos.

### 3.2 Pruebas nuevas

| Archivo | Contenido |
| --- | --- |
| `apps/api/src/modules/crm/contracts/tests/crm-privacy-marks-in-transaction.postgres.integration.spec.ts` | CA-1 (6), CA-2 (3), CA-3 (1), CA-4 (1): 11 tests contra PostgreSQL real |
| `apps/api/src/modules/privacy/marks/privacy-marks.adapter.ctx.spec.ts` | CA-5 para `activeMarks`: 3 tests |
| `apps/api/src/modules/privacy/authorizations/privacy-authorization.adapter.ctx.spec.ts` | CA-5 para `hasActive`: 3 tests |
| `apps/api/src/modules/crm/tests/crm-privacy-marks-tx.arch.spec.ts` | CA-6 con AST de TypeScript sobre `contracts.service.ts`, `contract-read-projection.ts` y `subscribers.service.ts`: 3 tests |

### 3.3 Specs existentes modificados

| Archivo:línea | Ajuste | Motivo |
| --- | --- | --- |
| `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts:999-1005` | tercer argumento añadido a un `toHaveBeenCalledWith` de `hasActive`: `expect.objectContaining({ manager: expect.anything() })` | Único ajuste admitido por §B1: el argumento nuevo. La expectativa de bloqueo (422 `CONTRACT_DATA_AUTHORIZATION_REQUIRED`) no cambia |
| `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts:2666` | segundo argumento `undefined` añadido a un `toHaveBeenCalledWith` de `activeMarks` | La guarda corre fuera de transacción en `assertContractNotBlocked` y no pasa manager; el argumento nuevo es `undefined`. La expectativa de resultado (sin 409) no cambia |

Ninguna expectativa de bloqueo o enmascarado se alteró. No hubo que ajustar ninguna otra suite.

## 4. Rojo de CA-1 (antes del cambio)

```text
  CRM · marcas de privacidad dentro de la transacción (PostgreSQL real)
    CA-1 · pool de una sola conexión
      × CA-1 · la agenda de corte responde sin pedir otra conexión (1525 ms)
      × CA-1 · el listado de contratos responde sin pedir otra conexión (1513 ms)
      × CA-1 · el detalle de contrato responde sin pedir otra conexión (1524 ms)
      × CA-1 · la ficha 360° responde sin pedir otra conexión (1514 ms)
      × CA-1 · el alta de contrato responde sin pedir otra conexión (1516 ms)
      × CA-1 · la actualización de contrato responde sin pedir otra conexión (1516 ms)

Test Suites: 1 failed, 1 total
Tests:       6 failed, 6 total
```

Causa en las seis: `timeout exceeded when trying to connect` (`pg-pool/index.js:224`), con `DataSource` de `max: 1` y `connectionTimeoutMillis: 1500`. Salida literal en `evidence/.../ca1-red.log`; el verde posterior, en `ca1-green.log`.

## 5. Matriz de criterios

| # | Prueba | Resultado |
| --- | --- | --- |
| CA-1 | `crm-privacy-marks-in-transaction.postgres.integration.spec.ts` — agenda, listado, detalle, ficha 360°, `create` y `update` con `max: 1` | **Rojo 6/6 → verde 6/6** |
| CA-2 | Mismo archivo — titular con `DATOS_BLOQUEADOS`: 409 `PRIVACY_DATA_BLOCKED`, lectura enmascarada (`alias: 'Datos bloqueados'`) y auditoría con `blockedServed: 1` | **3/3 verdes** |
| CA-3 | Mismo archivo — puerto de marcas que falla: la mutación se revierte y no queda fila (`COUNT = 0`) | **1/1 verde** |
| CA-4 | Mismo archivo — 20 listados simultáneos con pool de 10: 20 respuestas, 0 errores | **1/1 verde** |
| CA-5 | `privacy-marks.adapter.ctx.spec.ts` y `privacy-authorization.adapter.ctx.spec.ts` — con `ctx` usa el manager y no llama a `createQueryRunner` ni a `withPrivacyTenant`; sin `ctx` sigue igual | **6/6 verdes** |
| CA-6 | `crm-privacy-marks-tx.arch.spec.ts` — AST: ninguna llamada a `activeMarks` o `hasActive` dentro de `runInTenantSchema` sin manager; la proyección y la ficha 360° reciben `manager` | **3/3 verdes**; se comprobó que no pasa por vacuidad: al retirar el `ctx` de la agenda el test lo reporta en `contracts.service.ts:607` (log `ca6-red-proof.log`) |
| CA-7 | Ver §6 | **472/6.274 unitarias y 68/72 suites de integración (4 omitidas declaradas), 0 fallos**; `privacy/**` 95,88 % statements / 86,14 % branches (base 94,61 % / 82,73 %) |

## 6. Evidencia de ejecución (sin caché)

| Paquete | Comando | Suites | Tests | Omitidos | Cobertura |
| --- | --- | --- | --- | --- | --- |
| `@iwana/api` unitaria | `pnpm --filter @iwana/api exec jest` | 472/472 | 6.274 aprobados, 0 fallidos | 0 | — |
| `@iwana/api` integración | `E2E_TENANT_SLUG=test IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/api exec jest --config jest.integration.config.js --forceExit` | 68 aprobadas + 4 omitidas de 72 | 453 aprobados, 23 omitidos, 0 fallidos | 4 suites (ver §6.2) | — |
| `@iwana/api` `privacy/**` | `jest --coverage --collectCoverageFrom='modules/privacy/**/*.ts'` | 472/472 | 6.274 | 0 | statements 1.395/1.455 = **95,88 %**; branches 379/440 = **86,14 %**; functions 205/223 = 91,93 %; lines 1.273/1.321 = 96,37 % |
| Typecheck | `pnpm --filter @iwana/api typecheck` | — | — | — | exit 0 |
| Lint | `pnpm --filter @iwana/api lint` | — | — | — | exit 0; 0 errores, 7 warnings preexistentes |
| Auditoría | `pnpm audit --audit-level=critical` | — | — | — | exit 0; 0 críticas (4 low, 15 moderate, 12 high preexistentes) |

### 6.1 Entorno

`postgres:18-alpine` propio (`iwana_crm_marks_pg18`, `127.0.0.1:55432`), base `test`, migraciones públicas y del tenant `test` aplicadas, roles least-privilege creados con `scripts/db/apply-least-privilege.sql`. Nunca se usó `dbiw` ni `tenant_iwana`; la spec de integración aborta si `DB_NAME` no es `test`, `dbiw` o `iwana_it_*`.

### 6.2 Omisiones declaradas de integración (4 suites, 23 tests)

Son exactamente las cuatro de `apps/api/integration-expected-skips.json`: `reencrypt-aes.pii` (requiere `IWANA_K2_REENCRYPT_INTEGRATION`), `inventory-execution-request.ola3d` (base `i4_qa_20261006_a1` y Redis DB 15), `network-execution-event` (Redis real) y `execution-orders.item-usage-projection` (base sintética compartida). No se añadió ninguna omisión nueva.

### 6.3 Primera corrida de integración: fallos de entorno, no de B1

La primera corrida (sin `E2E_TENANT_SLUG` y sin roles least-privilege) dio 9 suites y 33 tests en rojo. Los cuatro mensajes agregados fueron: «rol app iwana_app ausente» (8), «No existe el tenant de integración 'srqa-mod11-r5-20261006'» (19), «No existe el tenant indicado para integración MOD11» (4) y «No existe el tenant ACTIVE indicado por E2E_TENANT_SLUG» (2). Todos son precondiciones de base ausentes en una base `test` recién creada y fallan en `beforeAll`, antes de tocar código de B1. Repetida con el entorno del job de CI (`E2E_TENANT_SLUG=test`, roles least-privilege, tenant `test` migrado): 0 fallos. Logs en `integration-full.log` y `integration-full-ci-env.log`.

## 7. Observaciones para las revisiones

- **Acoplamiento de transacción:** Privacy lee dentro de la transacción de CRM cuando recibe `ctx`. Si su lectura falla, la transacción del llamante se revierte (CA-3). Es la decisión D1/D2 de la spec, no una desviación.
- **`ctx` confía en el llamante:** el adaptador no valida el tenant del `manager` recibido. El único vector es código interno que pase un manager ajeno; los llamantes actuales pasan su propio `qr.manager` de `runInTenantSchema`.
- **La guarda sigue sin serializarse con la apertura de marcas** (§5 de la spec, fuera de alcance). B1 no cambia esa ventana.
- **`assertSubscriberNotBlocked` mantiene dos formas de llamada** (con y sin manager). La segunda abre su propia conexión y solo se usa fuera de transacción (`assertContractNotBlocked`, `assertSubscriberNotBlockedForMutation`).

## 8. Veredicto del ejecutor

B1 entregado: CA-1 a CA-7 con evidencia propia, 0 fallos en unitarias e integración, `privacy/**` por encima de su base y de 80 %. El gate **Entrada** del plan sigue abierto (§2) y las cuatro revisiones de R1 no las firma el ejecutor.
