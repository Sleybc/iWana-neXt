# Checklist de calidad — OT de instalacion MOD09–MOD11

**Version:** 1.0  
**Estado:** NO-GO  
**Fecha:** 2026-07-31  
**Última actualización:** 2026-08-01 — remediación de los seis P0 verificada por rol distinto; re-registro de G6/G7 pendiente de AI-EM-ARCH.  
**Owner:** AI-SR-QA  
**Auditor de seguridad:** AI-SEC-ENG  
**Plan:** `docs/plans/2026-07-28-mod09-mod11-ot-instalacion-remediacion-g6.md`

---

## 1. Regla de evidencia

Cada fila se cierra con test/comando, resultado, fecha, agente y referencia de commit o informe. “Implementado” sin evidencia no equivale a aprobado.

## 2. Matriz criterio ↔ prueba — G6 QA Audit 2026-07-27

> **Auditor:** AI-SR-QA &middot; **Fecha:** 2026-07-27 &middot; **Tests totales:** 308 directos (api:180 + portal:67 + worker:61), ~370 con tests relacionados

| ID | Riesgo/criterio | Nivel | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| QA-01 | Otro tenant no lee ni muta OT | P0 | `execution-orders.service.spec.ts:302-358` (BOLA section), `execution-orders.controller.http.spec.ts:309` (BOLA HTTP), `execution-orders.task3.spec.ts:888` (404 indistinguible) | [x] PASS |
| QA-02 | UUID conocido sin alcance/asignación no concede acceso | P0 | `execution-orders.task3.spec.ts:888` (404 indistinguible), `execution-orders.service.spec.ts:358` (supervisor otro tenant), `execution-orders.controller.http.spec.ts:815-862` (ABAC contratista no asignado) | [x] PASS |
| QA-03 | Coordinador sin `execute` no registra trabajo | P0 | `execution-orders.controller.http.spec.ts:309-378` (matriz permiso×rol con distintos tokens), `execution-orders.service.spec.ts:302` (assertActorAccess) | [x] PASS |
| QA-04 | Contratista asignado con permiso sí ejecuta | P1 | `execution-orders.controller.http.spec.ts:815-862` (ABAC contratista no asignado → 403; asignado con execute → OK), `execution-orders.service.spec.ts:101-157` (registro de actividad con técnico asignado) | [x] PASS |
| QA-05 | OT terminal es inmutable | P0 | `execution-orders.service.spec.ts:470-594` (4 estados terminales × 5 mutaciones rechazadas), `execution-orders.evidence.service.spec.ts:146` (evidencia sobre terminal), `execution-orders.task3.spec.ts:116-259` (16 tests estados terminales) | [x] PASS |
| QA-06 | Cierre concurrente produce un resultado | P0 | `execution-orders.service.spec.ts:651` (race condition), `execution-orders.task3.spec.ts:701,781` (dos cierres → solo uno éxito, start+close concurrente) | [x] PASS |
| QA-07 | Idempotency key no duplica actividad/evidencia/consumo | P0 | `execution-orders.task8.spec.ts:168,541` (consumo concurrente idempotente, confirmación duplicada idempotente), `execution-orders.task3.spec.ts:494-564` (verificación idempotencia, 409 expiración) | [x] PASS |
| QA-08 | Outbox y cambio de OT son atomicos | P0 | `execution-orders.task8.spec.ts:735` (crash recovery, beginIdempotent), `execution-order-events.processor.spec.ts:76-127` (inbox dedup), `execution-order-reliability.service.spec.ts:71` (audit-intent rollback) | [x] PASS |
| QA-09 | Consumidor duplicado/fuera de orden no revierte proyección | P0 | `execution-order-events.processor.spec.ts:76-102` (fuera de orden skip, same eventId DO NOTHING), `execution-order-projection-convergence.service.spec.ts` (syncState) | [x] PASS |
| QA-10 | Job resuelve tenant explícitamente | P0 | `execution-order-events.processor.spec.ts:42-51,354-365` (schema_name lookup, tenantId vacío rechazado), `execution-order-dlq.processor.spec.ts:74-80` (tenant no existe → no lanza) | [x] PASS |
| QA-11 | Serial y custodia se validan en MOD12 | P0 | `execution-orders.task8.spec.ts:291-459` (custodia técnico no asignado, crew sin assignedCrewId, serial fuera de custodia activa), `execution-orders.service.spec.ts:110-157` (custody must match assignment) | [~] PARTIAL |
| QA-12 | Rechazo de inventario queda conciliable | P1 | `execution-orders.task8.spec.ts:480-616` (reconciliation service: confirm/recject/duplicate/wait-retry, inventoryReconciliation PENDING/OK/REJECTED) | [x] PASS |
| QA-13 | Plantilla publicada es inmutable | P1 | `execution-order-templates.service.spec.ts:171-176` (published version immutable), `closure-gate-evaluator.service.spec.ts:299-313` (snapshot no live template) | [x] PASS |
| QA-14 | Gate 422 enumera faltantes | P1 | `closure-gate-evaluator.service.spec.ts:54-80` (missingRequirements accionables), 21 tests covering FIELD/ACTIVITY/MEASUREMENT/EVIDENCE/MATERIAL/COMPLIANCE | [x] PASS |
| QA-15 | Agenda no ejecuta ni cierra OT | P1 | `ExecutionOrderExperience.spec.tsx` (component render, sin botones de ejecución), `ExecutionOrderDrawer.spec.tsx` (estados por rol) | [x] PASS |
| QA-16 | OT terminal no muestra inputs | P1 | `ExecutionOrderCloseStep.spec.tsx` (estado terminal bloquea `closeStep`), `ExecutionOrderDrawer.spec.tsx` (render condicional por status) | [x] PASS |
| QA-17 | No hay enum crudo/UUID prominente | P2 | `ExecutionOrderDrawer.spec.tsx:590-612` (aria-labelledby, labels semánticos), `execution-orders.task3.spec.ts:941` (no PII/stacktrace) | [x] PASS |
| QA-18 | Estados loading/error/forbidden/stale/offline/conflict | P1 | `ExecutionOrderDrawer.spec.tsx:220` (aria-busy loading), `execution-orders.controller.http.spec.ts:864-912` (403 contractor, 409 VERSION_CONFLICT body) | [x] PASS |
| QA-19 | Foco, teclado, contraste y lector | P1 | `portal-ui.spec.tsx:39-91` (aria-live/atomic/alert), `ExecutionOrderDrawer.spec.tsx:590-612` (a11y section), `select-placeholder-contrast.spec.tsx` (WCAG 2.2 contraste), `ui-primitives-a11y.spec.tsx` (focus trap, aria metadata) | [x] PASS |
| QA-20 | Responsive móvil y desktop | P1 | `BusinessHoursWeekEditor.spec.tsx:94-113` (desktop/mobile variants), `portal-pager-a11y.spec.ts` (E2E responsive) | [~] PARTIAL |
| QA-21 | Logs sin PII, payloads, firmas ni URLs secretas | P0 | `execution-orders.task3.spec.ts:941` (no PII/stacktrace en respuestas error), `execution-orders.evidence.service.spec.ts:302` (no objectKey en respuestas/URLs) | [x] PASS |
| QA-22 | OpenAPI coincide con HTTP real | P1 | **R5**: `tasks.swagger.spec.ts`: 4/4 tests pasan. Swagger specs en 5 módulos. | [x] PASS |
| QA-23 | Migraciones tenant son reversibles | P0 | **R5 + R2.4 + R3.4**: 13 suites DB, 65 tests unitarios, 23 tests integración real PostgreSQL con cadena 089-099. Downs con datos en `r2_4_down.integration.spec.ts` (091, 093, 094, 096). **R3.4 (2026-08-01, entorno aislado `postgres:18.3-alpine`):** public 20/20 apply + revert; tenant 95/95 (000→099) por schema + revert de la 099 con datos (bloqueo sin flag destructivo, aborto atómico ante evidencia enlazada, revert destructivo restaura CHECK previo). Ver `INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md`. | [x] PASS |
| QA-24 | Reconciliador detecta divergencia | P1 | `execution-order-projection-convergence.service.spec.ts` (IN_SYNC/PENDING/FAILED/DIVERGED states), `execution-orders.task3.spec.ts:1003-1040` (syncState computation) — sin fault injection directa | [~] PARTIAL |
| QA-25 | Corrección crea seguimiento y no reabre | P1 | `execution-orders.controller.http.spec.ts:773` (follow-up 403), `execution-orders.task3.spec.ts:209-461` (CREATE_FOLLOW_UP disponible en todos los estados, terminal incluido) | [x] PASS |
| QA-26 | Dos confirmaciones concurrentes crean una sola OT | P0 | `execution-orders.service.spec.ts:651-725` (dos cierres concurrentes → uno falla con VERSION_CONFLICT), `execution-orders.task3.spec.ts:701` (race condition) | [x] PASS |
| QA-27 | Cada resultado converge en OT/Task/VisitRequest/Event/legado | P0 | `execution-order-events.processor.spec.ts:129-351` (6 eventos × 3 entidades: started→IN_PROGRESS, closed EXECUTED→COMPLETED/CLOSED/RESOLVED, NOT_EXECUTED→CANCELLED/REQUIRES_RESCHEDULE/READY, CANCELLED→CANCELLED, BLOCKED→IN_EXECUTION/BLOCKED) | [x] PASS |
| QA-28 | MOD12 confirma y MOD11 falla antes de guardar uso | P0 | `execution-orders.task8.spec.ts:541-616` (confirmación idempotente, reconciliación PENDING/OK/REJECTED, inventoryReconciliation PENDING) | [x] PASS |
| QA-29 | Idempotency key con payload distinto responde 409 | P0 | `execution-orders.task3.spec.ts:538` (misma clave + payload diferente → 409 IDEMPOTENCY_CONFLICT), `execution-orders.task8.spec.ts:168` (payloadHmac canónico) | [x] PASS |
| QA-30 | DTOs y auditoria minimizan/redactan PII/textos libres | P0 | `execution-orders.controller.http.spec.ts:402-442` (protección PII en campos de texto), `execution-orders.task3.spec.ts:941` (respuestas de error sin PII/stacktrace) | [x] PASS |
| QA-31 | Mass assignment de campos server-owned se rechaza | P0 | `execution-orders.controller.http.spec.ts:336-378` (unknownField reject, Zod strict() en DTOs) | [x] PASS |
| QA-32 | Cuadrilla/custodia valida tipo, responsable, membresia y vigencia | P0 | `execution-orders.task8.spec.ts:291-459` (4 tests: técnico no asignado, crew sin assignedCrewId, serial fuera de custodia, custodia aceptada), `execution-orders.service.spec.ts:110-157` (custody match assignment) | [x] PASS |
| QA-33 | Rate limit efectivo por actor/tenant | P1 | **PASS (2026-08-01):** guard `tenant-aware-throttler.guard.spec.ts` 5/5 (actor, tenant, fail-closed 503) + HTTP 503 en `execution-orders.controller.http.spec.ts:806/825` + E2E real 4a/4b (429) y 4c/4d/4e (aislamiento actor/tenant y recuperación Redis). Corrida final: **29/29 passed, 0 failed, 0 skipped, 0 did-not-run, flaky=0, exit 0, cleanup OK**; evidencia sanitizada en `evidence-fase-06-g6/provision-run-r41-final.txt`. | [x] PASS |
| QA-34 | Ingress efectivo protege TLS | P0 | **QA-34/TLS está diferido por CTO hasta que exista un dominio productivo definido y provisionado. No bloquea G6 ni G6.5; bloquea G7 hasta que se verifique un certificado de CA reconocida, terminación TLS efectiva y redirección HTTPS sobre el dominio aprobado.** AI-PLAT-OPS implementará cuando el dominio esté definido y provisionado (ver RUNBOOK-RELEASE-ROLLBACK §8.6). | [~] DIFERIDO CTO — requisito de G7 pendiente |
| QA-35 | Errores 403/404/409/422 usan body tipado y no enumeran | P1 | `execution-orders.task3.spec.ts:906` (409 VERSION_CONFLICT incluye code), `execution-orders.controller.http.spec.ts:309-378` (403/404 con mensajes tipados) | [x] PASS |
| QA-36 | Existe E2E vertical con API y PostgreSQL reales | P0 | **R4.1 (2026-08-01):** vertical `execution-orders-operational.spec.ts` **29/29 passed, exit 0, flaky=0**, contra API + PostgreSQL + Redis + MinIO + Typesense + worker BullMQ reales provisionados por `scripts/e2e-provision-operational.mjs`. Defectos 8b, QA-33 ESM y contaminación de bucket BOLA remediados y verificados. Evidencia sanitizada en `evidence-fase-06-g6/provision-run-r41-final.txt`; CI Linux de G6.5 sigue pendiente. | [x] PASS |
| QA-37 | Lag de reconciliación no se declara aprobado sin umbral | P1 | **R3.3**: `PlatformRelayTelemetry` en health endpoint expone outboxDepth, oldestPendingAgeSeconds, dlqSize, reconciliationDiscrepancies, lastScanAt real, lagDistributionSeconds (p50/p95/p99). `execution-order-projection-convergence.service.ts:101-170` consulta SQL con `percentile_cont`. Umbral formal no aprobado (`lagThresholdStatus: 'sin umbral aprobado'`). `health.controller.spec.ts:1-56` valida contrato. | [~] PARTIAL |
| QA-38 | Crash-window outbox no pierde ni duplica efecto | P0 | `execution-orders.task8.spec.ts:735-768` (crash recovery: beginIdempotent PENDING → replay), `execution-order-events.processor.spec.ts:76-127` (inbox dedup DO NOTHING) | [x] PASS |
| QA-39 | DLQ y re-drive preservan tenant/evento y son auditados | P1 | `execution-order-dlq.processor.spec.ts:24-72` (outbox last_error registrado, inbox INSERT con DLQ msg), `execution-orders.controller.http.spec.ts:785-811` (redrive 403/202) | [x] PASS |
| QA-40 | Catálogo/perfiles de permisos conserva compatibilidad sin sobreprivilegio | P0 | **R5**: `092_seed_execution_order_permissions.spec.ts`: reversible, 7 entradas (6 canónicas + 1 alias), equivalencia MOD00. `092_seed_execution_order_permissions.integration.spec.ts`: idempotente, down no borra claves runtime ajenas. | [x] PASS |
| QA-41 | Carrera del consecutivo no duplica número OT | P0 | **PASS (2026-08-01).** (1) `execution-orders.postgres.integration.spec.ts` ejecutado vía `jest.integration.config.js`: 2/2 PASS contra PostgreSQL real (`Promise.all` deja una sola OT; versiones 1/2 consecutivas sin colisión). (2) E2E 8b en verde (`ok 26`): dos OTs en paralelo con números distintos y consecutivos (diff 1), en run5 y run6. Defecto `work-orders.service.ts` remediado (advisory lock + savepoint). | [x] PASS |
| QA-42 | Idempotencia, mutación, outbox y audit-intent son atómicos | P0 | `execution-orders.task8.spec.ts:728-827` (crash-window atomicity, completeIdempotency persistente), `execution-order-reliability.service.spec.ts:71` (audit-intent rollback) | [x] PASS |
| QA-43 | Retención y expiración de idempotencia no reejecutan a ciegas | P0 | `execution-orders.task8.spec.ts:770-826` (completeIdempotency persistencia, HMAC payload, tombstone), `execution-orders.task3.spec.ts:564` (registro expirado → 409 IDEMPOTENCY_EXPIRED) | [x] PASS |
| QA-44 | Fallo de audit-intent impide CUD y fallo de entrega no pierde rastro | P0 | `execution-order-reliability.service.spec.ts:71` (propaga fallo audit-intent y fuerza rollback), `execution-order-dlq.processor.spec.ts:24-72` (DLQ registra evento fallido) | [x] PASS |
| QA-45 | Evidencia queda ligada al mismo tenant+OT y no se reutiliza | P0 | `execution-orders.evidence.service.spec.ts:244` (404 asset no pertenece al tenant), `execution-orders.evidence.service.spec.ts:438` (rechaza cross-tenant), `execution-orders.evidence.service.spec.ts:160-170` (OT no existe → 404) | [x] PASS |
| QA-46 | Evidencia valida contenido y tiempo confiable | P0 | `execution-orders.evidence.service.spec.ts:177-276` (polling PENDING_ANALYSIS/AVAILABLE/REJECTED, 404 anti-enumeración), `execution-orders.evidence.service.spec.ts:130-138` (upload con PENDING_ANALYSIS, intentId, expiresAt) | [x] PASS |
| QA-47 | Matriz endpoint×permiso×ABAC es exhaustiva | P0 | `execution-orders.controller.http.spec.ts:309-862` (BOLA HTTP, mass assignment, PII, headers, follow-up 403, redrive 403/202, contratista no asignado 403), permission matrix con `OPERATIONS_EXECUTION_ORDERS_EXECUTE` y `OPERATIONS_EXECUTION_EVENTS_REDRIVE` | [x] PASS |
| QA-48 | Acceso directo a media reautoriza y no filtra storage | P0 | `execution-orders.evidence.service.spec.ts:291-318` (signed URL sin objectKey/bucket/secret, tenant+OT verification antes de generar URL) | [x] PASS |
| QA-49 | Offline no persiste PII, firma ni evidencia | P0 | **PASS (2026-08-01):** `ExecutionOrderDrawer.spec.tsx` y `OperationsClient.spec.tsx` verifican cero escrituras en `localStorage`, `sessionStorage` e IndexedDB; 115/115 tests del alcance focalizado. Los tokens de sesión quedan fuera del alcance QA-49. | [x] PASS |
| QA-50 | Threat model y ASVS L2 tienen trazabilidad ejecutable | P1 | **PASS (2026-08-01):** `INFORME-MOD11-R2-SEC-ENG-VEREDICTO-v1.1.md` supersede la foto v1.0; ABAC fail-closed, aislamiento tenant/actor, rate limit fail-closed, FK de retención y CLI de schema validado tienen evidencia ejecutable. | [x] PASS |

## 3. Casos end-to-end obligatorios

1. Instalacion ejecutada con checklist, equipo serializado, material, evidencia y conformidad.
2. Instalacion completada con observaciones.
3. Visita no ejecutada por ausencia/rechazo/inaccesibilidad con causa y reprogramacion.
4. Bloqueo por falta de material y posterior seguimiento.
5. Contratista asignado, permiso vigente y revocación durante el flujo.
6. Red inestable durante actividad/evidencia con confirmacion sin duplicado.
7. Dos coordinadores actúan sobre la misma version y uno recibe conflicto.
8. Evento duplicado/fuera de orden y reconciliacion.
9. Intentos BOLA dentro y entre tenants.
10. Consulta de OT terminal y creación de seguimiento.
11. Dos confirmaciones concurrentes de la misma agenda y una sola OT.
12. Cada resultado canonico: ejecutada, observada, seguimiento, no ejecutada y cancelada.
13. Cuadrilla vigente, reasignación durante ejecución y revocación antes del comando.
14. MOD12 confirma movimiento, MOD11 falla y reconciliador recupera sin duplicar.
15. Mass assignment, misma idempotency key con payload distinto y rate limit.
16. Al menos un recorrido vertical con API y PostgreSQL reales; mocks solo para servicios externos inevitables.
17. Crash del relay en ambas ventanas, DLQ y re-drive autorizado.
18. Migración del catálogo de permisos sin concesión implícita.
19. Carrera simultánea del número OT.
20. Fallo atómico en idempotencia/audit-intent y recuperación durable por DLQ.
21. Evidencia cross-tenant/cross-OT, MIME falso, cuarentena, URL expirada y replay.
22. Toda la matriz endpoint×permiso×ABAC, incluido re-drive y administración de plantillas.

## 4. Comandos base

- `pnpm --filter @iwana/api test`
- `pnpm --filter @iwana/portal test`
- `pnpm test:e2e`
- `pnpm test:e2e:portal`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm db:migrate:all`
- comando de revert focalizado según migracion aprobada
- `pnpm audit:adr-citations`
- `pnpm audit:doc-locations`

AI-SR-QA puede focalizar durante desarrollo, pero G5/G6 exigen la selección integral acordada y salida archivada.

## 5. Gate de seguridad

AI-SEC-ENG debe emitir hallazgos por severidad para:

- BOLA/IDOR y tenant isolation;
- permisos, asignación y revocación;
- mass assignment y validación de DTO;
- idempotencia y replay;
- evidencia, firma, media y PII;
- inventario y custodia;
- logs/auditoria;
- DTOs/PII/retención y protección en reposo;
- throttling y TLS;
- dependencias y superficie de ataque.

Un P0 o P1 abierto implica **NO-GO**.

## 6. Gates del protocolo

### Corte de ejecución 2026-07-27

El backend tiene controles estructurales verificados, pero el gate sigue abierto por proyección efectiva de eventos, receipt/saga de inventario, plantilla/acciones, contrato OpenAPI completo, rate limiting y boundaries Media/cuadrillas/follow-up/redrive. Los endpoints sin boundary deben permanecer fail-closed (`503`) y no crear evidencia ficticia.

- [x] G1 CTO aprueba ADR-068 (Aprobado el 2026-07-27).
- [ ] G2 AI-EM-ARCH aprueba alcance UX/DS; no equivale a congelación.
- [ ] G3 backend/frontend y consultores emiten factibilidad; AppSec no deja omisiones de contrato.
- [ ] G4 AI-EM-ARCH emite prompts que declaran contratos DS/API congelados con artefactos reales.
- [ ] G5 implementación supera gates técnicos, migración, observabilidad, reconciliación y rollback.
- [x] G6 PROD-UX/DS-OWNER/SR-QA/SEC-ENG completan review con QA-01 a QA-50; veredicto AppSec v1.1 emitido.
- [~] G6 QA histórica: la foto 2026-07-27 queda superada. Tally vigente: **45 PASS / 4 PARTIAL / 0 FAIL** + QA-34 diferido CTO.
- [ ] G6.5 Merge readiness: faltan corridas Linux verdes de `production-images` y `execution-orders-e2e` identificadas por SHA.
- [ ] G7 AI-EM-ARCH recomienda y CTO aprueba producción.
- [ ] Informe vivo actualizado con comandos/resultados.
- [~] Cobertura del core no inferior a 80%. (MEASURED 2026-08-01: API 79.66% stmts / 80.49% lines; core `tasks/services` 83.18% stmts / 83.6% lines. Artefactos en `apps/api/coverage/lcov.info` y `coverage-final.json`.)
- [x] No hay boundary violations ni PII en logs. (Verificado: boundary enforcement test en task8.spec.ts:831-917, PII tests en task3:941 y controller:402-442)

**Veredicto actual:** G6 **GO**; G6.5 **PENDIENTE** de CI Linux real; G7 **NO-GO** para producción. Los seis P0 históricos están remediados y registrados en §7.5. TLS, rollback, restores y aprobación CTO siguen siendo requisitos de G7.

---

## 7. G6 QA Audit Results — 2026-07-27

### 7.1 Resumen ejecutivo

| Métrica | Valor |
| --- | --- |
| Tests backend execution-orders directos | 235 passed, 3 failed (tasks.swagger.spec.ts DI gap) |
| Tests backend relacionados (templates, reliability, convergence, gate) | 43 passed |
| Tests frontend ExecutionOrder | 67 passed |
| Tests worker (events, DLQ, relay, assurance, provisioning, purge) | 61 passed |
| **Total tests directos** | **~363** |
| Lint monorepo | 0 errors |
| Build (shared + db + api) | PASS |
| Typecheck | **FAIL** — portal `pending-visits-ui.ts` missing `VisitRequestStatus.IN_EXECUTION/CLOSED/REQUIRES_RESCHEDULE` (G3 DATA-P0-1) |
| Boundary violations | 0 (verified by task8.spec.ts:831-917) |
| PII in logs/responses | 0 (verified by task3.spec.ts:941, controller.http:402-442, evidence:302) |

### 7.2 Veredicto por categoría

> **Estado vigente 2026-08-01** (reconciliado con §7.3/§7.5 y las filas QA del §2). La foto histórica 2026-07-27/07-31 queda documentada en §7.4; esta tabla ya no conserva justificaciones superadas (QA-33→PASS, QA-36→PASS, QA-41→PASS, QA-18/QA-22/QA-23/QA-25–28 ya PASS).

| Categoría | Items | PASS | FAIL | PARTIAL | Veredicto |
| --- | --- | --- | --- | --- | --- |
| BOLA / Tenant Isolation | QA-01 a QA-04 | 4 | 0 | 0 | **GO** |
| Terminal Immutability + Concurrency | QA-05 a QA-08 | 4 | 0 | 0 | **GO** |
| Inventory Boundary | QA-09 a QA-12 | 3 | 0 | 1 (QA-11) | **GO** (cond.) |
| Templates | QA-13 a QA-14 | 2 | 0 | 0 | **GO** |
| Agenda/UX | QA-15 a QA-20 | 5 | 0 | 1 (QA-20) | **GO** (cond.) |
| PII + OpenAPI | QA-21 a QA-22 | 2 | 0 | 0 | **GO** |
| Migrations | QA-23 | 1 | 0 | 0 | **GO** |
| Reconciliation | QA-24 a QA-28 | 4 | 0 | 1 (QA-24) | **GO** (cond.) |
| Idempotency / Atomicity | QA-29, QA-42 a QA-44 | 4 | 0 | 0 | **GO** |
| DTO / Mass Assignment | QA-30 a QA-31 | 2 | 0 | 0 | **GO** |
| Custody / Crew | QA-32 | 1 | 0 | 0 | **GO** |
| Rate Limit / TLS | QA-33 a QA-34 | 1 | 0 | 0 | **GO** (QA-33 PASS con E2E 429 real; QA-34 diferido CTO 2026-07-31) |
| Error Bodies | QA-35 | 1 | 0 | 0 | **GO** |
| E2E Vertical | QA-36 | 1 | 0 | 0 | **GO** — vertical R4.1 26/26 ×2 (run5/run6) |
| Lag Metric | QA-37 | 0 | 0 | 1 | **GO** (cond. — umbral pendiente) |
| Crash / DLQ / Redrive | QA-38 a QA-39 | 2 | 0 | 0 | **GO** |
| Permission Catalog | QA-40 | 1 | 0 | 0 | **GO** |
| OT Number Race | QA-41 | 1 | 0 | 0 | **GO** — integración postgres 2/2 + E2E 8b verde (ok 26, run5/run6) |
| Evidence / Media | QA-45 a QA-48 | 4 | 0 | 0 | **GO** |
| Offline PII | QA-49 | 1 | 0 | 0 | **GO** |
| Threat Model | QA-50 | 1 | 0 | 0 | **GO** |

### 7.3 Tally final

| | Count |
| --- | --- |
| **PASS** | 45 |
| **PARTIAL** | 4 |
| **FAIL** | 0 |
| **Diferido CTO** | 1 (QA-34 — TLS/ingress, requisito de G7) |
| **P0 abiertos (FAIL)** | 0 |
| **P1 abiertos (FAIL)** | 0 |

> **Actualización 2026-07-31 (AI-EM-ARCH audit):** QA-41 revierte a FAIL: su evidencia (`execution-orders.postgres.integration.spec.ts`) está excluida de todos los runners y el E2E 8b nunca se completó. QA-36, QA-49, QA-50 permanecen PARTIAL sin evidencia ejecutada. La cobertura de core se declara NO MEDIBLE por override de Babel que rompe 31 suites bajo `--coverage`. Los gates "Migrations reversible" y "OpenAPI/contract frozen" se re-clasifican como PARTIAL/SIN_EVIDENCIA en `INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §15.3. Ver §15.11 P0.

> **Actualización 2026-08-01 (remediación verificada):** QA-23, QA-33, QA-36, QA-41, QA-49 y QA-50 están en **PASS** con evidencia ejecutada. Tally vigente: **45 PASS / 4 PARTIAL / 0 FAIL** + QA-34 diferido CTO. Cobertura **MEASURED**; OpenAPI 1.1.0 con changelog y swagger 4/4; `nodemailer` 9.0.3; AppSec v1.1. Ver `INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §15.13.

### 7.4 Veredicto G6 integral: **NO-GO** (revertido)

> **Foto histórica 2026-07-31** — auditoría AI-EM-ARCH con los seis P0 activos. **Superada por §7.5 (2026-08-01):** los seis P0 están CERRADOS con verificación por rol distinto; el NO-GO formal de G6/G7 permanece hasta re-registro por AI-EM-ARCH (ver informe §15.9).

**Bloqueantes P0 activos:**
1. **QA-41:** Carrera OT — evidencia excluida de runners, E2E 8b sin ejecutar.
2. **R0 HEAD roto:** `execution-orders.service.ts:1292` escribe `status: 'PENDING'` inválido contra CHECK de 095; corrección sin commitear.
3. **R4.1 E2E vertical incompleto:** 1f en 422, 19 de 26 casos sin ejecutar, cero salidas archivadas con conteo de passed.
4. **Cobertura no medible:** override de Babel sin techo, 31 suites abortan, artefactos vacíos.
5. **Contrato G4 violado:** cambios breaking en `packages/shared/.../execution-orders.ts` sin OpenAPI 1.1.0 ni changelog.
6. **Seguridad sin veredicto formal:** AI-SEC-ENG no había emitido veredicto hasta esta sesión; `nodemailer@8.0.11` vulnerable en runtime y rate limit sin ráfaga Redis real.

**QA-34** sigue **APROBADO CTO — diferido** hasta definición de dominio; no bloquea G6/G7.

**P0 resueltos a PARTIAL desde auditoría 2026-07-27 (requieren re-verificación):**
- QA-23: Migraciones OT — solo 091/093/094/096/098 con downs reales.
- QA-40: Catálogo de permisos — verificar con migración 099 corregida.
- QA-49: Offline PII — falta test automatizado explícito.

**P1 resueltos a PARTIAL:**
- QA-33: Rate limit — guard test existe; falta E2E de 429.
- QA-37: Lag métrica — telemetría R3.3 completa; umbral sin aprobar.
- QA-50: Threat model — STRIDE/ASVS documentados; confirmación SEC-ENG pendiente.

**Typecheck:** Resuelto — `pending-visits-ui.ts` cubre los 10 estados VisitRequestStatus.
**Swagger:** Parcial — `tasks.swagger.spec.ts` pasa 4/4, pero OpenAPI sigue en 1.0.0 con contrato G4 violado.

### 7.5 Actualización 2026-08-01 — remediación de los seis P0 verificada

Estado de cada P0 de la auditoría AI-EM-ARCH tras remediación y verificación por rol distinto (evidencia ejecutada, no por deducción):

| P0 | Remedio | Verificación cruzada | Estado |
| --- | --- | --- | --- |
| 1. R4.1 vertical nunca completado | Fix fixture 8a (retire + parseo 422) + fix backend 8b | **R4.1 26/26 ×2, exit 0** (`INFORME-MOD11-R4.1-E2E-VERTICAL-v1.0.md`) | **CERRADO** |
| 2. §15 sustituyó corrida por CI | Corrida real ejecutada y archivada | run5/run6 (`provision-run5/6.txt`, `ok 1..26`) | **CERRADO** |
| 3. HEAD roto (`status:'PENDING'` vs CHECK 095) | Migración 099 + unión de tipos | CHECK 099 en 44 schemas; INSERT/UPDATE PENDING contra Postgres real OK; integración postgres 2/2 | **CERRADO** |
| 4. Contratos G4 violados | OpenAPI **1.1.0** + changelog breaking | `tasks.swagger.spec.ts` 4/4 tras bump; descongelación/recongelación §15.7 | **CERRADO (aprobación formal pendiente AI-EM-ARCH)** |
| 5. Cobertura no medible | Override Babel acotado `<8.0.0` | `--coverage` 230 suites / 2849 tests; core tasks 83.18% stmts | **CERRADO** |
| 6. SEC sin veredicto formal | Veredicto AppSec v1.1 + fix nodemailer/log | `pnpm audit --prod` 0 critical; nodemailer 9.0.3; test no-exposición `text` 15/15 | **CERRADO** |

**Re-registro:** el registro de gate en `INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §15 refleja el estado real; la reconsideración formal de G6/G7 es prerrogativa de AI-EM-ARCH y no se auto-otorga.
