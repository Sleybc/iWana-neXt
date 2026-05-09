# QUALITY - MOD09 Programacion / WFM Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-09  
**Modulo:** MOD09 Programacion / WFM  
**Fase:** Fase 02 - Command center liviano

---

## 1. Evidencia ejecutada

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api typecheck` | Verde |
| `pnpm --filter @iwana/portal typecheck` | Verde |
| `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-dashboard.service.spec.ts src/modules/wfm/tests/wfm.controller.http.spec.ts` | Verde: 2 suites, 25 tests |
| `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx` | Verde: 2 suites, 9 tests |
| `pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts` | Verde: 5 tests |

---

## 2. Criterios cubiertos

- CA-WFM-13: Command center visible para `ADMIN`, `NOC` y `SUPPORT`.
- CA-WFM-14: Timeline diario agrupa eventos por tecnico y permite abrir detalle.
- CA-WFM-15: Carga y saturacion por tecnico visibles con semantica `LOW`, `MEDIUM`, `HIGH`.
- CA-WFM-16: Alertas deterministicas sin tabla nueva.
- CA-WFM-17: `TECHNICIAN` y `CONTRACTOR` sin KPIs globales ni alertas agregadas.
- CA-WFM-18: Cobertura parcial soportada cuando summary no esta disponible.
- CA-WFM-19: Calendario y lista conservan filtros compartidos.
- CA-WFM-20: Tests focalizados ejecutados en verde.

---

## 3. Observaciones

- No se agregaron migraciones ni dependencias.
- No se introdujo mapa, realtime, WebSocket, SSE, Kanban, drag-and-drop, IA ni dispatch asistido.
- Los mocks E2E WFM se mantienen alineados con el contrato crudo usado por `returnFullResponse: true` en el cliente portal.
