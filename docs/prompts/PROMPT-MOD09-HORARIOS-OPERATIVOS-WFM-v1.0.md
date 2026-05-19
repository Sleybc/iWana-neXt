# PROMPT - MOD09 Horarios operativos WFM

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-15  
**Modo activo:** EM  
**Generado por:** AI-EM-ARCH  
**Ejecutor previsto:** Sr. Dev Fullstack  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Archivo destino:** docs/prompts/PROMPT-MOD09-HORARIOS-OPERATIVOS-WFM-v1.0.md

---

## Modulo

- **Nombre:** Programacion / WFM
- **Codigo:** MOD09
- **Fase:** Horarios operativos tenant-aware
- **Version:** 1.0
- **Fecha:** 2026-05-15
- **Ejecutor previsto:** Sr. Dev Fullstack

---

## 1. Objetivo exacto de la fase

Implementar fullstack el modelo tenant-aware de horarios operativos WFM para que empresa, sede, técnico y festivos gobiernen tanto la administración de configuración como la generación y validación de franjas de agenda.

### Resultado esperado

Un tenant puede administrar sedes operativas, horario semanal base, horarios por sede, overrides por técnico y festivos/cierres, y WFM solo recomienda y persiste instalaciones dentro de la ventana efectiva resuelta para la fecha consultada.

### Lo que si entra

- Tablas nuevas tenant-aware para sedes, horarios base, horarios por sede, overrides y festivos.
- `operatingSiteId` opcional en `schedule_events` y `visit_requests`.
- Endpoints WFM de administración para sedes, horarios, overrides y festivos.
- Resolvedor central de ventana efectiva con precedencia `tecnico > festivo > sede > empresa`.
- Reemplazo del hardcode horario en `ScheduleRecommendationsService`, `ScheduleEventsService` y `VisitRequestsService`.
- UI portal para administrar configuración WFM dentro de la pestaña `operations` con manager dedicado.
- UI de scheduling filtrada por ventana efectiva y con mensajes claros cuando no existan franjas.
- Pruebas backend y frontend focalizadas.
- Actualización del informe vivo de MOD09.

### Lo que no entra

- Reutilizar `CommercialNode` como sede operativa.
- Cambiar stack, multi-tenancy o boundaries del modulith.
- Crear una nueva app o una nueva ruta top-level de settings.
- Cuadrillas, optimización de rutas, mapas o realtime.
- Calendarios externos o reglas de recurrencia avanzadas.

---

## 2. Artefactos de entrada obligatorios

- Plantilla base: docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md
- PRD del modulo: docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- HLD complementario: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- ADR aplicable: docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- Spec de diseño aprobada: docs/specs/2026-05-15-mod09-wfm-operating-hours-design.md
- Plan de implementación: docs/plans/2026-05-15-mod09-wfm-operating-hours.md
- Informe vivo: docs/informes/INFORME-MOD09-FASE-01-v1.0.md
- Stack: docs/prds/Stack_Tecnologico.md
- Gobernanza: AGENTS.md, .github/copilot-instructions.md
- Instrucciones aplicables: .github/instructions/api.instructions.md, .github/instructions/database.instructions.md, .github/instructions/frontend.instructions.md, .github/instructions/portal.instructions.md, .github/instructions/testing.instructions.md

### Artefactos faltantes detectados

- Ninguno para iniciar la ejecución.

---

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer spec, plan e informe vivo antes de tocar código.
2. Ejecutar por slices verticales en este orden: shared contract, DB, CRUD admin WFM, resolvedor, enforcement backend, portal settings, portal scheduling, evidencia.
3. Mantener todo dentro de `WfmModule`; no mover ownership hacia `TenantModule` ni hacia cobertura.
4. Crear una entidad nueva de sede operativa; no reutilizar `CommercialNode`.
5. Mantener `Tenant.settings` solo para `timezone` y metadatos livianos; no meter allí la lógica compleja de horarios.
6. Centralizar la precedencia en un solo resolvedor reutilizado por recomendaciones y persistencia.
7. Mantener `operatingSiteId` opcional para no romper flujos legacy o tenants monosede.
8. No inflar `OperationalSettingsForm.tsx`; crear un manager WFM dedicado dentro de la pestaña `operations`.
9. UI visible siempre en español y con labels de negocio; no mostrar enums crudos.
10. Actualizar pruebas e informe vivo al cerrar cada bloque relevante.

---

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro módulo directamente.
- No hardcodear tenant, schema o timezone.
- No usar `synchronize: true`.
- No introducir PII real, secretos ni tokens.
- No usar `CommercialNode` como sustituto de sede.
- No duplicar la lógica de precedencia en múltiples servicios.
- No ampliar el formulario general de settings hasta volverlo inmanejable.
- No usar `npm` ni `yarn`; todo con `pnpm`.

---

## 5. Entregables tecnicos obligatorios

### Backend y base de datos

- Enum compartido `BusinessHoursWeekday`.
- Entidades tenant-aware nuevas para sedes, horarios base, horarios por sede, overrides y festivos.
- Migración reversible tenant `036_create_wfm_operating_hours_module.ts`.
- Campos `operatingSiteId` opcionales en `schedule_events` y `visit_requests`.
- Endpoints WFM de administración para sedes, horarios, overrides y festivos.
- `OperatingWindowResolverService` con precedencia explícita.
- Enforcement backend en create/update/reschedule/scheduleVisitRequest.
- Recomendaciones limitadas a la ventana efectiva.

### Frontend portal

- `WfmOperatingHoursManager.tsx` dentro de `operations`.
- Cliente API tipado para CRUD de settings WFM.
- Ajustes en `ScheduleEventForm`, `RescheduleEventDialog`, `VisitRequestRecommendationPanel` y `PendingVisitRequestsView` para usar ventana efectiva.
- Mensajes de bloqueo por festivo, sede cerrada, empresa cerrada o falta de configuración.

### Tests

- Unit/backend del resolvedor.
- HTTP tests para CRUD y permisos.
- Tests backend de enforcement y recomendaciones.
- Tests frontend del manager de settings y del scheduling UI.

---

## 6. Entregables documentales obligatorios

- Actualizar `docs/informes/INFORME-MOD09-FASE-01-v1.0.md` como documento vivo.
- Registrar comandos ejecutados y resultados relevantes.
- Actualizar `docs/quality/` si la fase produce evidencia adicional o bloqueos.
- Crear ADR nuevo solo si aparece cambio de boundary, stack o patrón de integración no cubierto.

---

## 7. Criterios de aceptacion

- CA-HO-01: El tenant puede administrar horario base por día de semana.
- CA-HO-02: El tenant puede crear sedes operativas y horarios semanales por sede.
- CA-HO-03: El tenant puede configurar overrides por técnico y festivos/cierres.
- CA-HO-04: El resolvedor aplica la precedencia `tecnico > festivo > sede > empresa`.
- CA-HO-05: Las recomendaciones no generan slots fuera de la ventana efectiva.
- CA-HO-06: Create, update, reschedule y scheduleVisitRequest rechazan con `400` fuera de la ventana efectiva.
- CA-HO-07: Un override explícito de técnico puede habilitar trabajo en un festivo.
- CA-HO-08: Portal explica por qué no existen franjas cuando la fecha está cerrada.

---

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- La implementación exige volver transversal la sede operativa fuera de WFM.
- Se detecta necesidad de un ADR nuevo por boundary, stack o seguridad.
- La solución obliga a meter la configuración compleja en `tenant.settings`.
- La UI de `operations` se vuelve inviable sin reestructuración mayor.

### Documentar causa en

- `docs/informes/INFORME-MOD09-FASE-01-v1.0.md`.

### Escalar a

- EM-ARCH primero.
- CTO si afecta stack, boundary, tenancy o seguridad.

### Recomendacion esperada

Presentar máximo 3 opciones con impacto y recomendación concreta.

---

## 9. Criterio de salida de la fase

- Backend validado con pruebas focalizadas.
- Base de datos validada con migración reversible.
- Portal validado con pruebas de manager y scheduling.
- Informe vivo actualizado.
- Hardcode horario reemplazado por resolución tenant-aware reutilizable.
