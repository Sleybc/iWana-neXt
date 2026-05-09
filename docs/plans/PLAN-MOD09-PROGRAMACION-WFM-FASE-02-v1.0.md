# PLAN - MOD09 Programacion / WFM Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-09  
**Modo activo:** EM  
**Autor:** AI-EM-ARCH  
**PRD base:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md  
**Addendum funcional:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-ADDENDUM-COMMAND-CENTER-v1.1.md  
**HLD vigente:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**Spec relacionada:** docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md  
**ADR vigente:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md  
**Prompt relacionado:** docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md

---

## Objetivo del sprint

Implementar la Fase 02 de MOD09 como un command center liviano sobre la superficie existente de scheduling, reforzando supervision operativa con KPIs priorizados, alertas, timeline diario por tecnico y carga por responsable, sin introducir infraestructura nueva ni ampliar el boundary.

---

## Criterio de entrada

- MOD09 Fase 01 implementada y operativa segun `docs/informes/INFORME-MOD09-FASE-01-v1.0.md`.
- PRD base, HLD vigente y ADR-037 sin cambios estructurales pendientes.
- Addendum y spec de Fase 02 aprobados.
- Base del repo en verde o con fallas no relacionadas documentadas.

---

## Fase 02 - Alcance tecnico

### Backend

1. Ampliar `WfmDashboardSummary` con KPIs priorizados y alertas derivadas.
2. Implementar calculo de banda de saturacion por tecnico para el dia filtrado.
3. Reusar `GET /wfm/events` como fuente del timeline diario.
4. Reusar `GET /wfm/technicians/availability` para cruces simples de bloqueo.
5. Mantener compatibilidad hacia atras del contrato existente.

### Frontend

1. Agregar vista operacional dentro de `/dashboard/scheduling`.
2. Crear componentes dedicados para overview, alertas, timeline y carga.
3. Mantener calendario y lista actuales como vistas secundarias.
4. Asegurar que filtros de fecha, tecnico, tipo y estado se compartan entre vistas.
5. Mantener gating por rol para no exponer KPIs globales a `TECHNICIAN` y `CONTRACTOR`.

### Tests

1. Unit tests backend para summary extendido, saturacion y alertas.
2. Tests frontend para render de command center, rail de alertas y timeline.
3. E2E portal para rol supervisor/admin y restriccion a tecnico.

### Documentacion

1. Mantener informe vivo de Fase 02 en `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`.
2. Actualizar checklist de calidad cuando la ejecucion produzca evidencia.
3. No tocar HLD ni ADR salvo necesidad estructural real documentada.

---

## Asignaciones por agente

| Agente | Responsabilidad |
| --- | --- |
| Sr. Dev Fullstack | Implementacion backend/frontend y pruebas focalizadas |
| Sr. Dev QA/Testing | Revisar cobertura, E2E y gating por rol |
| EM-ARCH | Control de alcance, drift tecnico y stop/go |

---

## Secuencia de ejecucion sugerida

1. Extender tipos compartidos o contratos backend estrictamente necesarios.
2. Implementar summary extendido y reglas de alertas con tests backend.
3. Implementar banda de saturacion y asegurar compatibilidad de ownership.
4. Separar la nueva vista operacional en componentes pequeños dentro de `apps/portal/src/components/scheduling/`.
5. Integrar la vista operacional a `SchedulingClient` sin degradar calendario ni lista.
6. Agregar tests frontend focalizados.
7. Ejecutar E2E portal focalizado.
8. Actualizar informe de fase y evidencia de calidad.

---

## Definition of Done

- `pnpm --filter @iwana/api test -- wfm` en verde.
- `pnpm --filter @iwana/api typecheck` en verde.
- `pnpm --filter @iwana/portal test -- scheduling` en verde.
- `pnpm --filter @iwana/portal typecheck` en verde.
- E2E portal focalizado ejecutado o bloqueo documentado.
- La nueva vista operacional funciona para roles de supervision.
- Calendario y lista existentes siguen operativos.
- Informe de fase actualizado en `docs/informes/`.
- Evidencia de calidad registrada en `docs/quality/`.

---

## Riesgos de alcance

| Riesgo | Decision |
| --- | --- |
| La vista operacional intenta absorber Kanban o mapa | Rechazar; queda fuera de Fase 02. |
| `SchedulingClient` crece demasiado | Separar componentes nuevos y helpers locales. |
| El summary extendido rompe consumidores | Mantener cambios aditivos y reforzar pruebas. |
| Las alertas dependen de datos inexistentes | Limitar reglas a agenda y disponibilidad ya disponibles. |

---

## Criterio de salida

La fase puede cerrarse cuando un usuario autorizado vea un command center liviano sobre scheduling con KPIs priorizados, alertas operativas, timeline por tecnico y carga resumida, manteniendo seguridad de ownership, compatibilidad de las vistas existentes y evidencia de pruebas focalizadas.