# MOD09 Remediación auditoría ciclo de vida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar bloqueantes B1–B4 y altos A1–A3 de la auditoría 2026-08-05 para que el ciclo de visita no realizada sea operable API→worker→portal conforme a ADR-077 *(propuesto)* D3/D4/D7.

**Architecture:** Separar agendabilidad de proyección de status; el barrido solo marca `EXPIRED`; la decisión humana (vista E2 / review) mueve la VisitRequest; el límite de 3 intentos exige override explícito; montar la ruta de revisión.

**Tech Stack:** NestJS + TypeORM + BullMQ + Next.js App Router + Jest — según `docs/prds/Stack_Tecnologico.md`.

**Prompt de ejecución:** [PROMPT-MOD09-REMEDIACION-AUDITORIA-CICLO-VIDA-v1.0.md](../prompts/PROMPT-MOD09-REMEDIACION-AUDITORIA-CICLO-VIDA-v1.0.md)

---

## File map

| Área | Archivos principales |
| --- | --- |
| Status API | `apps/api/src/modules/wfm/services/visit-requests.service.ts` |
| Review / destino | `apps/api/src/modules/wfm/services/schedule-events.service.ts`, DTOs review |
| Barrido | `apps/worker/src/processors/expired-schedule-events.processor.ts` (+ spec) |
| Portal ruta | `apps/portal/src/app/dashboard/scheduling/unrealized-visits/page.tsx` (nuevo), nav/enlaces |
| Chip / decisión UI | `pending-visits-ui.ts`, `PendingVisitRequestsView` / detail, `UnrealizedVisitsView.tsx` |
| Informe | `docs/informes/INFORME-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0.md` |

---

### Task 1: QA — tests rojos de contrato (B1)

**Files:**
- Modify/Create: specs bajo `apps/api/src/modules/wfm/services/` y/o `tests/`
- Modify: `apps/portal` specs de chip si asumen status imposible vía API

- [ ] **Step 1:** Escribir test HTTP/unit que falle hoy: GET VR `REQUIRES_RESCHEDULE` no debe emitir `READY_TO_SCHEDULE`
- [ ] **Step 2:** Test de filtro: ready ≠ requires_reschedule
- [ ] **Step 3:** Correr y confirmar RED

### Task 2: Backend — B1 separar agendabilidad de enrich

**Files:**
- Modify: `visit-requests.service.ts` (`getEffectiveVisitRequestStatus`, `enrichVisitRequest`, `buildEffectiveStatusSql`)
- Modify: specs que esperaban degradación (actualizar al contrato D3)

- [ ] **Step 1:** Introducir `isSchedulableVisitRequestStatus` (o equivalente) sin degradar emisión
- [ ] **Step 2:** `enrich` / list emiten status persistido
- [ ] **Step 3:** SQL de filtro no convierte `REQUIRES_RESCHEDULE` → `READY_TO_SCHEDULE`
- [ ] **Step 4:** Verde en tests de Task 1

### Task 3: QA — tests rojos B2/B4/A1/A3

- [ ] **Step 1:** Worker: tras sweep, asertar VR sigue `SCHEDULED` y evento `EXPIRED`
- [ ] **Step 2:** API: Reprogramar desde review sobre `EXPIRED` → VR `REQUIRES_RESCHEDULE`
- [ ] **Step 3:** `retryCount >= 3` sin override → 400 accionable; con `FORCE_RESCHEDULE` → ok; `CLOSE_CASE` → cierra
- [ ] **Step 4:** Notes persistidas; query timezone del barrido con margen explícito

### Task 4: Backend — B2 + B4 + A1 + A2 + A3

- [ ] **Step 1:** Extender `reviewNonRealizationCause` / acción Reprogramar-Cerrar para `EXPIRED`
- [ ] **Step 2:** Eliminar early-return silencioso o hacerlo error explícito cuando evento vencido
- [ ] **Step 3:** Override de 3 intentos + borrar código muerto/`as any`
- [ ] **Step 4:** Fix SQL barrido + margen configurable
- [ ] **Step 5:** Persistir notes (+ migración si falta columna)
- [ ] **Step 6:** OpenAPI / DTOs

### Task 5: Frontend — B3 + B4 UI

- [ ] **Step 1:** `page.tsx` para visitas sin realizar + enlace desde Programación/pendientes
- [ ] **Step 2:** Diálogo E5 en bandeja cuando chip “Requiere decisión”
- [ ] **Step 3:** Wire Reprogramar/Cerrar/Reclasificar de `UnrealizedVisitsView` al API corregido
- [ ] **Step 4:** Tests de montaje + decisión; chip con fixture de status real

### Task 6: QA — verificación de salida

- [ ] **Step 1:** `pnpm --filter @iwana/api test` (WFM + related) con evidencia no-cache
- [ ] **Step 2:** `pnpm --filter @iwana/worker test` / portal scheduling specs
- [ ] **Step 3:** Actualizar informe vivo §3/§6/§8 con evidencia
- [ ] **Step 4:** Cobertura WFM si viable; si no, declarar “no verificada” (no fingir ≥80%)

---

## Orden de paralelismo

```text
QA-red (Tasks 1, 3)
    ├── Backend (Tasks 2, 4)  // contra contrato congelado del prompt
    └── Frontend (Task 5)     // mocks tipados del contrato
            └── QA-green (Task 6)
```
