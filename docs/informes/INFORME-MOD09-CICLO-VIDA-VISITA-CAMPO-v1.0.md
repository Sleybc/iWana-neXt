# INFORME-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0

**Módulos:** MOD09 Programación / WFM · MOD11 Ejecución Operativa · MOD10 Assurance · MOD05 CRM
**Plan ejecutado:** [PROMPT-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0.md](../prompts/PROMPT-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0.md)
**Fecha:** 2026-08-04
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Agentes ejecutores:** AI-SR-QA (F0, F6 QA-red/green), AI-SR-FULL (F1–F4, F6 backend), AI-FE-PLATFORM (F5, F6 frontend)
**Estado:** Hotfix N1/N2 **cerrado en local** (2026-08-05): migración `107` aplicada en 10 tenants; `EXPIRED` verificado en Postgres. G6 calidad GO. G6.5 suspendido. PR [#4](https://github.com/SleyiW/iWana-neXt/pull/4) tip `f601c0cc`.

---

## 0. Auditoría post-ejecución (2026-08-05) — AI-EM-ARCH

**Modo:** Mixto (Architect + EM + Orchestrator). Fuente: auditoría defect-first aportada a la sesión; hallazgos verificados en código (`visit-requests.service.ts`, `expired-schedule-events.processor.ts`, `UnrealizedVisitsView.tsx`, `pending-visits-ui.ts`, ADR-077 D3/D4/D7).

### Veredicto

| Severidad | ID | Hallazgo | Decisión |
| --- | --- | --- | --- |
| Bloqueante | **B1** | `getEffectiveVisitRequestStatus` / enrich / SQL degradan `REQUIRES_RESCHEDULE` → `READY_TO_SCHEDULE`; chip de reintento imposible en producción; filtros mezclan reintentos con nuevas | **Aceptado.** Reabre H1 con defecto. Viola ADR-077 *(propuesto)* D3. |
| Bloqueante | **B2** | Barrido marca `EXPIRED` y deja VR en `SCHEDULED` sin camino de decisión que la vuelva reprogramable (early-return / cancel / review) | **Aceptado.** Reabre V3 y parte de H2. D7 del barrido es correcto; falla el camino humano de destino. |
| Bloqueante | **B3** | `UnrealizedVisitsView` sin `page.tsx` / ruta | **Aceptado.** H2 no cerrado en la práctica. |
| Bloqueante | **B4** | `retryCount >= 3` → `BadRequestException` sin override | **Aceptado.** Viola ADR-077 *(propuesto)* D4 y spec E5. |
| Alto | **A1** | `(NOW() AT TIME ZONE $tz)::timestamptz` distorsiona el vencimiento | **Aceptado.** |
| Alto | **A2** | `findOne` por tenant sin filtrar solicitud + `as any` + resultado descartado | **Aceptado.** Eliminar en B4. |
| Alto | **A3** | `notes` del review validadas y no persistidas | **Aceptado.** |
| Medio | — | F0.5/F0.6 solo vía specs heredados; cobertura ≥80% no instrumental; `hashtext` int4 | Deuda media registrada; no bloquea remediación B1–B4. |

### Estado real vs declarado (vectores)

| Ref | Informe F0–F5 | Tras auditoría | Tras remediación F6 (QA-green) |
| --- | --- | --- | --- |
| V1, V5, V6, V8 | Cerrado | Cerrado ✓ | Cerrado ✓ |
| V4, H3 | Cerrado | Cerrado ✓ | Cerrado ✓ |
| H1 | Cerrado | **Reabierto (B1)** | **Cerrado** — emisión preserva `REQUIRES_RESCHEDULE` (CA-R1) |
| V3 | Cerrado | **Reabierto (B2)** | **Cerrado** — barrido D7 + review Reprogramar/Cerrar (CA-R2) |
| H2 | Cerrado | **No cerrado (B2+B3)** | **Cerrado en código (hotfix N1)** — migración 107; requiere `migration:tenant:run` en cada entorno |
| V2 | Diferido | Diferido | Diferido |

**Causa sistémica de falsos verdes (auditoría):** tests de portal inventaban `REQUIRES_RESCHEDULE` que la API no emitía; worker no asertaba VR ni decisión humana. Remediación: contratos tipados + cadena worker (pre) → review API (post).

**G6 remediación:** **GO** (CA-R1…CA-R7, 2026-08-05). **G6.5:** **SUSPENDIDO**. **Hotfix N1/N2** (2026-08-05): ver §0.1. **G7:** pendiente.

### 0.1 Auditoría hotfix — enum EXPIRED + motivo de cierre (2026-08-05)

Fuente: auditoría aportada a la sesión. AI-EM-ARCH **acepta** N1/N2.

| ID | Sev | Hallazgo | Decisión / remediación |
| --- | --- | --- | --- |
| **N1** | Bloqueante | `ScheduleEventStatus.EXPIRED` en TS sin valor en enum Postgres `schedule_event_status` → barrido falla siempre | Migración tenant `107_add_schedule_event_status_expired.ts` (`ADD VALUE IF NOT EXISTS 'EXPIRED'`). **H2 reabre hasta evidencia de migración+tests.** |
| **N2** | Medio | `CLOSE_CASE` en `scheduleVisitRequest` usaba `cancelReason` fijo sin motivo del coordinador | Exigir `closeReason` (Zod + servicio); persistir en `cancelReason`. Spec E5 CA3. |

Prompt: [PROMPT-MOD09-HOTFIX-ENUM-EXPIRED-CLOSE-REASON-v1.0.md](../prompts/PROMPT-MOD09-HOTFIX-ENUM-EXPIRED-CLOSE-REASON-v1.0.md).

**Estado hotfix código:** N1 y N2 implementados (`f601c0cc`). Tests unitarios PASS. **Migraciones tenant aplicadas** en local (2026-08-05): 10/10 schemas OK (`pnpm --filter @iwana/db migration:tenant:run`), enum `EXPIRED` verificado en `tenant_iwana`.

### Remediación F6 — avance de tracks (2026-08-05)

| Track | Agente | Estado |
| --- | --- | --- |
| QA-red | AI-SR-QA | **Cerrado** — suites de contrato B1–B4/A1/A3 en verde como regresión. No es G6. |
| Backend | AI-SR-FULL | **Cerrado** — B1/B2/B4/A1–A3; migración tenant `106_add_schedule_event_review_notes.ts`; gracia barrido `EXPIRED_SCHEDULE_EVENTS_GRACE_MINUTES` (default 15). |
| Frontend | AI-FE-PLATFORM | **Cerrado** — ruta `/dashboard/scheduling/unrealized-visits`; E5 cableado; `attemptDecision`/`decision` tipados. |
| QA-green | AI-SR-QA | **Cerrado** — Task 6: CA-R1…CA-R7 GO; suites API/worker/portal `--no-cache` en verde; cobertura WFM **no verificada**; informe §3/§6/§7/§8 actualizado. **No** declara G6.5. |
| Hotfix N1/N2 | AI-EM-ARCH (ejecución directa) | **Cerrado en local** — migración 107 + closeReason; `migration:tenant:run` 10/10 tenants |

**Contrato DTO congelado (post QA-red ↔ SR-FULL + hotfix N2):**

- Agendar: `attemptDecision: 'FORCE_RESCHEDULE' \| 'CLOSE_CASE'` (+ `closeReason` obligatorio si CLOSE_CASE)
- Review E2: `decision: 'RESCHEDULE' \| 'CLOSE_CASE'`
- Notes de coordinador → columna/campo `reviewNotes`

#### Evidencia QA-green (Cached: 0 / `--no-cache`, 2026-08-05)

| Paquete | Patrón | Suites | Tests | Resultado |
| --- | --- | --- | --- | --- |
| `@iwana/api` | `visit-requests.(remediacion\|service\|fase)` + `schedule-events.service` + `non-realization` | 6 | 100 | PASS |
| `@iwana/api` (WFM completo, intento cobertura) | `modules/wfm` | 18 | 218 | PASS; cobertura **Unknown% (0/0)** → **no verificada** |
| `@iwana/worker` | `expired-schedule-events` | 1 | 9 | PASS |
| `@iwana/portal` | UnrealizedVisitsView + ExhaustedAttemptsDecisionDialog + pending-visits-ui + PendingVisitRequestsView | 4 | 13 | PASS |

Checklist CA-R1…CA-R7: ver §8 (todos GO). Residual: sin smoke unitario del `page.tsx` App Router (ruta verificada por inspección + montaje de vista + enlaces nav); sin corrida Linux CI.

---

## 1. Resumen de ejecución

| Fase | Agente | Resultado | Puerta |
| --- | --- | --- | --- |
| F0 — Red de seguridad | AI-SR-QA | 4 tests nuevos, 6/6 escenarios cubiertos (F0.5–F0.6 cubiertos por tests heredados del worker) | GO |
| F1 — Desbloquear y cerrar ciclos | AI-SR-FULL | 55 tests, H1+V3+V4+H3 cerrados | GO |
| F2 — Causa, intentos y SLA | AI-SR-FULL | 192 tests, 19 tests nuevos SLA, taxonomía de causas semillada | GO |
| F3 — Guarda de unicidad | AI-SR-FULL | 201 tests, advisory lock + FOR UPDATE + visita adicional + normalización originRef | GO |
| F4 — Hacer visible el silencio | AI-SR-FULL | 259 WFM + 259 Assurance + 99 Worker tests, H2+V8 cerrados | GO |
| F5 — Portal | AI-FE-PLATFORM | 300 tests portal, 7 ítems de UI implementados | GO |

---

## 2. Evidencia de tests (Cached: 0 en todas las corridas)

| Paquete | Suites | Tests | Caché |
| --- | --- | --- | --- |
| `apps/api` (WFM + Assurance + Tasks) | 46 | 740 | `--no-cache` |
| `apps/api` (completo) | 232/237 | 2891/2927 | `--no-cache` |
| `apps/worker` | 15 | 99 | `--no-cache` |
| `apps/portal` | 169 | 1081 | `--no-cache` |

> La suite `common/pagination/clamp-page-endpoints.controller.http.spec.ts` presenta **1 fallo preexistente** (21 tests) por error de resolución de dependencias NestJS en TestingModule. No está relacionado con los módulos tocados por este plan y no es regresión.

### Fase 0 — 6 tests de red en verde

- F0.1 reinstalar tras cancelar ✓
- F0.2 dos tickets mismo suscriptor → dos visitas ✓
- F0.3 dos tickets mismo nodo → dos trabajos ✓
- F0.4 trabajo manual sin ticket no bloqueado ✓
- F0.5 matriz convergencia ADR-068 cubierta (worker spec) ✓
- F0.6 visita ejecutada normalmente cierra CLOSED ✓

### Tests de concurrencia (F3)

Test de advisory lock + 409 con cuerpo `{ error: 'DUPLICATE_ACTIVE_WORK', originRef, activeVisitRequestId }`.

### Test SLA sin reinicio (Puerta 2)

`"PUERTA 2: SLA nunca se reinicia — PAUSE no es reinicio, CONTINUE no modifica"` — 4 escenarios (CUSTOMER con/sin evidencia, OPERATIONAL, FORCE_MAJEURE). `"PUERTA 2: el contador nunca baja"` — OPERATIONAL→CUSTOMER sube, CUSTOMER→OPERATIONAL no baja.

### Test reagendar no activa guarda (F3.5)

`"F3.5 REQUIRES_RESCHEDULE no activa guarda"` — sin advisory lock al reagendar.

---

## 3. Vectores y huecos (V1–V8, H1–H3)

| Ref | Estado | Fase | Evidencia |
| --- | --- | --- | --- |
| V1 | **Cerrado** | F3 | Guarda por advisory lock en createVisitRequest + scheduleVisitRequest, 409 con referencia operativa |
| V2 | **Diferido** | — | Sync del expediente: no forma parte de este plan (endurecimiento MOD05). Se registra como deuda técnica baja |
| V3 | **Cerrado** | F1.2/F1.4 + **F6/B2** | Barrido solo marca EXPIRED (D7, worker spec); review `decision: RESCHEDULE\|CLOSE_CASE` saca VR de `SCHEDULED`; schedule con evento vencido → 400 explícito (no early-return silencioso) |
| V4 | **Cerrado** | F1.3 | moveToPending separa reprogramación planificada de intento fallido |
| V5 | **Cerrado** | F3.1, F3.2 | Advisory lock al inicio de transacción + bloqueo pesimista FOR UPDATE |
| V6 | **Cerrado** | F3.4 | Normalización trim() de originRef en persistencia y comparación SQL |
| V8 | **Cerrado** | F4.2, F4.3 | Puerto FieldServiceWorkPort (MOD10→MOD09) + requestFieldService idempotente |
| H1 | **Cerrado** | F1.1 + **F6/B1** | `getEffectiveVisitRequestStatus` / enrich / SQL no degradan `REQUIRES_RESCHEDULE`; chip con status de contrato tipado (CA-R1) |
| H2 | **Cerrado (código; N1)** | F4.1 + F6 + **107** | Enum Postgres `EXPIRED` + ruta E2; aplicar migraciones tenant en cada entorno para efecto runtime |
| H3 | **Cerrado** | F1.3 | Intentos fallidos dejan rastro en evento (nonRealizationCauseId, causeReportedAt, evidenceSubmitted) |

**Cerrados:** 9/10 · **Diferido:** 1/10 (V2) · Remediación F6: B1–B4 / A1–A3 pagados (ver §6)

---

## 4. Archivos modificados/creados

**41 modificados**, **19 creados** en 5 paquetes:

| Paquete | Modificados | Creados |
| --- | --- | --- |
| `apps/api` | 19 | 8 |
| `apps/worker` | 2 | 2 |
| `apps/portal` | 11 | 1 |
| `packages/database` | 4 | 4 |
| `packages/shared` | 3 | 1 |
| `docs/` | 2 (borrado + nuevo) | 3 |

### Migraciones nuevas

| Archivo | Propósito |
| --- | --- |
| `102_add_visit_request_retry_count.ts` | Columna `retry_count INT NOT NULL DEFAULT 0` |
| `103_create_non_realization_causes.ts` | Tabla `non_realization_causes` + semillas |
| `104_add_non_realization_fields_to_schedule_events.ts` | Columnas de clasificación, evidencia y `slaPausedAt` |
| `105_add_visit_request_additional_reason.ts` | Columna `additional_reason TEXT` |
| `106_add_schedule_event_review_notes.ts` | Columna `review_notes TEXT` (A3 — notes del coordinador) |
| `107_add_schedule_event_status_expired.ts` | `ALTER TYPE schedule_event_status ADD VALUE IF NOT EXISTS 'EXPIRED'` (N1 / H2) |

---

## 5. Fuera de este plan (endurecimiento diferido)

Según §"Fuera de este plan" del prompt:

- **Índice único sobre `schedule_events`** (ADR-076 D2.3): condicionado a producción de Fases 1–4 + migración de limpieza por tenant
- **Indicador derivado en listado, filtro "trabajo activo", bloque de trabajos relacionados** (antiduplicación §6, §7, §9): exige ampliar contrato de listado
- **Métricas y tableros de causa raíz**: dato capturado, explotación en fase aparte

---

## 6. Deuda técnica registrada

| Severidad | Descripción | Ref |
| --- | --- | --- |
| ~~Crítica~~ **Pagada** | B1–B4 — remediados en F6; evidencia QA-green CA-R1…CA-R4/CA-R7 | PROMPT-MOD09-REMEDIACION… |
| ~~Crítica (hotfix)~~ **Pagada en código** | N1 — `EXPIRED` en Postgres (`107`); falta aplicar migraciones en entornos | Hotfix N1 |
| ~~Alta~~ **Pagada** | A1 timezone+gracia; A2 sin `as any` en camino límite/review; A3 `reviewNotes` + migración 106 | Remediación F6 / CA-R5–CA-R6 |
| ~~Media (hotfix)~~ **Pagada** | N2 — `closeReason` obligatorio en CLOSE_CASE (schedule) | Hotfix N2 |
| Media | F0.5/F0.6 no como tests nuevos dedicados (Puerta 0 parcial); cobertura ≥80% WFM **no verificada** (Jest coverage Unknown% 0/0 en intento QA-green) | Auditoría 2026-08-05 + QA-green |
| Media | `hashtext` int4 — posible colisión de advisory lock entre originRef distintos (solo serialización extra) | F3 |
| Baja | Sin smoke unitario del `page.tsx` App Router de unrealized-visits (ruta + montaje de vista + enlaces sí verificados) | CA-R3 residual |
| Baja | V2 — sync del expediente falla en silencio dentro de mensaje de éxito (no parte de este plan) | scheduling-visit-request-sync.ts:58-70 |
| Baja | Índice único `schedule_events` pendiente de migración de limpieza | ADR-076 D2.3 |
| Baja | Métricas de causa raíz sin dashboard (dato capturado, sin explotación) | Prompt §Fuera de este plan |
| Baja | closeNotes usado para almacenar `cancellationReason` en vez de columna dedicada | F1.4 |

---

## 7. Notas de verificación pendiente

- **Verificación en navegador de F5.2 a 375 px con una mano, y de F5.3–F5.5 en escritorio, claro y oscuro** (Puerta 5): los tests unitarios pasan (300/300). La verificación visual en navegador real corresponde a E2E/QA.
- **G6 remediación (calidad F6):** **GO** recomendado por AI-SR-QA y **ratificado por AI-EM-ARCH** (2026-08-05) — CA-R1…CA-R7 con suites `--no-cache` en verde. No equivale a merge readiness.
- **G6.5 (merge readiness):** **NO-GO / BLOQUEADO** (AI-PLAT-OPS, 2026-08-05) — precondiciones incumplidas para [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) (Aprobado). Veredicto formal y desbloqueo: §7.1. Resumen:
  1. Remediación F0–F6 **sin commit** en working tree sobre `main`; HEAD local/remoto `59b057a5` **no** incluye el trabajo. ADR-069 prohíbe usar un push futuro como evidencia de una corrida que aún no ocurrió.
  2. CI (`.github/workflows/ci.yml`) solo dispara en `push` / `pull_request` a `main` — hace falta commit + push de rama/PR para materializar SHA y run.
  3. `gh` CLI **ausente** en este entorno (PATH + Program Files / LocalAppData / scoop / WindowsApps — sin `gh.exe`). No se listaron runs; **no** se reutiliza CI histórico MOD11 (`1343d6b8` / run #112) como evidencia de esta remediación.
  - **Desbloqueo (exacto):** commit de la remediación → push de rama o PR a `main` → corrida verde de jobs `production-images` y `execution-orders-e2e` sobre **ese** SHA → rellenar §7.1 → reactivar AI-PLAT-OPS para G6.5 GO.
- **G7 (producción):** pendiente de aprobación del CTO. **No evaluado** en esta activación PLAT-OPS.
- **Cobertura ≥80% WFM**: **no verificada** en QA-green (intento con `--coverage` → summary Unknown% 0/0; no se finge umbral).

### 7.1 Plantilla de evidencia G6.5 (AI-PLAT-OPS) — lista para rellenar

> **Estado actual:** campos en `PENDIENTE`. No inventar corrida. Solo conteos, SHA, plataforma, duración y cleanup — nunca tokens, cookies, reportes brutos ni payloads (ADR-069).

| Campo | Valor |
| --- | --- |
| Gate | G6.5 Merge readiness (ADR-069) |
| Veredicto | **NO-GO / BLOQUEADO** (actualizar a GO solo con corrida real verde) |
| Fecha evaluación PLAT-OPS | 2026-08-05 |
| HEAD local al evaluar | `59b057a5` (`main` = `origin/main`) |
| SHA de remediación (commit que incluye F6) | `PENDIENTE` — working tree dirty / untracked; **no** es `59b057a5` |
| ¿SHA remoto contiene remediación? | **No** |
| Workflow | `.github/workflows/ci.yml` (`name: CI`) |
| Triggers | `push` → `main`; `pull_request` → `main` |
| Run URL | `PENDIENTE` — p. ej. `https://github.com/SleyiW/iWana-neXt/actions/runs/<run_id>` |
| Run ID / attempt | `PENDIENTE` / `PENDIENTE` |
| Plataforma runner | Linux (`ubuntu-latest` / `ubuntu-24.04` según job) |
| `gh` disponible en estación | **No** (re-verificar tras instalar; o leer Actions UI) |

#### Jobs requeridos (confirmados en `ci.yml`)

| Job id | Display name | Resultado | Notas |
| --- | --- | --- | --- |
| `production-images` | Build y validación de imágenes production | `PENDIENTE` | Build api/web/portal/worker/migrator + smoke migrator + `docker compose … config --quiet` overlay prod. Sin secretos; tags `iwana-ci/*:${GITHUB_SHA}`. |
| `execution-orders-e2e` | E2E operativo R4.1 — API + storage + BullMQ reales | `PENDIENTE` | Runner `ubuntu-24.04`, timeout 35 min, `E2E_CLEANUP=true`. |

#### Artefacto resumen E2E (sanitizado)

| Campo | Valor |
| --- | --- |
| Artifact name | `e2e-r41-summary` |
| Path en runner | `/tmp/e2e-summary/` → archivo `e2e-r41-summary.txt` |
| Contenido permitido | workflow, run_id/attempt, commit/ref/event, runner OS/arch, node/pnpm, timestamp UTC, conclusiones de jobs del run, outcomes de pasos e2e/verify/docker-logs, marcadores `E2E_*` no secretos |
| Prohibido archivar | tokens, cookies, `test-results/`, `playwright-report/` crudos, envs, payloads |

#### Criterios de aceptación E2E (marcadores — ausencia = fallo)

| Criterio | Umbral / valor esperado | Valor observado |
| --- | --- | --- |
| `E2E_SETUP` | `OK` | `PENDIENTE` |
| Playwright passed | ≥ 29 (`REQUIRED_OPERATIONAL_E2E_PASSED`) | `PENDIENTE` |
| failed / skipped / did-not-run / flaky | todos `0` | `PENDIENTE` |
| `E2E_PLAYWRIGHT_EXIT` | `0` | `PENDIENTE` |
| `E2E_PLAYWRIGHT_DURATION_MS` / `E2E_TOTAL_DURATION_MS` | registrar ms | `PENDIENTE` |
| `E2E_CLEANUP` | `OK` (no `FAILED` / `DISABLED` / ausente) | `PENDIENTE` |
| Safety-net compose | `docker compose … -p iwana-e2e-r41 down --remove-orphans --volumes` (`if: always()`) | `PENDIENTE` (implícito si job completa verify+cleanup steps) |

#### Checklist de cierre G6.5 (cuando exista corrida)

- [ ] Commit + push/PR de remediación MOD09 F6 sobre SHA distinto de `59b057a5`
- [ ] Run Actions Linux verde: `production-images` = success
- [ ] Run Actions Linux verde: `execution-orders-e2e` = success
- [ ] Artefacto `e2e-r41-summary` descargado / leído (solo resumen sanitizado)
- [ ] Conteos E2E ≥29 passed, 0 failed/skipped/did-not-run/flaky; `E2E_SETUP=OK`; `E2E_CLEANUP=OK`
- [ ] Esta tabla rellenada con run URL + SHA + duración + cleanup
- [ ] Veredicto actualizado a **GO** por AI-PLAT-OPS (sin declarar G7)

**Anti-patrones (rechazo ADR-069):** reutilizar CI #112 / SHA `1343d6b8` (MOD11); declarar GO por cableado sin corrida; inventar run_id; mezclar G6.5 con autorización productiva (G7).

---

## 8. Notas orquestador

- **ADR-076 y ADR-077** fueron **aprobados por el CTO el 2026-08-05** en su totalidad, sin cambios de contenido: solo se actualizó el estado a `Aprobado` y se retiraron los marcadores `(propuesto)` de las citas, que dejaron de corresponder. La aprobación se emite sobre la implementación ya auditada. El endurecimiento diferido de ADR-076 D2.3 (índice único sobre `schedule_events`) queda aprobado en su decisión pero **no ejecutado**, sujeto a sus condiciones de aplicabilidad.
- **Specs UX** (`2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md`, `2026-08-04-mod09-visita-no-realizada-ux-spec.md`) están en estado `Propuesta — pendiente de aprobación del CTO`. Fase 5 fue implementada contra ellas por estar referenciadas en el prompt autorizado.
- El subagente AI-SR-QA produjo archivos sin texto de retorno en la sesión; el defecto se mitigó delegando fases posteriores con prompts más dirigidos y exploración previa.
- Latencia de gates F0–F5: 0. **Post-auditoría:** remediación F6 completada (QA-red → Backend ∥ Frontend → QA-green). **G6 remediación GO** ratificado por EM-ARCH. **G6.5 suspendido** por orden del usuario antes de consolidar CI (ver §9). G7 no evaluado.
- **`[DESEMPATE]` B1:** agendabilidad de `REQUIRES_RESCHEDULE` ≠ degradar status emitido. Helper de “¿se puede agendar?” separado de enrich/list.
- **`[DESEMPATE]` B2:** D7 del barrido se mantiene (no decide). El cierre del callejón es el camino E2 (Reprogramar/Cerrar) sobre `EXPIRED`, no auto-transicionar VR en el job.

### Checklist CA remediación (QA-green)

| ID | Veredicto | Evidencia |
| --- | --- | --- |
| CA-R1 | **GO** | `visit-requests.remediacion-auditoria.spec.ts` (GET/list/filtro/agendar); `pending-visits-ui.spec.ts` + UnrealizedVisitsView chip con `REQUIRES_RESCHEDULE` tipado |
| CA-R2 | **GO** | Worker: EXPIRED sin tocar VR (D7); `schedule-events` review RESCHEDULE→`REQUIRES_RESCHEDULE` / CLOSE→`CANCELLED`; `visit-requests.service.spec` 400 si agendar con evento vencido |
| CA-R3 | **GO** | `page.tsx` monta `UnrealizedVisitsView`; enlaces en `SchedulingClient` + `PendingVisitRequestsView`; spec montaje vista. Residual baja: sin smoke del page App Router |
| CA-R4 | **GO** | API `attemptDecision` FORCE/CLOSE + 400 accionable; `ExhaustedAttemptsDecisionDialog` + cableado en pendientes/unrealized |
| CA-R5 | **GO** | Worker SQL `scheduled_end_at < NOW() - ($1…)` sin `AT TIME ZONE`; gracia `EXPIRED_SCHEDULE_EVENTS_GRACE_MINUTES` (default 15) |
| CA-R6 | **GO** | Persistencia `reviewNotes` + migración 106; cero `as any` en `visit-requests.service.ts` / `schedule-events.service.ts` |
| CA-R7 | **GO** | 100+9+13 (+218 WFM) PASS `--no-cache`; cadena pre-barrido (worker) + post-decisión (review API) |

---

## 9. Cronología de sesión y suspensión (2026-08-05) — AI-EM-ARCH

**Modo:** EM + Orchestrator. **Motivo de cierre de sesión operativa:** el usuario ordenó detener el proceso (percepción de bucle en vigilancia G6.5). Subagentes PLAT-OPS interrumpidos. Sin más polls.

### 9.1 Qué se pidió

1. Asumir AI-EM-ARCH, desplegar protocolo multiagente sobre auditoría defect-first (B1–B4, A1–A3) del ciclo de vida de visita campo.
2. Continuar a G6.5 tras G6 GO.
3. CTO autorizó commit + push/PR.
4. Detener proceso / detener subagente restante y generar informe de lo ocurrido.

### 9.2 Qué ocurrió (secuencia)

| # | Evento | Resultado |
| --- | --- | --- |
| 1 | Auditoría aceptada; H1/V3/H2 reabiertos; G6 NO-GO | Prompt + plan F6 emitidos |
| 2 | Tracks: QA-red · Backend · Frontend en paralelo | B1–B4 / A1–A3 implementados |
| 3 | QA-green (CA-R1…CA-R7) | **G6 remediación GO** (EM-ARCH ratifica) |
| 4 | Intento G6.5 | Bloqueado: working tree sin commit; `gh` ausente |
| 5 | Autorización CTO → commit + push + PR | Rama `feat/mod09-ciclo-vida-visita-campo`; [PR #4](https://github.com/SleyiW/iWana-neXt/pull/4) |
| 6 | Fallo job ADR citations | 10 citas ADR-076/077 sin `(propuesto)` → fix push `3f514287` |
| 7 | Vigilancia CI (PLAT-OPS) | Usuario detiene por bucle; agentes interrumpidos |
| 8 | Esta sección | Estado **SUSPENDIDO**; G6.5 **sin veredicto consolidado** |

### 9.3 Commits en la rama (tip al suspender)

| SHA | Mensaje |
| --- | --- |
| `7343e0bb` | feat(wfm): ciclo de vida de visita no realizada y remediación F6 |
| `5669d98a` | docs(wfm): plantilla G6.5 y bloqueo precondiciones CI Linux |
| `2c2ae50b` | docs(wfm): registrar PR #4 y SHA para gate G6.5 |
| `3f514287` | fix(docs): marcar ADR-076/077 como (propuesto) en citas de remediación |

**Tip al suspender:** `3f514287da7a827c45c0a770c563a818b297e9c1` · tracking `origin/feat/mod09-ciclo-vida-visita-campo`.

### 9.4 Tracks / subagentes

| Rol | Estado al suspender |
| --- | --- |
| AI-SR-QA (red + green) | Cerrado |
| AI-SR-FULL (backend F6) | Cerrado |
| AI-FE-PLATFORM (frontend F6) | Cerrado |
| AI-PLAT-OPS (prep + watch CI) | **Interrumpido** por orden del usuario — no declarar G6.5 |

### 9.5 Gates al suspender

| Gate | Estado |
| --- | --- |
| G6 (calidad remediación F6) | **GO** |
| G6.5 (merge readiness) | **SUSPENDIDO** — sin evidencia §7.1 rellenada; no inventar corrida |
| G7 (producción) | No iniciado |

### 9.6 Cómo retomar (sin bucle)

1. Revisar estado del [PR #4](https://github.com/SleyiW/iWana-neXt/pull/4) en Actions (una sola consulta o watch humano).
2. Si `production-images` + `execution-orders-e2e` verdes sobre tip del PR → rellenar §7.1 y declarar G6.5 GO (una pasada PLAT-OPS, sin poll infinito).
3. Si fallan → registrar causa en §7.1 y abrir remediación puntual.
4. No reactivar vigilancia continua salvo petición explícita del CTO.

### 9.7 Nota sobre el “bucle”

La sensación de bucle vino de: (a) retorno stale de PLAT-OPS prep tras el desbloqueo ya hecho; (b) re-despacho de vigilancia CI; (c) notificaciones de cierre de tracks en cascada. **No hubo reimplementación de F6.** La suspensión corta solo el carril G6.5/orquestación activa.
