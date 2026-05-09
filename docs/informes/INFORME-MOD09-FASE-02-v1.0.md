# INFORME - MOD09 Programacion / WFM Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-09  
**Modo activo:** Mixto  
**Modulo:** MOD09 Programacion / WFM  
**Responsable principal:** GitHub Copilot

---

## 1. Vinculos de trazabilidad

- PRD base: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Addendum funcional: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-ADDENDUM-COMMAND-CENTER-v1.1.md`
- HLD vigente: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Spec de fase: `docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md`
- ADR principal: `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- Plan: `docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md`
- Prompt: `docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md`
- Informe previo: `docs/informes/INFORME-MOD09-FASE-01-v1.0.md`
- Evidencia de calidad: `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`

---

## 2. Resumen ejecutivo

Se implemento la Fase 02 de MOD09 como command center liviano dentro de `/dashboard/scheduling`, sin cambiar el boundary `WfmModule` ni introducir tablas, endpoints, realtime, mapa, Kanban, drag-and-drop o dispatch asistido.

El resultado entrega KPIs priorizados, alertas deterministicas, timeline diario por tecnico y banda de saturacion por responsable para roles `ADMIN`, `NOC` y `SUPPORT`. Los roles `TECHNICIAN` y `CONTRACTOR` conservan agenda/lista por ownership sin consumir summary global ni alertas agregadas.

---

## 3. Entregables implementados

### Backend

- `WfmDashboardSummary` ampliado de forma aditiva con:
  - `activeCount`
  - `enRouteCount`
  - `atRiskCount`
  - `alerts[]`
  - `technicianLoad[].overdueCount`
  - `technicianLoad[].totalScheduledMinutes`
  - `technicianLoad[].utilizationPercent`
  - `technicianLoad[].riskLevel`
- Reglas de alertas derivadas:
  - evento atrasado
  - borrador que inicia pronto
  - tecnico con saturacion alta
- Banda de saturacion por tecnico calculada desde minutos programados del dia.
- Gating backend preservado: `GET /api/v1/wfm/dashboard/summary` sigue restringido a `ADMIN`, `NOC` y `SUPPORT`.

### Frontend portal

- Vista `command-center` agregada a `SchedulingClient` como default para roles de supervision.
- Componentes nuevos:
  - `SchedulingOverview.tsx`
  - `SchedulingAlertRail.tsx`
  - `SchedulingTimelineBoard.tsx`
  - `TechnicianLoadStrip.tsx`
- `SchedulingToolbar` mantiene filtros compartidos y permite alternar entre command center, calendario y lista.
- Roles restringidos no visualizan command center ni disparan llamadas a summary/availability global.
- Calendario y lista existentes siguen disponibles y sincronizados con filtros.

### Base de datos

- Sin migraciones nuevas.
- Sin tablas nuevas para alertas o timeline.

### Integraciones

- Sin dependencias nuevas.
- Sin mapa, realtime, WebSocket, SSE, inventario, IA ni dispatch automatico.

---

## 4. Evidencia funcional

- CA-WFM-13: `ADMIN` visualiza command center con KPIs priorizados.
- CA-WFM-14: Timeline diario agrupa eventos por tecnico y abre detalle desde el bloque.
- CA-WFM-15: Carga y saturacion por tecnico visibles mediante banda `LOW`, `MEDIUM`, `HIGH`.
- CA-WFM-16: Alertas derivadas sin persistencia nueva.
- CA-WFM-17: `TECHNICIAN` no ve command center global ni consume summary agregado.
- CA-WFM-18: Summary faltante muestra cobertura parcial y conserva timeline/lista con eventos.
- CA-WFM-19: Calendario y lista se conservan y comparten filtros.
- CA-WFM-20: Tests focalizados ejecutados en verde.

---

## 5. Evidencia de calidad

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api typecheck` | Verde |
| `pnpm --filter @iwana/portal typecheck` | Verde |
| `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-dashboard.service.spec.ts src/modules/wfm/tests/wfm.controller.http.spec.ts` | Verde: 2 suites, 25 tests |
| `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx` | Verde: 2 suites, 9 tests |
| `pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts` | Verde: 5 tests |

---

## 6. Cambios documentales

- Informe vivo actualizado: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`.
- Evidencia de calidad creada: `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`.
- PRD/HLD/ADR no se modifican porque no hubo cambio estructural ni desviacion aprobada.

---

## 7. Riesgos y bloqueos

- Scope creep hacia mapa, Kanban o dispatch asistido: controlado; no se implemento.
- Crecimiento de `SchedulingClient`: mitigado con componentes dedicados.
- Inconsistencia entre alertas backend/frontend: mitigada con contrato tipado, helpers y pruebas focalizadas.
- Bloqueos tecnicos abiertos: ninguno.

---

## 8. Decision de salida

**Veredicto:** Go.

La Fase 02 queda implementada y validada con pruebas backend, frontend, typecheck y E2E portal focalizado en verde. No se identifican bloqueos criticos de arquitectura, seguridad, tenancy o stack dentro del alcance aprobado.
