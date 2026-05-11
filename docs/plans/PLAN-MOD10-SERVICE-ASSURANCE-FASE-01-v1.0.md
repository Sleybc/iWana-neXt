# PLAN - MOD10 Service Assurance / Mesa de Ayuda Fase 01

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-09  
**Modo activo:** EM  
**Autor:** AI-EM-ARCH  
**PRD:** docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md  
**HLD:** docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md  
**ADR propuesto:** docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md  
**Spec:** docs/specs/SPEC-MOD10-SERVICE-ASSURANCE-DISENO-v1.0.md  
**Prompt:** docs/prompts/PROMPT-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md

---

## Objetivo del sprint

Implementar el MVP de Service Assurance / Mesa de Ayuda con tickets mixtos cliente + internos, SLA simple, PQR CRC, timeline, comentarios, dashboard operativo y solicitud de trabajo de campo hacia WFM.

---

## Criterio de entrada

- ADR-038 aprobado por CTO o autorización explícita de ejecución controlada.
- PRD, HLD, spec, plan y prompt revisados por EM-ARCH.
- WFM disponible como bounded context aprobado; si el contrato real no existe, usar puerto/evento stub documentado.
- Base del repo en verde o fallas no relacionadas documentadas.
- Variables de entorno de desarrollo disponibles para API, portal y DB.

---

## Fase 01 - Alcance tecnico

### Backend

1. Crear enums Assurance en `packages/shared/src/enums/assurance/` y exportarlos.
2. Crear entidades tenant-aware en `packages/database/src/entities/`.
3. Crear migración tenant `031_create_assurance_module.ts` con `down` reversible.
4. Registrar entidades en DataSource según el patrón vigente.
5. Crear `apps/api/src/modules/assurance/` con module, controller, DTOs, services, ports y tests.
6. Implementar endpoints REST bajo `/api/v1/assurance`.
7. Implementar validaciones Zod.
8. Implementar reglas de transición, asignación, comments, timeline y SLA.
9. Implementar PQR record y reglas de cierre PQR.
10. Implementar `FieldServiceRequestService` con puerto hacia WFM.
11. Implementar dashboard summary.
12. Documentar OpenAPI con decorators NestJS.

### Frontend

1. Agregar tipos y cliente `assuranceApi` en el lugar consistente con el patrón actual de `apps/portal`.
2. Crear ruta `apps/portal/src/app/dashboard/assurance/page.tsx`.
3. Crear componentes `AssuranceClient`, toolbar, tabla, kanban simple, drawer, formulario, comments, timeline, dialogo de solicitud de campo y cards SLA.
4. Agregar navegación en sidebar si corresponde al patrón actual.
5. Mapear enums a labels en español y sentence case.
6. Implementar filtros por estado, tipo, prioridad, cola, responsable y SLA.
7. Implementar vistas “PQR”, “Internos” y “Mis asignados” como tabs o filtros guardados.

### Tests

1. Unit tests backend para transiciones, SLA, PQR y solicitud de campo.
2. Controller/integration tests para endpoints principales, RBAC y ownership.
3. Integration tenant-aware para aislamiento por schema.
4. Frontend tests para labels, filtros, formulario y drawer.
5. E2E portal para crear ticket interno, crear ticket externo, comentar, resolver y solicitar campo.

---

## Asignaciones por agente

| Agente | Responsabilidad |
| --- | --- |
| Sr. Dev Fullstack | Implementación backend/frontend, migraciones y tests focalizados |
| Sr. Dev QA/Testing | Revisar cobertura, E2E, RBAC, ownership y aislamiento tenant |
| EM-ARCH | Resolver decisiones de boundary, aprobar stop/go y revisar drift |

---

## Secuencia de ejecucion sugerida

1. Confirmar gate ADR-038.
2. Crear enums shared y exports.
3. Crear entidades y migración reversible.
4. Implementar servicios core con TDD: transiciones, SLA y PQR.
5. Implementar controller, DTOs, Zod, RBAC y OpenAPI.
6. Implementar puerto/evento hacia WFM.
7. Implementar dashboard summary.
8. Crear cliente API portal y tipos UI.
9. Crear pantalla Mesa de ayuda y componentes.
10. Agregar navegación portal si aplica.
11. Ejecutar pruebas backend/frontend/E2E focalizadas.
12. Crear informe de fase y checklist de calidad.

---

## Definition of Done

- `pnpm --filter @iwana/api test -- assurance` en verde.
- `pnpm --filter @iwana/api typecheck` en verde.
- `pnpm --filter @iwana/portal test -- assurance` en verde.
- `pnpm --filter @iwana/portal typecheck` en verde.
- `pnpm test:e2e:portal --grep "Mesa de ayuda"` ejecutado o bloqueo documentado.
- Migración reversible revisada.
- OpenAPI actualizado.
- Informe de fase en `docs/informes/`.
- Checklist de calidad en `docs/quality/`.
- Sin acceso directo a tablas de otros módulos.
- Sin PII real ni secretos en código, tests, logs o documentación.

---

## Riesgos de alcance

| Riesgo | Decision |
| --- | --- |
| ADR-038 no aprobado | No iniciar código productivo; mantener paquete como definición |
| UI se convierte en helpdesk pesado | Mantener Fase 01 con lista densa + kanban simple + drawer |
| WFM no expone contrato real | Implementar puerto stub y documentar integración pendiente |
| PQR exige interpretación legal adicional | Marcar como requiere verificación con fuente oficial y escalar |
| Soporte interno pide flujos tipo ITSM completos | Limitar a tickets internos básicos; catálogo ITSM queda fuera de Fase 01 |
| NMS/WhatsApp piden integración inmediata | Diferir a Fase 02; Fase 01 deja source enum preparado |

---

## Criterio de salida

La fase puede cerrarse cuando un usuario autorizado pueda crear, clasificar, asignar, comentar, resolver y cerrar tickets internos/externos desde portal, con SLA calculado, PQR trazable, timeline auditado, solicitud de campo hacia WFM y persistencia tenant-aware validada.