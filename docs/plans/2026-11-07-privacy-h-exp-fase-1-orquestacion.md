# Plan de orquestación — `privacy` · H-EXP Fase 1 · Anonimizar al vencer la retención

**Versión:** 1.0
**Estado:** G0 del CTO el 2026-11-07 (spec §10, puntos 1 a 4, y ADR-105). **No se lanza hasta cerrar R1 de G7** (P2)
**Fecha:** 2026-11-07
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-07-privacy-h-exp-retencion-spec.md](../specs/2026-11-07-privacy-h-exp-retencion-spec.md) v1.1 · **ADR:** ADR-104, ADR-105 · **Lanzador:** [PROMPT-PRIVACY-H-EXP-FASE-1-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-LAUNCH-v1.0.md)

La Fase 1 cierra el bloqueo de G7. La Fase 2 (autorizaciones y borrado físico en Media) se planifica aparte, antes del primer vencimiento posible de una autorización.

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-07 |
| --- | --- | --- |
| P1 | G0 de la spec §10, puntos 1 a 4, y de ADR-105 | ✅ 2026-11-07 |
| P2 | R1 de G7 cerrada: MOD14 sin U+FFFD y con integración verde | Pendiente ([lanzador R1](../prompts/PROMPT-PRIVACY-G7-CORRECCIONES-R1-LAUNCH-v1.0.md)). **Bloquea B1**: comparten `requests.service.ts` y el manifiesto |
| P3 | CI de `main` en verde | `9219bbed` en verde (CI 42430741410). Se comprueba al lanzar |
| P4 | Número de migración tenant libre | Se comprueba al lanzar |

### 1.1 Línea base de pruebas y precondiciones al lanzar (B1+B2, 2026-11-08)

SHA `efd52e2b`, CI de `main` en verde (CI 42481194966 + E2E 42481195028).

- P2 **cerrada**: G6.5 de R1 y G6 de R2 registrados en el plan G7 (§6.3). `requests.service.ts` sin diff; el manifiesto trae diff ajeno de H-1 (4 entradas de `privacy_erasure_mutation_log`, conteo 708) en región distinta a la de H-EXP: no bloquea, los conteos se actualizan en cadena 708 → 714.
- P3 **cerrada** (CI 42481194966). P4: libre el **179** (178 ocupada por H-1 sin commitear).

| Paquete           | Comando     | Suites | Tests | Skipped |
| ----------------- | ----------- | ------ | ----- | ------- |
| `@iwana/shared`   | `exec jest` | 31     | 488   | 0       |
| `@iwana/db` unit  | `exec jest` | 78     | 426   | 0       |
| `@iwana/api` unit | `exec jest` | 484    | 6401  | 0       |

### 1.2 G2 de B1+B2 (AI-EM-ARCH, 2026-11-08)

**G2 ✅.** Verificado sobre HEAD `49e8448f` más el diff sin commit, contra `postgres:18-alpine` desechable con la configuración de CI (`DB_NAME=test`, roles de menor privilegio, `tenant_test` aprovisionado):

| Corrida | Resultado |
| --- | --- |
| Unitarias sin caché | shared 32/491 · db 78/426 · api 488/6427 · 0 omitidas |
| Integración `@iwana/db` | 55/172 en 178 s (incluye 146, 172 y 179 arriba y abajo) |
| Integración `@iwana/api` | 77 suites / 531 tests en 262 s; 3 omitidas = `integration-expected-skips.json`; K2 5/5 con `GITHUB_ACTIONS=true`, como en CI |

Runner con 178 → 179 en orden; manifiesto 714 = cobertura en vivo; la prueba 172 CA-DO-06 queda fija en sus 4 tipos y la paridad en la punta pasa a la 179 (ajuste exigido, no oculta regresión).

Hallazgos para B3 y B4 (no bloquean G2):

| # | Sev. | Hallazgo | Dueño |
| --- | --- | --- | --- |
| H1 | Medio | La 179 deja que cualquier rol con `UPDATE` anule `data_subject_request_events.reason` sin que la solicitud esté en minimización: el trigger append-only de la 146 deja de ser absoluto para esa columna | `sec-eng` en B4; B3 prueba un `UPDATE` fuera de la minimización |
| H2 | Bajo | Igual con `requester_evidence_media_id` → `NULL` en el trigger de identidad | `sec-eng` en B4 |
| H3 | Bajo | `pqr-retention-read.adapter.ts`: cualquier plazo PQR sin notificar ni resolver (no solo el recurso) retiene para siempre. Falla cerrado, pero puede no vencer nunca | B3 con un canario |
| H4 | Proceso | El ejecutor usó `git stash` para probar el rojo; la regla lo prohíbe. `git stash list` queda vacío | Registrado |

### 1.3 B2-R · corrección de H1 y H2 antes de B3 (decisión del CTO, 2026-11-08)

La 179 no está publicada: se corrige en el mismo archivo, sin migración nueva. [Lanzador B2-R](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-B2R-LAUNCH-v1.0.md).

| # | Regla en PostgreSQL | Cierra |
| --- | --- | --- |
| R1 | `reason` → `NULL` en `data_subject_request_events` solo si la solicitud ya tiene `minimized_at` y el motivo no es un código protegido (`RESOLVE`, `TRASLADO`, `DESISTIMIENTO`, `PRORROGA`, `REAPERTURA`, `TAREA_COMPLETADA:%`). La lista cerrada pasa del servicio al trigger | H1 |
| R2 | `requester_evidence_media_id` → `NULL` solo en la misma actualización que fija `minimized_at` o sobre una fila ya minimizada | H2 |
| R3 | `minimized_at` es monótono (no se cambia ni se anula) y solo se fija con estado terminal (`RESUELTA`, `NO_PROCEDENTE`, `TRASLADADA`, `DESISTIDA`) | Que R1 y R2 no se abran fijando `minimized_at` a mano en una solicitud viva |
| R4 | En una fila minimizada, las columnas minimizadas solo cambian hacia `NULL` | Que no se reintroduzcan datos |

Funciones con `search_path = pg_catalog, pg_temp` y consulta calificada con `TG_TABLE_SCHEMA`, como en la 178 (B1-R3). Residual para B4: un rol con `UPDATE` aún puede minimizar antes de tiempo una solicitud terminal; queda auditado y lo valora `sec-eng`.

**G2 de B2-R ✅ (AI-EM-ARCH, 2026-11-08).** Contra `postgres:18-alpine` desechable como CI: `@iwana/db` 55/176 en 61 s (+4 R1–R4, 0 bajas; 146 y 179 en verde); `@iwana/api` 77 suites / 531 tests en 235 s, 3 omitidas = `integration-expected-skips.json`, K2 5/5 con `GITHUB_ACTIONS=true`. Los dos casos de la spec 179 que se ajustaron fijaban el hueco de H1 y H2: eran de la misma ola sin publicar y el ajuste lo exige la regla nueva.

Para B4 (Bajo, no bloquean): R4 no cubre `transferred_to`, `transfer_destination_*`, `suspended_contract_ids` ni `disputed_contract_ids`, ni impide reabrir una solicitud minimizada; `TRUNCATE` evade los triggers de fila de la 146 y la 179 (la 178 ya puso guardia `BEFORE TRUNCATE` en su bitácora). El ejecutor cambió el dueño de funciones trigger en la base local `test` a `iwana_migrator`; no afecta a CI.

### 1.4 B3 y G3 (AI-EM-ARCH, 2026-11-08)

**G3 ⛔.** La suite nueva `retention-expiry-b3.postgres.integration.spec.ts` (sin cambios de producción) cubre CA-EXP-01 a 09 y 12 a 16. Reproducido como CI: `@iwana/db` 55/176 en 73 s; `@iwana/api` 78 suites / 566 tests (546 verdes, 19 omitidas, 1 roja) en 426 s, omitidas = `integration-expected-skips.json`, K2 5/5. La roja es real: **CA-EXP-12 positivo** — `processProspecto` pasa un objetivo sin `partyId` ni HMAC, `resolve()` del adaptador CRM (`crm-personal-data-erasure.adapter.ts:338`) no deriva candidatos y `sameSet` (`:167`) lanza; todo prospecto vencido termina en `PARTICIPANT_ERROR`. La integración de la API ya dura 7 min de los 10 del paso de CI.

H3 documentado por B3: cualquier plazo PQR sin notificar ni resolver retiene hasta que se notifique o resuelva; no es retención incondicional. Se acepta como fallo cerrado.

Corrección [B2-R2](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-B2R2-LAUNCH-v1.0.md): alcance explícito del prospecto en el puerto de supresión (sin ampliar por HMAC, revalidado con `FOR UPDATE`) y `reason_code` durable en el ledger, también para `MISSING_POLICY` y excepciones dentro del `SAVEPOINT` (hallazgo 2 de B3). Tras B2-R2, AI-EM-ARCH vuelve a correr la suite B3 completa para G3.

**G3 ✅ (AI-EM-ARCH, 2026-11-08, tras B2-R2).** Como CI: unitarias api 488/6431 sin caché (+4); `@iwana/db` 55/176 en 56 s; `@iwana/api` 79 suites / 568 tests, 0 rojas, 19 omitidas (3 suites = `integration-expected-skips.json`) en 265 s; B3 16/16 con CA-EXP-12 sin tocar su aserción; adaptador de prospecto 2/2; manifiesto 715 = cobertura 6/6. `resolveProspectScope` revalida con `FOR UPDATE` y no amplía por HMAC; la API y `anonymize-titular` siguen intactos.

Para B4: `test-change-reviewer` valora B3-04 (de `[]` a fila `ATTENTION_REQUIRED`/`MISSING_POLICY`) y el reordenamiento de CA-EXP-12 por fuga de fixture entre casos; `sec-eng` valora que el prospecto se suprime aunque tenga `consent_records`, `visit_requests` o `service_provisionings` enlazados (participantes por `expedienteIds`). Flaky ajeno visto por el ejecutor: `report-subscriber-phone-readiness` con slug de 8 dígitos frente a `/\d{7,}/`.

### 1.5 B4 y G6 (AI-EM-ARCH, 2026-11-08)

**G6 ⛔.** Hallazgos verificados en el código:

| # | Sev. | Hallazgo | Decisión |
| --- | --- | --- | --- |
| P1 | Alta | Reloj contractual ausente = fallo abierto: contratos terminados sin `terminated_at` dan `lastTerminatedAt: null` (`crm-contract-standing-read.adapter.ts:60`) y `clock()` devuelve `null` (`conservation-duty.service.ts:129`), sin deber. Igual con documentos fiscales `EMITIDO`/`ANULADO` sin `issue_date` (`billing-standing-read.adapter.ts:22`). Contradice D-EXP-1 | Corregir en B2-R3 |
| B1 | Bloqueante | `retention-expiry.service.ts:346-350` y `:804-806` leen y bloquean `expediente_records` (CRM) por SQL directo | Corregir en B2-R3: vía puerto CRM |
| P2a | Media | R4 sin `transferred_to`, `transfer_destination_*`, `suspended_contract_ids`, `disputed_contract_ids` ni `status` | Corregir en B2-R3 |
| P2b | Media | Tablas de la 179 y de solicitudes sin guardia `TRUNCATE`; la 178 sí la tiene | Corregir en B2-R3 |
| P3 | Baja | `request_id` ficticio en el ledger del prospecto | Corregir en B2-R3 (`NULL`) |
| P3 | Baja | El preview del CLI imprime UUID técnicos; cobertura pgAudit sin verificar | Runbook en B5 |
| A22 | — | `reject(SOLICITANTE_NO_LEGITIMADO)` y `transfer` sin identidad verificada | **Preexistente en HEAD** (`requests.service.ts:905`); H-EXP solo añade `closed_at`. Rechazar por falta de legitimación implica no tener identidad; trasladar no la exige. Fuera de alcance, sin cambio |
| Obs. | — | OpenAPI `note maxLength:1000` frente a 120 real | Fuera de alcance |

contract-drift sin deriva. gate-verifier parcial; se repite completo tras B2-R3. [Lanzador B2-R3](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-B2R3-LAUNCH-v1.0.md).

### 1.6 G2 de B2-R3 (AI-EM-ARCH, 2026-11-08)

**G2 ⛔ por P1 residual.** Como CI en base nueva: `@iwana/db` 55/178 en 63 s; `@iwana/api` 79 suites / 568 tests, 0 rojas, 19 omitidas (3 suites esperadas) en 297 s. La roja `execution-orders.close-by-result` del ejecutor era su semilla local, no se reproduce.

B1, P2a, P2b y P3 cerrados (sin SQL a `expediente_records` en `privacy/retention/`; R4 ampliada; `BEFORE TRUNCATE` en cuatro tablas; `request_id` `NULL`). P1 queda abierto en el **caso mixto**: `crm-contract-standing-read.adapter.ts:76` marca incidencia solo si `terminalWithClock === 0` y `billing-standing-read.adapter.ts:51` solo si `withDate === 0`. Con un contrato terminado con fecha antigua y otro sin fecha, el reloj toma la antigua y el titular vence antes de tiempo. Además `hasUnreconciledFiscalClock` es opcional y se llama con `?.`: un puerto sin el método falla abierto. [Lanzador B2-R4](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-B2R4-LAUNCH-v1.0.md).

### 1.7 G2 de B2-R4 (AI-EM-ARCH, 2026-11-08)

**G2 ✅.** Caso mixto cerrado: `terminalWithClock < terminalCount` y `withDate < total`; `hasUnreconciledFiscalClock`, `findProspectDiscard` y `listProspectDiscard` son abstractos y se llaman sin `?.`. Suite nueva `conservation-clock-mixed.postgres.integration.spec.ts` 7/7 (desactiva triggers de `contracts` solo en su schema efímero: los triggers impiden crear un terminado sin fecha, así que el caso mixto solo surge de datos heredados). Como CI en base nueva: unitarias api 488/6437 sin caché; `@iwana/db` 55/178; `@iwana/api` 80 suites / 575 tests, 0 rojas, 19 omitidas (3 suites esperadas) en 423 s, con la máquina cargada. `close-by-result` sigue sin reproducirse fuera de la base local del ejecutor.

P3 para B5: las guardas `?.bind` de `retention-expiry.service.ts` quedaron inalcanzables. Siguiente: [B4 parcial](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-B4-R-LAUNCH-v1.0.md).

### 1.8 B4-R y decisiones (AI-EM-ARCH, 2026-11-08)

`sec-eng`: P1, P2a, P2b y P3 cerrados; sin Crítico ni Alto. `boundary-reviewer`: B1 cerrado. `gate-verifier` en PostgreSQL nuevo: shared 32/491, db 78/426, api 488/6437, portal 348/3478 (+1 omitida preexistente); integración db 55/178 en 64 s y api 80 suites / 575 tests, 0 rojas, 3 suites omitidas = lista esperada, en 289 s; typecheck 8/8; ESLint limpio. La 179 arriba y abajo queda cubierta por su spec en schemas efímeros (el hook bloqueó el `revert` por CLI). HEAD avanzó a `1853f931` sin tocar archivos de H-EXP.

**G6 ⛔ hasta B4-R2** por M-1, que es regresión de este diff en la ruta API:

| # | Sev. | Decisión |
| --- | --- | --- |
| M-1 | Media | Corregir: `ConservationDutyService` evalúa primero el contrato abierto; si lo hay, conserva por esa razón y no lanza `CONTRACT_UNRECONCILED`. El 409 solo aplica cuando nada más justifica conservar |
| M-2 | Media | **Decisión:** a un prospecto se le aplica el reloj completo de `PQR_SOPORTES` (3 años desde la respuesta, ADR-104). `hasProspectDuty` usa `lastResponseAt`. Los soportes PQR se conservan por la PQR, no por el tipo de titular |
| B-1 | Baja | Corregir con M-1: pruebas de `CONTRACT_UNRECONCILED` y `FISCAL_UNRECONCILED` por la ruta HTTP y en el ledger de `processTitular` |
| B-2 | Baja | Corregir: `unreconciledContractClock` pasa a `boolean` obligatorio |
| B-3 | Baja | Corregir: prospecto `DESCARTADO` sin `discardedAt` y solicitud terminal sin fecha de cierre dejan fila `ATTENTION_REQUIRED` con su código; códigos del CHECK que nadie produzca se retiran |
| B-5 | Baja | Corregir: el dry-run separa elegibles de no conciliados; `expire-retention --apply` sale con código distinto de 0 si queda algo en `ATTENTION_REQUIRED` o `FAILED` |
| B-4 | Baja | Sin cambio: `anonymized_request_id` del expediente conserva la marca |
| B-6 | — | Preexistente, fuera de alcance; se lista en el informe de cierre (B5) |

`test-change-reviewer` ya revisó en B4 las specs de H-EXP; los otros ~58 specs del portal sucios en el árbol son de otra sesión y no entran en el commit. Tras B4-R2 se repiten `sec-eng` (solo M-1 y M-2), `test-change-reviewer` (solo lo nuevo) y `gate-verifier`. [Lanzador B4-R2](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-B4R2-LAUNCH-v1.0.md).

### 1.9 G2 de B4-R2 (AI-EM-ARCH, 2026-11-08)

**G2 ✅.** Como CI en base nueva: unitarias api 488/6451 sin caché; `@iwana/db` 55/178; `@iwana/api` 82 suites / 588 tests, 0 rojas, 19 omitidas (3 suites esperadas) en 356 s. M-1, M-2, B-1, B-3 y B-5 hechos; `PROSPECT_HAS_CONTRACT` retirado del CHECK por no tener productor.

Decisiones:
- **M-1 ampliado: aceptado.** Un deber fiscal o PQR vigente también evita el 409, no solo el contrato abierto: es lo que pide «nada más justifica conservar».
- **B-2 autorizado.** Añadir `unreconciledContractClock: false` en las dos aserciones `toEqual` de `crm-contract-standing-read.adapter.spec.ts` (líneas 30 y 60) lo exige la regla nueva; no oculta regresión.
- Ajustes de fixtures (`resolved_at` en solicitudes terminales; fiscal 2018 → 2014; stub con consultas separadas) van a `test-change-reviewer`.

[Lanzador de cierre de B4](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-B4-CIERRE-LAUNCH-v1.0.md).

### 1.10 G6 (AI-EM-ARCH, 2026-11-08)

**G6 ✅.** B-2 hecho dentro de lo autorizado (puerto, dos adaptadores, dos aserciones del spec CRM y cuatro dobles de `requests.service` que exige el tipo obligatorio, con `false` = semántica previa). `sec-eng`: M-1 y M-2 cerrados, sin Crítico ni Alto; dos P3 (`?.bind` muerto; `selectProspectos` sin mapeo a `ATTENTION_REQUIRED` en la selección) quedan para B5. `test-change-reviewer`: 6/6 ajustes exigidos por regla nueva. `gate-verifier` en PostgreSQL nuevo: shared 32/491, db 78/426, api 488/6451, portal 348/3479; integración db 55/178 en 62 s y api 82 suites / 588 tests, 0 rojas, 3 suites omitidas = lista esperada, en 371 s; typecheck 8/8; ESLint y Prettier limpios salvo `next-env.d.ts` generados (fuera del commit); `pnpm audit --prod` sin críticas.

**Riesgo para G6.5:** el CI de `main` está rojo desde `49e8448f` por `portal-billing-flow.spec.ts:613` y siguientes (MOD14, E2E R4.1: dos botones «Registrar pago»), ajeno a H-EXP. Hay un arreglo sin commit de otra sesión en `e2e/tests/portal-billing-flow.spec.ts`, que no entra en este commit. G6.5 de H-EXP exige ese job en verde.

### 1.11 G6.5 ⛔ (AI-EM-ARCH, 2026-11-08)

Publicado en `81c9be55`. **G6.5 ⛔.** R4.1 ya pasa (339/0 en `b6b2c759`), pero ahora falla el job «Integration tests — API (PostgreSQL real)» (runs 42536520408 y 42544794538): 4 suites, 14 pruebas, todas de H-EXP. Son `retention-expiry`, `retention-expiry-b3`, `retention-expiry-b4r2` y `crm-personal-data-erasure.prospect`. Error: «PII_HASH_KEY es requerida» desde `loadErasureKeys` (`titular-erasure-sql.ts:49`). **Causa:** las cuatro construyen `new ConfigService(process.env)`, y la clave solo existía porque se cargaba el `.env` local. CI no tiene `.env`. Las suites anteriores inyectan su propia clave sintética (`crm-titular-erasure.participant…spec.ts:146`, `privacy-due-alerts…spec.ts:53`). **Fallo del gate:** el G6 se verificó con el `.env` del repo presente, así que no reprodujo CI. Corrección: [CI-PIIKEY](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-CI-PIIKEY-LAUNCH-v1.0.md). Desde ahora, la verificación «como en CI» exige `PII_HASH_KEY` ausente del entorno y del `.env`.

**G2 CI-PIIKEY ✅ (2026-11-08).** El diff toca solo las 4 specs, con 8 líneas cada una. `ConfigService` recibe `{ ...process.env, PII_HASH_KEY: randomBytes(32) }` y ninguna aserción depende del HMAC. El ejecutor reprodujo el rojo y el verde con `.env*` apartados y en un PostgreSQL desechable: rojo 14 de 27; verde 27 de 27; integración completa 82 suites pasan y 3 se omiten (la lista esperada), 569 pruebas pasan, 19 se omiten y 0 fallan. Otras suites con `new ConfigService()` (`text-erasure-scope`, `pqr-retention`) no llegan a `resolvePiiHashKey` porque pasan `cryptoKeys`. Re-verificación de AI-EM-ARCH en un PostgreSQL nuevo: 4/4 suites y 27/27 con `PII_HASH_KEY` vacía (dotenv no la sobrescribe y `resolvePiiHashKey` la trata como ausente) y `MFA_ENCRYPTION_KEY` efímera, como en `ci.yml:302`. El volumen `iwana_ci_piikey_vol` quedó para borrado manual, porque el hook bloquea `docker volume rm`.

## 2. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · motor y relojes | `sr-backend` | P1, P2 | `privacy/retention/` (servicio de vencimiento, `ConservationDutyService` extraído de `requests.service.ts`), puertos de CRM, Billing y Assurance (fecha de descarte del prospecto; recurso PQR pendiente), migración del ledger y de `closed_at` / `minimized_at` / clasificación de traslado |
| B2 · solicitudes, job y CLI | `sr-backend` | B1 | Minimización de solicitudes (D-EXP-3), `@Processor` y constantes en `privacy/retention/`, payload Zod en `packages/shared`, `apps/api/src/cli/expire-retention.ts` |
| B3 · integración y carreras | `sr-qa` | B2 | CA-EXP-01 a 09 y 12 a 16 contra PostgreSQL real; dos conexiones; canarios sintéticos |
| B4 · verificación | `sec-eng`, `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `gate-verifier` | B3 | Solo lectura |
| B5 · cierre documental | AI-EM-ARCH | B4 | Informe, HLD, runbook y memoria |

**Ruta crítica:** G0 → R1 de G7 → B1 → B2 → B3 → B4 → commit y push → G6.5 → B5. B1 y B2 van seguidos: comparten servicio y migración.

## 3. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `nestjs-expert`, `postgresql`, `database-migration`, `iwana-tenant-migration`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` | `typescript-expert` (puertos) | `openapi-spec-generation` (sin endpoint nuevo) |
| B2 | `nestjs-expert`, `bullmq-specialist`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` | — | `docker-expert` (sin cambios de imagen) |
| B3 | `testing-patterns`, `test-driven-development`, `postgresql`, `iwana-test-evidence` | `systematic-debugging` | `e2e-testing-patterns` (sin UI) |
| B4 `sec-eng` | `security-auditor`, `backend-security-coder` | — | — |
| B5 | `docs-architect` | — | — |

`bullmq-specialist` se lee junto con ADR-105, que prevalece donde la skill dice que la API no procesa.

## 4. Encargos

Trabajo en `main`, sin ramas, sin stash, sin commit. Cero PII. Nunca `tenant_iwana` para pruebas destructivas. `[BLOQUEO]` si el código contradice la spec.

- **B1.** D-EXP-1, D-EXP-2 y §5. Fecha civil de Bogotá con `bogotaCivilDate`, nunca `slice(0,10)` sobre UTC. Fallo cerrado ante dato ausente. Corregir el recurso PQR pendiente (`pqr-retention-read.adapter.ts:35`). El ledger es la garantía de idempotencia.
- **B2.** D-EXP-3 y §6 (opción B). `transferred_to` con clasificación y tarea para el legado. El job no elige titular. CLI con dry-run por defecto y `--apply` y `--verify-only` excluyentes.
- **B3.** Canarios positivos y negativos; reloj congelado en 18:59, 19:00 y 23:59 de Bogotá; 20 iteraciones de carrera sin deadlock.
- **B4.** `sec-eng`: Redis manipulado, tenant inactivo, fallo cerrado y ausencia de PII en logs. `gate-verifier`: suites completas sin caché, integración como en CI con duración, migración arriba y abajo.

## 5. Gates

| Gate | Condición |
| --- | --- |
| G0 | Spec v1.1 §10, puntos 1 a 4, y ADR-105 |
| G3 | CA-EXP de la Fase 1 en verde contra PostgreSQL real |
| G6 | B4 sin P1; suites completas |
| G6.5 | CI de `main` en verde sobre el SHA |
| G7 | Diferido hasta la beta: job habilitado, primera corrida y recuperación demostradas, pendientes vencidos en cero por tenant |

## 6. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Anonimizar antes de tiempo por una fecha mal calculada | Fecha civil de Bogotá, vencimiento inclusivo probado en bordes, fallo cerrado |
| Escritura concurrente que reintroduce datos | Protocolo de bloqueo con CRM, PQR y Billing; prueba de dos conexiones |
| Job manipulado en Redis | El job no elige objeto; el servicio revalida todo |
| Carga sobre la API | Concurrencia 1 y lotes de 100 |
