# PROMPT - MOD09 Programacion / WFM Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-06  
**Modo activo:** EM  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Archivo destino:** docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md

---

## Modulo

- **Nombre:** Programacion / WFM
- **Codigo:** MOD09
- **Fase:** Fase 01 - Agenda operativa + Work Order ligera
- **Version:** 1.0
- **Fecha:** 2026-05-06
- **Ejecutor previsto:** Sr. Dev Fullstack

---

## 1. Objetivo exacto de la fase

Implementar el MVP de MOD09 con backend NestJS, migraciones TypeORM, contratos compartidos y UI Next.js en portal para programar y gestionar agenda operativa de visitas, instalaciones, soporte, retiros y mantenimientos.

### Resultado esperado

Un usuario autorizado puede crear un trabajo programado, asignarlo a tecnico/contratista, verlo en agenda por dia/semana/mes/lista, reagendarlo con motivo, cambiar estados y consultar dashboard operativo basico.

### Lo que si entra

- `WfmModule` en `apps/api`.
- Enums WFM en `@iwana/shared`.
- Entidades y migracion tenant en `packages/database`.
- Endpoints REST `/api/v1/wfm`.
- Validaciones Zod.
- RBAC y ownership para tecnico/contratista.
- UI portal `/dashboard/scheduling`.
- Tests backend, frontend y E2E focalizado.
- Informe y checklist de calidad.

### Lo que no entra

- Materiales e inventario real.
- Firma digital.
- Evidencias fotograficas.
- Check-in/out geolocalizado.
- Mapa operativo.
- Portal contratista dedicado.
- Modificaciones profundas al pipeline CRM.

---

## 2. Artefactos de entrada obligatorios

- PRD del modulo: docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- Spec de diseno: docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md
- ADR aprobado: docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- Sprint plan aplicable: docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md
- Stack: docs/prds/Stack_Tecnologico.md
- Gobernanza: AGENTS.md, .github/copilot-instructions.md
- Instrucciones aplicables: .github/instructions/api.instructions.md, .github/instructions/database.instructions.md, .github/instructions/frontend.instructions.md, .github/instructions/portal.instructions.md, .github/instructions/testing.instructions.md, .github/instructions/e2e.instructions.md

### Artefactos faltantes detectados

- Ninguno para iniciar MOD09 Fase 01. ADR-037 fue aprobado por CTO el 2026-05-06.

---

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer PRD, HLD, ADR, plan y spec antes de tocar codigo.
2. Confirmar que ADR-037 permanece en estado `Aprobado`; si cambia o aparece una excepcion de boundary, detenerse y escalar.
3. Implementar primero contratos compartidos y migracion reversible.
4. Implementar backend con TDD para reglas de solapamiento, transiciones y ownership.
5. Implementar frontend despues de tener contratos backend estables.
6. Mantener UI operativa, densa y en espanol; no crear landing ni hero.
7. No duplicar PII del suscriptor en MOD09.
8. No consultar tablas de CRM, Assurance, Provisioning ni Inventory.
9. Usar `UserRole.*` en `@Roles()`.
10. Actualizar OpenAPI y documentacion de fase.

---

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro modulo directamente.
- No usar credenciales, tokens ni datos reales.
- No omitir validacion Zod.
- No omitir pruebas de reglas core.
- No hardcodear tenant ni schema.
- No usar `synchronize: true`.
- No renderizar enums crudos en UI.
- No introducir libreria pesada de calendario sin aprobacion EM-ARCH.
- No mezclar materiales, firma o evidencias en Fase 01.

---

## 5. Entregables tecnicos obligatorios

### Backend

- `packages/shared/src/enums/wfm/*`
- `packages/database/src/entities/schedule-event.entity.ts`
- `packages/database/src/entities/work-order.entity.ts`
- `packages/database/src/entities/work-order-task.entity.ts`
- `packages/database/src/entities/schedule-reschedule-log.entity.ts`
- `packages/database/src/entities/technician-availability.entity.ts`
- `packages/database/src/migrations/tenant/030_create_wfm_module.ts`
- `apps/api/src/modules/wfm/**`

### Frontend

- `apps/portal/src/app/dashboard/scheduling/page.tsx`
- `apps/portal/src/components/scheduling/**`
- Cliente API tipado para WFM en el lugar consistente con el patron actual.
- Navegacion portal actualizada si corresponde.

### Tests

- Unit tests backend de solapamiento, transiciones y ownership.
- Controller/integration tests de endpoints principales.
- Tests frontend de formulario, filtros y labels.
- E2E portal focalizado para crear, reagendar y completar evento.

---

## 6. Entregables documentales obligatorios

- Informe de fase: actualizar o crear `docs/informes/INFORME-MOD09-FASE-01-v1.0.md`.
- Checklist de calidad: `docs/quality/CHECKLIST-MOD09-FASE-01-v1.0.md`.
- Actualizar PRD/HLD solo si cambia alcance aprobado.
- Decision stop/go documentada si aparece bloqueo tecnico.

---

## 7. Criterios de aceptacion

- CA-WFM-01: Admin/NOC/Support crea evento programado con Work Order ligera.
- CA-WFM-02: Backend rechaza solapamiento activo por tecnico.
- CA-WFM-03: Agenda consulta rangos para dia, semana y mes.
- CA-WFM-04: Tecnico ve solo trabajos asignados.
- CA-WFM-05: Contratista ve solo trabajos asignados.
- CA-WFM-06: Reagendar exige motivo y registra historial.
- CA-WFM-07: Evento avanza hasta completado y Work Order hasta cerrada.
- CA-WFM-08: Dashboard muestra hoy, atrasados, proximos y carga por tecnico.
- CA-WFM-09: Persistencia tenant-aware sin cruces entre schemas.
- CA-WFM-10: UI portal permite crear, filtrar, reagendar y completar evento basico.
- CA-WFM-11: OpenAPI actualizado.
- CA-WFM-12: Tests focalizados en verde o bloqueo documentado.

---

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- ADR-037 no esta aprobado.
- Se requiere acceso directo a tablas de otro modulo para completar la fase.
- Se detecta necesidad de almacenar PII sensible no aprobada en WFM.
- La migracion requiere FKs cross-schema.
- El calendario exige introducir una dependencia pesada no aprobada.
- Tests de aislamiento tenant fallan por causa de diseño.

### Documentar causa en

- `docs/quality/TEMPLATE-DECISION-BLOQUEO-TECNICO.md` como base.
- Informe de fase en `docs/informes/`.

### Escalar a

- EM-ARCH primero.
- CTO si afecta boundary, seguridad, multi-tenancy o alcance.

### Recomendacion esperada

Presentar maximo 3 opciones, impacto y recomendacion concreta.

---

## 9. Criterio de salida de la fase

- Backend validado con tests focalizados.
- Frontend validado con tests focalizados.
- Base de datos validada con migracion reversible.
- E2E ejecutado o bloqueo documentado.
- OpenAPI actualizado.
- Informe y checklist creados.
- Sin deuda critica pendiente.
