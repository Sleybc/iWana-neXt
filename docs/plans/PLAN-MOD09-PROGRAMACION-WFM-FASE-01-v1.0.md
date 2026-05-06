# PLAN - MOD09 Programacion / WFM Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-06  
**Modo activo:** EM  
**Autor:** AI-EM-ARCH  
**PRD:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md  
**HLD:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**ADR aprobado:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md  
**Prompt:** docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md

---

## Objetivo del sprint

Implementar el MVP de Programacion / WFM con agenda operativa, Work Orders ligeras, disponibilidad puntual, dashboard basico y UI portal para crear, consultar, reagendar y completar trabajos.

---

## Criterio de entrada

- ADR-037 aprobado por CTO.
- PRD y HLD MOD09 aprobados para ejecucion.
- Base del repo en verde o con fallas no relacionadas documentadas.
- Variables de entorno de desarrollo disponibles para API, portal y DB.

---

## Fase 01 - Alcance tecnico

### Backend

1. Crear enums WFM en `packages/shared/src/enums/wfm/` y exportarlos.
2. Crear entidades WFM en `packages/database/src/entities/` y exportarlas.
3. Crear migracion tenant `030_create_wfm_module.ts` con down reversible.
4. Registrar entidades en datasource si el patron actual lo requiere.
5. Crear `apps/api/src/modules/wfm/` con controller, module, services, DTOs y tests.
6. Implementar endpoints REST bajo `/api/v1/wfm`.
7. Implementar validaciones Zod.
8. Implementar reglas de solapamiento y ownership.
9. Implementar dashboard summary.
10. Documentar OpenAPI con decorators NestJS.

### Frontend

1. Agregar tipos y cliente `wfmApi` en `apps/portal/src/lib/api-client.ts` o archivo local si existe patron autorizado.
2. Crear ruta `apps/portal/src/app/dashboard/scheduling/page.tsx`.
3. Crear componentes `SchedulingClient`, toolbar, calendario, lista, drawer/form y dialogo de reagendamiento.
4. Agregar navegacion en sidebar si corresponde al patron actual.
5. Mapear enums a labels en espanol, sin renderizar valores crudos.
6. Implementar vista restringida para tecnico/contratista por respuesta backend.

### Tests

1. Unit tests backend para conflicto, transiciones y ownership.
2. Integration/controller tests para endpoints principales.
3. Frontend tests para formulario, filtros y labels.
4. E2E portal para crear, reagendar y completar evento.

---

## Asignaciones por agente

| Agente | Responsabilidad |
| --- | --- |
| Sr. Dev Fullstack | Implementacion backend/frontend y tests focalizados |
| Sr. Dev QA/Testing | Revisar cobertura, E2E y casos de aislamiento tenant |
| EM-ARCH | Resolver decisiones de boundary, revisar drift y aprobar stop/go |

---

## Secuencia de ejecucion sugerida

1. Shared enums y exports.
2. Entidades + migracion tenant reversible.
3. Servicios backend con tests unitarios en rojo/verde.
4. Controller + DTOs + OpenAPI + tests controller.
5. Dashboard summary backend.
6. API client portal + tipos UI.
7. Pantalla scheduling y componentes.
8. Tests frontend.
9. E2E portal focalizado.
10. Informe de fase y checklist quality.

---

## Definition of Done

- `pnpm --filter @iwana/api test -- wfm` en verde.
- `pnpm --filter @iwana/api typecheck` en verde.
- `pnpm --filter @iwana/portal test -- scheduling` en verde.
- `pnpm --filter @iwana/portal typecheck` en verde.
- E2E portal focalizado ejecutado o bloqueo documentado.
- Migracion reversible revisada.
- OpenAPI actualizado.
- Informe de fase en `docs/informes/`.
- Checklist de calidad en `docs/quality/`.

---

## Riesgos de alcance

| Riesgo | Decision |
| --- | --- |
| UI calendario se vuelve grande | Mantener Fase 01 con calendario simple + lista; no introducir libreria pesada sin aprobacion. |
| CRM pide integracion completa | Limitar a contrato `workOrderId`; no modificar pipeline CRM salvo tarea explicita de Fase 03. |
| Materiales/evidencias aparecen durante ejecucion | Documentar como Fase 02; no mezclar con Fase 01. |
| Falla E2E por entorno | Documentar evidencia de unit/integration y bloqueo tecnico en informe. |

---

## Criterio de salida

La fase puede cerrarse cuando un usuario autorizado pueda crear, consultar, reagendar y completar un trabajo desde el portal, con persistencia tenant-aware, validacion de solapamiento, ownership para tecnico/contratista y evidencia de pruebas.
