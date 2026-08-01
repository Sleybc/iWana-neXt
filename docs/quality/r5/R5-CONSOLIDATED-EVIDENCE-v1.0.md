# Consolidación R5 — Evidencia cruda de verificación

**Fecha:** 2026-07-31
**Agente:** AI-SR-QA
**Alcance:** QA-01 a QA-50 del checklist + Gates de merge AGENTS.md
**Estado:** Recolección de evidencia (no informe vivo)

---

## 1. RESULTADOS FRESCOS DE EJECUCIÓN

### 1.1 API Tests (apps/api)
- **Suites:** 228 passed, 4 skipped, 232 total
- **Tests:** 2,779 passed, 15 skipped, 2,794 total
- **Resultado:** **PASS** (0 failures)

### 1.2 Portal Tests (apps/portal)
- **Suites:** 169 passed, 169 total
- **Tests:** 1,070 passed, 1 skipped, 1,071 total
- **Resultado:** **PASS** (0 failures)

### 1.3 Worker Tests (apps/worker)
- **Suites:** 13 passed, 13 total
- **Tests:** 72 passed, 72 total
- **Resultado:** **PASS** (0 failures)

### 1.4 Database Package Migration Tests (packages/database)
- **Suites:** 13 passed, 13 total (pattern: `migrations`)
- **Tests:** 65 passed, 65 total
- **Resultado:** **PASS** (0 failures)

### 1.5 Lint (monorepo)
- **Errors:** 0
- **Warnings:** 39 (portal react-hooks/exhaustive-deps) + 6 (web) = 45 total
- **Resultado:** **PASS**

### 1.6 Typecheck (monorepo)
- **Packages:** 8/8 passed (all cached)
- **Resultado:** **PASS**
- **Nota:** El FAIL previo de `pending-visits-ui.ts` (IN_EXECUTION, CLOSED, REQUIRES_RESCHEDULE faltantes) está **RESUELTO** — el archivo ahora cubre los 10 estados de VisitRequestStatus en el Record exhaustivo.

### 1.7 Build (monorepo)
- **Packages:** 7 successful, 7 total (1 cached: config)
- **Resultado:** **PASS**

### 1.8 Cobertura — Tasks/Execution Orders (core MOD11)
| Métrica | % |
|---|---|
| Statements | 73.68% |
| Branch | 57.15% |
| Functions | 69.58% |
| Lines | 73.92% |

**Desglose por servicio/controller:**
| Archivo | % Stmts | ¿≥80%? |
|---|---|---|
| execution-orders.controller.ts | 86.41% | ✅ |
| tasks.controller.ts | 79.54% | ❌ (roza) |
| execution-order-access.guard.ts | 92.30% | ✅ |
| tenant-aware-throttler.guard.ts | 91.80% | ✅ |
| closure-gate-evaluator.service.ts | 91.04% | ✅ |
| execution-order-inventory-reconciliation.service.ts | 83.67% | ✅ |
| execution-order-inventory.service.ts | 38.46% | ❌ |
| execution-order-projection-convergence.service.ts | 85.71% | ✅ |
| execution-order-reliability.service.ts | 73.01% | ❌ |
| execution-order-templates.service.ts | 25.92% | ❌ |
| execution-orders.service.ts | 77.69% | ❌ (roza) |
| task-assignment.service.ts | 87.80% | ✅ |
| task-timeline.service.ts | 43.75% | ❌ |
| tasks.service.ts | 66.31% | ❌ |

**Overall: 73.68% — por debajo del umbral del 80% para módulos core.**

### 1.9 Vulnerabilidades (pnpm audit)
| Severidad | Count |
|---|---|
| Critical | 1 |
| High | 44 |
| Moderate | 46 |
| Low | 9 |

**Critical identificado:** CVE-2026-14257 (`brace-expansion` ≤5.0.7, DoS vía OOM). Transitive dependency.

---

## 2. MATRIZ QA-01 a QA-50 — RE-EVALUACIÓN R5

| ID | Riesgo/criterio | Previo | R5 | Evidencia fresca |
|---|---|---|---|---|
| QA-01 | Otro tenant no lee ni muta OT | PASS | **PASS** | 409 tasks tests pass; BOLA section intacta |
| QA-02 | UUID conocido sin alcance → no acceso | PASS | **PASS** | ABAC tests intactos |
| QA-03 | Coordinador sin execute no registra trabajo | PASS | **PASS** | Matriz permiso×rol intacta |
| QA-04 | Contratista asignado con permiso sí ejecuta | PASS | **PASS** | ABAC tests intactos |
| QA-05 | OT terminal inmutable | PASS | **PASS** | 4 estados × 5 mutaciones rechazadas |
| QA-06 | Cierre concurrente produce un resultado | PASS | **PASS** | Race condition tests intactos |
| QA-07 | Idempotency key no duplica actividad/evidencia | PASS | **PASS** | Idempotency tests intactos |
| QA-08 | Outbox y cambio de OT atómicos | PASS | **PASS** | Crash recovery tests intactos |
| QA-09 | Consumidor duplicado no revierte proyección | PASS | **PASS** | Out-of-order skip tests intactos |
| QA-10 | Job resuelve tenant explícitamente | PASS | **PASS** | Schema_name lookup tests intactos |
| QA-11 | Serial y custodia MOD12 | PARTIAL | **PARTIAL** | Sin cambio |
| QA-12 | Rechazo de inventario conciliable | PASS | **PASS** | Reconciliation service tests intactos |
| QA-13 | Plantilla publicada inmutable | PASS | **PASS** | Published version immutable tests intactos |
| QA-14 | Gate 422 enumera faltantes | PASS | **PASS** | 21 tests covering 6 tipos de requirement |
| QA-15 | Agenda no ejecuta ni cierra OT | PASS | **PASS** | ExecutionOrderExperience tests intactos |
| QA-16 | OT terminal no muestra inputs | PASS | **PASS** | CloseStep bloqueo tests intactos |
| QA-17 | No enum crudo/UUID prominente | PASS | **PASS** | aria-labelledby tests intactos |
| QA-18 | Estados loading/error/forbidden/stale/offline | PARTIAL | **PARTIAL** | Sin cambio |
| QA-19 | Foco, teclado, contraste, lector | PASS | **PASS** | a11y tests pasan |
| QA-20 | Responsive móvil y desktop | PARTIAL | **PARTIAL** | Sin cambio |
| QA-21 | Logs sin PII, payloads, firmas | PASS | **PASS** | PII tests intactos |
| QA-22 | OpenAPI coincide con HTTP real | PARTIAL | **PASS** ⬆ | `tasks.swagger.spec.ts`: 4/4 tests pasan |
| QA-23 | Migraciones tenant reversibles | FAIL | **PARTIAL** ⬆ | Migraciones 090-099 con tests de reversibilidad (13 suites DB, 65 tests unitarios, 23 tests integración real PostgreSQL). Downs con datos en `r2_4_down.integration.spec.ts` (091, 093, 094, 096). No todas las ~90 migraciones tienen test. |
| QA-24 | Reconciliador detecta divergencia | PARTIAL | **PARTIAL** | Sin fault injection directa |
| QA-25 | Corrección crea seguimiento, no reabre | PASS | **PASS** | CREATE_FOLLOW_UP tests intactos |
| QA-26 | Dos confirmaciones concurrentes → una OT | PASS | **PASS** | Race condition tests intactos |
| QA-27 | Cada resultado converge en OT/Task/Visit | PASS | **PASS** | 6 eventos × 3 entidades tests intactos |
| QA-28 | MOD12 confirma, MOD11 falla antes de guardar | PASS | **PASS** | Reconciliation PENDING/OK/REJECTED tests |
| QA-29 | Idempotency key + payload distinto → 409 | PASS | **PASS** | 409 IDEMPOTENCY_CONFLICT tests intactos |
| QA-30 | DTOs/auditoria minimizan PII | PASS | **PASS** | PII protection tests intactos |
| QA-31 | Mass assignment server-owned rechazado | PASS | **PASS** | Zod strict() tests intactos |
| QA-32 | Cuadrilla/custodia valida tipo, responsable | PASS | **PASS** | 4 tests crew/custody intactos |
| QA-33 | Rate limit efectivo por actor/tenant | FAIL | **PARTIAL** ⬆ | `tenant-aware-throttler.guard.spec.ts`: 2 tests pasan (rechaza sin Redis, 503 en mutación). Sin test E2E de 429. |
| QA-34 | Ingress efectivo protege TLS | FAIL | **FAIL** | Sin evidencia. Dominio PLAT-OPS. |
| QA-35 | Errores 403/404/409/422 body tipado | PASS | **PASS** | Error body tests intactos |
| QA-36 | E2E vertical con API y PostgreSQL reales | PARTIAL | **PARTIAL** | Sin cambio |
| QA-37 | Lag de reconciliación con umbral | FAIL | **PARTIAL** ⬆ | R3.3: `PlatformRelayTelemetry` expone outboxDepth, oldestPendingAgeSeconds, dlqSize, reconciliationDiscrepancies, lastScanAt real, lagDistributionSeconds (p50/p95/p99). `health.controller.ts:32-76` endpoint público. `execution-order-projection-convergence.service.ts:101-170` consulta SQL con `percentile_cont`. Umbral `lagThresholdStatus: 'sin umbral aprobado'`. |
| QA-38 | Crash-window outbox no pierde ni duplica | PASS | **PASS** | Crash recovery tests intactos |
| QA-39 | DLQ y re-drive preservan tenant/evento | PASS | **PASS** | DLQ audit tests intactos |
| QA-40 | Catálogo de permisos compatible sin sobreprivilegio | FAIL | **PASS** ⬆ | `092_seed_execution_order_permissions.spec.ts`: reversible, 7 entradas (6 canónicas + 1 alias), equivalencia MOD00 |
| QA-41 | Carrera del consecutivo no duplica número OT | FAIL | **PASS** ⬆ | `6b8f8460` — Integration `execution-orders.postgres.integration.spec.ts` (R2.3): `Promise.all` contra PostgreSQL real valida único OT para mismo `scheduleEventId` (sin 23505) y consecutivos únicos (Δ=1) para creaciones concurrentes. E2E 8b replica el flujo. Lock `pg_advisory_xact_lock` en `createFromSchedulingWithManager:498` + `generateExecutionOrderNumber:2448`. |
| QA-42 | Idempotencia, mutación, outbox y audit-intent atómicos | PASS | **PASS** | Crash-window atomicity tests intactos |
| QA-43 | Retención/expiración idempotencia no reejecutan | PASS | **PASS** | Tombstone y 409 EXPIRED tests intactos |
| QA-44 | Fallo audit-intent impide CUD, fallo entrega no pierde rastro | PASS | **PASS** | Audit-intent rollback + DLQ tests intactos |
| QA-45 | Evidencia ligada mismo tenant+OT, no reutilizable | PASS | **PASS** | Cross-tenant rejection tests intactos |
| QA-46 | Evidencia valida contenido y tiempo confiable | PASS | **PASS** | Polling PENDING_ANALYSIS/AVAILABLE/REJECTED tests |
| QA-47 | Matriz endpoint×permiso×ABAC exhaustiva | PASS | **PASS** | BOLA HTTP + ABAC tests intactos |
| QA-48 | Acceso directo a media reautoriza, no filtra storage | PASS | **PASS** | Signed URL sin objectKey/bucket tests intactos |
| QA-49 | Offline no persiste PII, firma ni evidencia | FAIL | **PARTIAL** ⬆ | R1: `ExecutionOrderDrawer.spec.tsx:1137-1151` (banner + botones offline). Components/operations sin localStorage/sessionStorage/IndexedDB. Portal solo tokens de sesión. `INFORME-MOD11-FLOW-CABLEADO-v1.0.md:310,418` — "ausencia de persistencia local" verificado. Falta test automatizado explícito de ausencia de PII en storage. |
| QA-50 | Threat model y ASVS L2 trazabilidad ejecutable | FAIL | **PARTIAL** ⬆ | `INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md:203-234` — STRIDE 6 vectores + ASVS L2 7 familias mapeadas a QA items. `INFORME-MOD11-R2.1-EVIDENCE-SECURITY-v1.0.md` documenta hallazgos. Falta confirmación final AI-SEC-ENG. |

### 2.1 Tally R5 (actualizado 2026-07-31 — R3 cross-check)

| | Count |
|---|---|---|
| **PASS** | 39 |
| **PARTIAL** | 10 |
| **FAIL** | 1 |

**P0 abiertos (FAIL):** QA-34 (TLS)
**P1 abiertos (FAIL):** 0

> **Cross-check R0–R3 (2026-07-31):** QA-37, QA-49 y QA-50 suben de FAIL a PARTIAL con base en evidencia R1 (offline storage audit), R2.1 (security evidence pipeline), R2.5 (rate limit), y R3.3 (outbox telemetry con distribución percentil). QA-23 se mantiene PARTIAL — cadena 089-099 con downs en PostgreSQL real pero no cobertura total de migraciones.

---

## 3. GATES DE MERGE (AGENTS.md) — VERIFICACIÓN R5

| Gate | Estado | Evidencia |
|---|---|---|
| No critical vulnerabilities | **FAIL** ❌ | 1 critical (CVE-2026-14257 brace-expansion), 44 high, 46 moderate. Dependencias transitivas. |
| No boundary violations | **PASS** ✅ | `tasks.boundary.spec.ts` (P0-3), `tax-boundary.spec.ts`, `inventory-parties-boundary.arch.spec.ts`, `expediente-boundary-dto.spec.ts` — todos pasan. |
| Tests ≥80% core modules | **FAIL** ❌ | Tasks module: 73.68% statements global. Servicios bajo 80%: templates (25.92%), inventory (38.46%), timeline (43.75%), reliability (73.01%), tasks.service (66.31%). |
| OpenAPI updated | **PASS** ✅ | `tasks.swagger.spec.ts`: 4/4 tests pasan. Swagger specs en 5 módulos. |
| Migrations reversible | **PARTIAL** ⚠️ | Migraciones execution-order (090-099) con tests de reversibilidad. ~90 migraciones totales, no todas con test de down. |
| No PII in logs | **PASS** ✅ | Tests de PII en respuestas de error y logs verificados. Audit interceptor redacta campos sensibles. |
| Lint and typecheck passing | **PASS** ✅ | Lint: 0 errors. Typecheck: 8/8 packages pass. |

### Gates adicionales (dominio QA)

| Gate | Estado | Evidencia |
|---|---|---|
| Multi-tenancy isolation | **PASS** ✅ | BOLA tests QA-01/QA-02, tenant isolation en JWT, schemas separados. |
| a11y WCAG 2.2 AA | **PASS** ✅ | QA-19 tests: aria-live, focus trap, contraste, teclado. Sin ruptura crítica. |
| UI en español | **PASS** ✅ | `operations-labels.spec.ts`, `pending-visits-ui.spec.ts`, `expediente-ui.spec.ts` verifican labels en español sin enums crudos. |
| Sin PII en fixtures/factories | **PASS** ✅ | Factories usan faker, sin credenciales reales. |
| Sin defectos críticos abiertos | **FAIL** ❌ | Coverage < 80%, 4 QA items en FAIL (2 P0, 2 P1), 1 critical vuln. |

---

## 4. VEREDICTO FINAL

### **NO-GO** 🚫 (mejorado — 1 FAIL restante)

**Bloqueantes estructurales:**
1. **Cobertura < 80%** en módulo core tasks (73.68%). Servicios críticos bajo umbral: templates (25.92%), inventory (38.46%), timeline (43.75%).
2. **1 vulnerabilidad critical** en dependencias transitivas (CVE-2026-14257, brace-expansion).
3. **QA-34 (TLS):** Sin evidencia de protección TLS/ingress — responsabilidad PLAT-OPS. **Único FAIL restante.**

**P1 resueltos a PARTIAL (cross-check R0–R3):**
- QA-37: Telemetría R3.3 completa con distribución percentil; umbral sin aprobar.
- QA-50: STRIDE/ASVS documentados con mapeo a QA items; pendiente confirmación SEC-ENG.

**Mejoras significativas desde auditoría anterior (2026-07-27):**
- ✅ QA-22 (OpenAPI) resuelto — swagger spec test ahora pasa.
- ✅ QA-40 (Permission catalog) resuelto — migración 092 con test de reversibilidad y equivalencia MOD00.
- ✅ Typecheck FAIL resuelto — `pending-visits-ui.ts` cubre los 10 estados VisitRequestStatus.
- ✅ QA-23 (Migraciones) mejora de FAIL a PARTIAL — migraciones 089-099 con downs en PostgreSQL real.
- ✅ QA-33 (Rate limit) mejora de FAIL a PARTIAL — guard test existe pero falta E2E de 429.
- ✅ QA-37 (Lag métrica) mejora de FAIL a PARTIAL — R3.3 telemetría completa.
- ✅ QA-49 (Offline PII) mejora de FAIL a PARTIAL — R1 storage audit + flow cableado.
- ✅ QA-50 (Threat model) mejora de FAIL a PARTIAL — STRIDE/ASVS documentados.

**Neto vs auditoría anterior (2026-07-27):**
- PASS: 35 → 39 (+4)
- PARTIAL: 8 → 10 (+2 neto: +4 FAIL→PARTIAL, −2 PARTIAL→PASS QA-22/QA-40)
- FAIL: 7 → 1 (−6: QA-23→PARTIAL, QA-33→PARTIAL, QA-37→PARTIAL, QA-40→PASS, QA-49→PARTIAL, QA-50→PARTIAL)

**Neto vs R5 inicial (2026-07-31):**
- PASS: 37 → 39 (+2: QA-22/QA-40 ya estaban en el tally R5 pero no reflejados en la matriz del checklist)
- PARTIAL: 9 → 10 (+3: QA-37/QA-49/QA-50; −2: QA-22/QA-40→PASS)
- FAIL: 4 → 1 (−3: QA-37/QA-49/QA-50)

---

*Archivo generado por AI-SR-QA el 2026-07-31. No es un informe vivo; es evidencia intermedia para consolidación R5.*
