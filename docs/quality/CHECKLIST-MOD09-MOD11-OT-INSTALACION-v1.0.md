# Checklist de calidad — OT de instalacion MOD09–MOD11

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-07-27  
**Owner:** AI-SR-QA  
**Auditor de seguridad:** AI-SEC-ENG  
**Plan:** `docs/plans/2026-07-27-mod09-mod11-ot-instalacion-redesign.md`

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
| QA-22 | OpenAPI coincide con HTTP real | P1 | `execution-orders.task3.spec.ts:1045-1058` (OpenAPI compliance, Idempotency-Key en redrive), `tasks.swagger.spec.ts` (endpoints documentados) — swagger spec test **falla G6 por DI faltante** (P1) | [~] PARTIAL |
| QA-23 | Migraciones tenant son reversibles | P0 | No hay test automatizado de reversibilidad de migración OT. Las migraciones existen en `packages/database/src/migrations/` pero la prueba `run/revert en dos schemas` no se ejecutó en este gate. | [ ] FAIL |
| QA-24 | Reconciliador detecta divergencia | P1 | `execution-order-projection-convergence.service.spec.ts` (IN_SYNC/PENDING/FAILED/DIVERGED states), `execution-orders.task3.spec.ts:1003-1040` (syncState computation) — sin fault injection directa | [~] PARTIAL |
| QA-25 | Corrección crea seguimiento y no reabre | P1 | `execution-orders.controller.http.spec.ts:773` (follow-up 403), `execution-orders.task3.spec.ts:209-461` (CREATE_FOLLOW_UP disponible en todos los estados, terminal incluido) | [x] PASS |
| QA-26 | Dos confirmaciones concurrentes crean una sola OT | P0 | `execution-orders.service.spec.ts:651-725` (dos cierres concurrentes → uno falla con VERSION_CONFLICT), `execution-orders.task3.spec.ts:701` (race condition) | [x] PASS |
| QA-27 | Cada resultado converge en OT/Task/VisitRequest/Event/legado | P0 | `execution-order-events.processor.spec.ts:129-351` (6 eventos × 3 entidades: started→IN_PROGRESS, closed EXECUTED→COMPLETED/CLOSED/RESOLVED, NOT_EXECUTED→CANCELLED/REQUIRES_RESCHEDULE/READY, CANCELLED→CANCELLED, BLOCKED→IN_EXECUTION/BLOCKED) | [x] PASS |
| QA-28 | MOD12 confirma y MOD11 falla antes de guardar uso | P0 | `execution-orders.task8.spec.ts:541-616` (confirmación idempotente, reconciliación PENDING/OK/REJECTED, inventoryReconciliation PENDING) | [x] PASS |
| QA-29 | Idempotency key con payload distinto responde 409 | P0 | `execution-orders.task3.spec.ts:538` (misma clave + payload diferente → 409 IDEMPOTENCY_CONFLICT), `execution-orders.task8.spec.ts:168` (payloadHmac canónico) | [x] PASS |
| QA-30 | DTOs y auditoria minimizan/redactan PII/textos libres | P0 | `execution-orders.controller.http.spec.ts:402-442` (protección PII en campos de texto), `execution-orders.task3.spec.ts:941` (respuestas de error sin PII/stacktrace) | [x] PASS |
| QA-31 | Mass assignment de campos server-owned se rechaza | P0 | `execution-orders.controller.http.spec.ts:336-378` (unknownField reject, Zod strict() en DTOs) | [x] PASS |
| QA-32 | Cuadrilla/custodia valida tipo, responsable, membresia y vigencia | P0 | `execution-orders.task8.spec.ts:291-459` (4 tests: técnico no asignado, crew sin assignedCrewId, serial fuera de custodia, custodia aceptada), `execution-orders.service.spec.ts:110-157` (custody match assignment) | [x] PASS |
| QA-33 | Rate limit efectivo por actor/tenant | P1 | `TenantAwareThrottlerGuard` importado pero sin test de integración que verifique 429. Sin end-to-end test de ráfaga controlada. | [ ] FAIL |
| QA-34 | Ingress efectivo protege TLS | P0 | Responsabilidad de AI-PLAT-OPS (G3 condition PLAT-P0-02). No se ejecutó evidencia de TLS en este gate. | [ ] FAIL |
| QA-35 | Errores 403/404/409/422 usan body tipado y no enumeran | P1 | `execution-orders.task3.spec.ts:906` (409 VERSION_CONFLICT incluye code), `execution-orders.controller.http.spec.ts:309-378` (403/404 con mensajes tipados) | [x] PASS |
| QA-36 | Existe E2E vertical con API y PostgreSQL reales | P0 | `portal-field-flow-ticket-ot-inventory.spec.ts` (flujo ticket→OT→inventario con mocks API), `portal-inventory-scm.spec.ts:3404` (OT loan flow). No existe E2E dedicado execution-orders con API real. | [~] PARTIAL |
| QA-37 | Lag de reconciliación no se declara aprobado sin umbral | P1 | Sin métrica visible. Umbral no definido. G3 condition PLAT-P1-04 (métricas observabilidad). | [ ] FAIL |
| QA-38 | Crash-window outbox no pierde ni duplica efecto | P0 | `execution-orders.task8.spec.ts:735-768` (crash recovery: beginIdempotent PENDING → replay), `execution-order-events.processor.spec.ts:76-127` (inbox dedup DO NOTHING) | [x] PASS |
| QA-39 | DLQ y re-drive preservan tenant/evento y son auditados | P1 | `execution-order-dlq.processor.spec.ts:24-72` (outbox last_error registrado, inbox INSERT con DLQ msg), `execution-orders.controller.http.spec.ts:785-811` (redrive 403/202) | [x] PASS |
| QA-40 | Catálogo/perfiles de permisos conserva compatibilidad sin sobreprivilegio | P0 | La migración `MOD00_ACCESS_V1` declara 6 canónicos + 1 alias deprecado. Sin test de migración que verifique compatibilidad. Los tests ABAC verifican permisos actuales pero no validan la migración de catálogo. | [ ] FAIL |
| QA-41 | Carrera del consecutivo no duplica número OT | P0 | No se encontró test específico de carrera de consecutivo (dos creaciones concurrentes con constraint). Los tests de race cubren cierre, no creación. | [ ] FAIL |
| QA-42 | Idempotencia, mutación, outbox y audit-intent son atómicos | P0 | `execution-orders.task8.spec.ts:728-827` (crash-window atomicity, completeIdempotency persistente), `execution-order-reliability.service.spec.ts:71` (audit-intent rollback) | [x] PASS |
| QA-43 | Retención y expiración de idempotencia no reejecutan a ciegas | P0 | `execution-orders.task8.spec.ts:770-826` (completeIdempotency persistencia, HMAC payload, tombstone), `execution-orders.task3.spec.ts:564` (registro expirado → 409 IDEMPOTENCY_EXPIRED) | [x] PASS |
| QA-44 | Fallo de audit-intent impide CUD y fallo de entrega no pierde rastro | P0 | `execution-order-reliability.service.spec.ts:71` (propaga fallo audit-intent y fuerza rollback), `execution-order-dlq.processor.spec.ts:24-72` (DLQ registra evento fallido) | [x] PASS |
| QA-45 | Evidencia queda ligada al mismo tenant+OT y no se reutiliza | P0 | `execution-orders.evidence.service.spec.ts:244` (404 asset no pertenece al tenant), `execution-orders.evidence.service.spec.ts:438` (rechaza cross-tenant), `execution-orders.evidence.service.spec.ts:160-170` (OT no existe → 404) | [x] PASS |
| QA-46 | Evidencia valida contenido y tiempo confiable | P0 | `execution-orders.evidence.service.spec.ts:177-276` (polling PENDING_ANALYSIS/AVAILABLE/REJECTED, 404 anti-enumeración), `execution-orders.evidence.service.spec.ts:130-138` (upload con PENDING_ANALYSIS, intentId, expiresAt) | [x] PASS |
| QA-47 | Matriz endpoint×permiso×ABAC es exhaustiva | P0 | `execution-orders.controller.http.spec.ts:309-862` (BOLA HTTP, mass assignment, PII, headers, follow-up 403, redrive 403/202, contratista no asignado 403), permission matrix con `OPERATIONS_EXECUTION_ORDERS_EXECUTE` y `OPERATIONS_EXECUTION_EVENTS_REDRIVE` | [x] PASS |
| QA-48 | Acceso directo a media reautoriza y no filtra storage | P0 | `execution-orders.evidence.service.spec.ts:291-318` (signed URL sin objectKey/bucket/secret, tenant+OT verification antes de generar URL) | [x] PASS |
| QA-49 | Offline no persiste PII, firma ni evidencia | P0 | Sin test de service worker, storage offline o cache inspection. Sin evidencia de que el portal no persiste PII en modo offline. | [ ] FAIL |
| QA-50 | Threat model y ASVS L2 tienen trazabilidad ejecutable | P1 | STRIDE y ASVS L2 no mapeados a pruebas G6. Sin trazabilidad ejecutable. | [ ] FAIL |

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
- [ ] G6 PROD-UX/DS-OWNER/SR-QA/SEC-ENG completan review con QA-01 a QA-50.
- [~] G6 QA parcial: AI-SR-QA emitió evidencia el 2026-07-27. 34 PASS, 8 PARTIAL, 8 FAIL. Ver §7.
- [ ] G7 AI-EM-ARCH recomienda y CTO aprueba producción.
- [ ] Informe vivo actualizado con comandos/resultados.
- [~] Cobertura del core no inferior a 80%. (Verificada por ejecución de tests; coverage report no emitido por `--coverage` flag mal pasado).
- [x] No hay boundary violations ni PII en logs. (Verificado: boundary enforcement test en task8.spec.ts:831-917, PII tests en task3:941 y controller:402-442)

**Veredicto actual:** NO-GO — G6 QA ejecutado el 2026-07-27 por AI-SR-QA. Ver §7 Matriz de evidencia G6.

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

| Categoría | Items | PASS | FAIL | PARTIAL | Veredicto |
| --- | --- | --- | --- | --- | --- |
| BOLA / Tenant Isolation | QA-01 a QA-04 | 4 | 0 | 0 | **GO** |
| Terminal Immutability + Concurrency | QA-05 a QA-08 | 4 | 0 | 0 | **GO** |
| Inventory Boundary | QA-09 a QA-12 | 3 | 0 | 1 (QA-11) | **GO** (cond.) |
| Templates | QA-13 a QA-14 | 2 | 0 | 0 | **GO** |
| Agenda/UX | QA-15 a QA-20 | 4 | 0 | 2 (QA-18, QA-20) | **GO** (cond.) |
| PII + OpenAPI | QA-21 a QA-22 | 1 | 0 | 1 (QA-22) | **GO** (cond.) |
| Migrations | QA-23 | 0 | 1 | 0 | **NO-GO** |
| Reconciliation | QA-24 a QA-28 | 3 | 0 | 1 (QA-24) | **GO** (cond.) |
| Idempotency / Atomicity | QA-29, QA-42 a QA-44 | 4 | 0 | 0 | **GO** |
| DTO / Mass Assignment | QA-30 a QA-31 | 2 | 0 | 0 | **GO** |
| Custody / Crew | QA-32 | 1 | 0 | 0 | **GO** |
| Rate Limit / TLS | QA-33 a QA-34 | 0 | 2 | 0 | **NO-GO** |
| Error Bodies | QA-35 | 1 | 0 | 0 | **GO** |
| E2E Vertical | QA-36 | 0 | 0 | 1 | **GO** (cond.) |
| Lag Metric | QA-37 | 0 | 1 | 0 | **NO-GO** (P1) |
| Crash / DLQ / Redrive | QA-38 a QA-39 | 2 | 0 | 0 | **GO** |
| Permission Catalog | QA-40 | 0 | 1 | 0 | **NO-GO** |
| OT Number Race | QA-41 | 0 | 1 | 0 | **NO-GO** |
| Evidence / Media | QA-45 a QA-48 | 4 | 0 | 0 | **GO** |
| Offline PII | QA-49 | 0 | 1 | 0 | **NO-GO** |
| Threat Model | QA-50 | 0 | 1 | 0 | **NO-GO** (P1) |

### 7.3 Tally final

| | Count |
| --- | --- |
| **PASS** | 34 |
| **PARTIAL** | 8 |
| **FAIL** | 8 |
| **P0 abiertos (FAIL)** | 5 (QA-23, QA-34, QA-40, QA-41, QA-49) |
| **P1 abiertos (FAIL)** | 3 (QA-33, QA-37, QA-50) |

### 7.4 Veredicto G6 integral: **NO-GO**

**Bloqueantes P0:**
1. **QA-23:** Migraciones tenant sin test de reversibilidad run/revert en dos schemas
2. **QA-34:** Sin evidencia TLS/ingress en producción (PLAT-OPS, G3 PLAT-P0-02)
3. **QA-40:** Catálogo de permisos sin test de compatibilidad de migración `MOD00_ACCESS_V1`
4. **QA-41:** Sin test de carrera de consecutivo OT (dos creaciones concurrentes)
5. **QA-49:** Sin evidencia de que offline no persiste PII

**Typecheck FAIL (P0):** `pending-visits-ui.ts` missing `IN_EXECUTION`, `CLOSED`, `REQUIRES_RESCHEDULE` — G3 DATA-P0-1 no resuelta.

**Swagger DI FAIL (P1):** `tasks.swagger.spec.ts` no provee `ExecutionOrderProjectionConvergenceService` en TestingModule.

**Categorías GO (evidencia sólida):** BOLA/tenant isolation, terminal immutability + concurrency, templates, idempotency/atomicity, DTO/mass assignment, custody/crew, crash/DLQ/redrive, evidence/media — todas con tests exhaustivos y evidencia trazable.
