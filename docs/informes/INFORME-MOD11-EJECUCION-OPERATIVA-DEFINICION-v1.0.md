# INFORME - MOD11 Ejecucion Operativa / Tareas Definicion

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-23  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Clasificacion:** Uso interno

---

## 1. Objetivo

Consolidar el paquete documental necesario para evaluar y trazar un nuevo bounded context de ejecucion operativa transversal sin romper MOD10 Service Assurance ni MOD09 Programacion / WFM.

---

## 2. Decisiones tomadas

| Decision | Estado | Referencia |
| --- | --- | --- |
| Proponer `TasksModule` como owner de tareas operativas | Aprobado (CTO 2026-06-23) | docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md |
| Mantener `AssuranceModule` como owner de tickets, SLA y PQR | Alineado a ADR aprobado | docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md |
| Mantener `WfmModule` como owner de agenda y Work Orders ligeras/transitorias | Alineado a ADR aprobado | docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md |
| Separar `Programacion` de la OT enriquecida de ejecucion de campo | Aprobado por CTO | docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md |
| Usar `Operaciones` como nombre visible del modulo | Aprobado por CTO | docs/specs/2026-06-22-mod11-operaciones-tareas-design.md |
| Usar `MOD11` como numeracion documental | Aprobado por CTO | docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md |
| No toda solicitud debe crear ticket; todo trabajo ejecutable debe materializarse en tarea | Aprobado para diseno funcional | docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md |
| El modal de `Agendar tarea` debe pasar a un flujo `Crear tarea` con agenda opcional | Aprobado para diseno objetivo | docs/specs/2026-06-23-mod11-crear-tarea-agenda-opcional-design.md |

---

## 3. Artefactos creados

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| Spec de diseño | docs/specs/2026-06-22-mod11-operaciones-tareas-design.md | Aprobado |
| Spec UI modal crear tarea | docs/specs/2026-06-23-mod11-crear-tarea-agenda-opcional-design.md | Listo para implementacion |
| PRD | docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md | Aprobado |
| HLD | docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md | Aprobado |
| ADR | docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md | Aprobado |
| ADR de separacion agenda vs OT | docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md | Aprobado |
| Plan de implementación | docs/plans/2026-06-22-mod11-ejecucion-operativa-tareas-fase-01.md | Ejecutado Fase 01 |
| Plan de implementacion modal crear tarea | docs/plans/2026-06-23-mod11-modal-crear-tarea-agenda-opcional.md | Listo para ejecucion fullstack |
| Plan agenda + OT de ejecucion | docs/plans/2026-06-24-mod09-mod11-programacion-centro-agendamiento-y-ot-ejecucion.md | Listo para ejecucion fullstack |
| Prompt de ejecución | docs/prompts/PROMPT-MOD11-EJECUCION-OPERATIVA-TAREAS-FASE-01-v1.0.md | Aprobado |
| Prompt agenda + OT de ejecucion | docs/prompts/PROMPT-MOD09-MOD11-PROGRAMACION-CENTRO-AGENDAMIENTO-OT-v1.0.md | Aprobado |
| Informe Fase 01 | docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md | Aprobado |
| Checklist Fase 01 | docs/quality/CHECKLIST-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md | Aprobado |
| Informe de definicion | docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md | Aprobado |

---

## 4. Actualizaciones cruzadas realizadas

| Documento | Ajuste |
| --- | --- |
| docs/specs/2026-06-22-mod11-operaciones-tareas-design.md | Se incorpora politica de intake unificado y se referencia el spec UI del modal objetivo. |
| docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md | Se agrega politica funcional ticket vs tarea vs agenda y se explicita la OT enriquecida como owner futuro de ejecucion de campo. |
| docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md | Se aterriza el frente web para que Programacion siga coordinando agenda y MOD11 absorba la OT enriquecida. |
| docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md | Se corrige el boundary para dejar a WFM como owner de agenda y OT ligera/transitoria. |
| docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md | Se aclara que MOD10 puede originar trabajo operativo, pero no debe ser owner de la ejecucion transversal propuesta para MOD11. |
| docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md | Se agrega MOD11 como bounded context relacionado y se explicita la separacion ticket vs tarea. |

La trazabilidad entre MOD09 y MOD11 queda ampliada con el spec de 2026-06-24 y con ADR-047, que redefine el owner de la OT enriquecida sin mover agenda fuera de WFM.

---

## 5. Alcance definido para Fase 01

- Crear tareas manuales y originadas desde otros modulos.
- Capturar solicitudes de telefono, WhatsApp, oficina o integraciones sin forzar ticket en todos los casos.
- Diferenciar responsable y destinatario.
- Permitir destinatario cliente o interno.
- Mantener agenda opcional y vinculo logico con WFM.
- Mantener vinculo logico con tickets de MOD10.
- Definir una matriz clara para cuando una oportunidad CRM, un ticket o una agenda deben coexistir con la tarea.
- Dejar ownership claro sin colapsar boundaries aprobados.

---

## 6. Bloqueantes y gates

| Bloqueante | Severidad | Accion requerida |
| --- | --- | --- |
| ADR-046 no aprobado | Resuelto | Aprobado CTO 2026-06-23; Fase 01 ejecutada |
| PRD maestro aun sin MOD11 | Media | Actualizar roadmap maestro solo tras aprobacion del nuevo boundary |
| Armonizacion documental con MOD09 | Media | Integrar referencias cruzadas cuando se cierre el trabajo local existente |

---

## 7. Riesgos residuales

- Riesgo de duplicar estados entre ticket y tarea si no se respeta la separacion de ownership.
- Riesgo de convertir `WorkOrderTask` o la `WorkOrder` ligera de WFM en sustituto permanente de la OT enriquecida.
- Riesgo de introducir PII en labels o descripciones del destinatario si el contrato no se disciplina desde el inicio.
- Riesgo de mantener dos flujos paralelos de creacion si el modal actual de Programacion no se consolida sobre el contrato de `TasksModule`.

---

## 8. Paquete listo para ejecucion

- El PRD ya define la politica funcional de intake: ticket para casos que requieren control de caso, tarea para todo trabajo ejecutable y agenda solo cuando existe compromiso temporal.
- El spec UI del modal objetivo ya fija estructura, copy, secciones, reglas de visibilidad y matriz de decisiones para CRM, Mesa de ayuda y captura manual.
- El HLD ya alinea frontend y backend sobre una evolucion `Task -> ScheduleEvent -> ExecutionOrder`, dejando la `WorkOrder` ligera solo como compatibilidad transitoria cuando aplique.
- El plan `docs/plans/2026-06-23-mod11-modal-crear-tarea-agenda-opcional.md` deja lista la ejecucion fullstack con archivos objetivo, pruebas y verificaciones.

---

## 9. Recomendacion EM-ARCH

[ESCALACION AL CTO]

**Prioridad:** Alta  
**Contexto:** El modulith ya separa ticketing y scheduling, pero aun no tiene owner claro para la ejecucion operativa transversal.  
**Opciones evaluadas:** absorber tareas en MOD10, absorber tareas en MOD09, o crear MOD11 como bounded context propio.  
**Recomendacion:** Mantener ADR-046 para tareas y ejecutar ADR-047 usando `MOD11` como owner de OT enriquecida, manteniendo `AssuranceModule` para tickets y `WfmModule` para agenda/OT ligera.  
**Decision requerida antes de:** iniciar implementacion productiva del nuevo modulo.

---

## 10. Estado de salida

Paquete documental listo para ejecucion fullstack. La siguiente accion recomendada es implementar la separacion agenda vs OT de ejecucion: `Programacion` coordina agenda, `MOD11` ejecuta la OT enriquecida y consume inventario desde custodia operativa del tecnico/cuadrilla.

- 2026-06-23: Las tareas operativas que requieren visita de campo ahora crean `visit-requests` con origen `TASKS` y se enrutan a agenda o pendientes mediante el mismo helper compartido usado por CRM y Mesa de ayuda. La captura generica desde Programacion queda degradada a solicitud manual excepcional.
- 2026-06-24: Se ejecuto la primera bajada fullstack de `ExecutionOrder` en MOD11. Backend: nuevas entidades tenant-aware, migracion `046`, rutas `/tasks/execution-orders/*` y creacion de OT al confirmar agenda desde WFM. Frontend: `Operaciones` incorpora drawer de OT de ejecucion y `Programacion` agrega CTA para abrirla. Validacion ejecutada: suites focalizadas backend/portal y typecheck puntual en verde.

### Salvedad vigente

La trazabilidad de materiales ya opera desde `technicianCustodyId` y `finalDisposition`, pero el bounded context formal de Inventario/Almacen aun no existe en el repo. La integracion actual queda implementada como adaptador MVP de custodia operativa, lista para sustituirse por puerto tipado cuando Inventario sea owner activo.
