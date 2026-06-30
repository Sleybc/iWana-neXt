# PROMPT - MOD09 Bandeja de visitas pendientes UX operativa

**Version:** 1.1  
**Estado:** En revisión  
**Fecha:** 2026-05-15  
**Modo activo:** EM  
**Generado por:** AI-EM-ARCH  
**Ejecutor previsto:** Sr. Dev Fullstack  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Archivo destino:** docs/prompts/PROMPT-MOD09-BANDEJA-VISITAS-PENDIENTES-UX-v1.1.md

---

## Modulo

- **Nombre:** Programacion / WFM
- **Codigo:** MOD09
- **Fase:** Bandeja de visitas pendientes - UX operativa
- **Version:** 1.1
- **Fecha:** 2026-05-15
- **Aprobacion requerida:** EM-ARCH antes de ejecutar en codigo

---

## 1. Objetivo exacto de la fase

Refinar fullstack la pantalla `/dashboard/scheduling/pending-visits` para que funcione como consola operativa legible y accionable: bandeja escalable para 50+ solicitudes, filtros territoriales con opciones, duracion antes de recomendaciones, matriz semanal amplia/interactiva y refresco inmediato al abrir solicitudes desde CRM.

### Resultado esperado

Un usuario `ADMIN`, `NOC` o `SUPPORT` puede revisar una bandeja densa, filtrar por territorio, seleccionar una solicitud, indicar duracion, calcular recomendaciones por disponibilidad territorial, escoger una franja desde recomendaciones o matriz y confirmar agenda. Un usuario `SALES` conserva solo el modo CRM asistido.

### Lo que si entra

- Endpoint WFM de opciones para filtros territoriales.
- Bandeja desktop densa tipo tabla/lista operativa.
- Filtros horizontales con municipio/sector como selectores/autocomplete.
- Panel lateral compacto de solicitud.
- Flujo de recomendacion basado en duracion + horizonte, no fecha/hora obligatoria previa.
- Matriz semanal amplia, legible e interactiva.
- Correccion del refresco/seleccion inmediata al llegar desde CRM.
- Tests backend, frontend y E2E focalizados.
- Actualizacion del informe vivo y quality.

### Lo que no entra

- Mapa operativo.
- Drag-and-drop real de eventos.
- Optimizacion de rutas con trafico.
- IA predictiva.
- Nuevo catalogo maestro territorial fuera de WFM.
- Cambios al ownership definido en ADR-039.
- Lecturas directas de tablas CRM o Assurance desde WFM.

## 2. Artefactos de entrada obligatorios

- Plantilla base: docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md
- Gobernanza: AGENTS.md, .github/copilot-instructions.md
- Stack: docs/prds/Stack_Tecnologico.md
- PRD del modulo: docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- ADR WFM: docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- ADR Bandeja WFM: docs/adrs/ADR-039-Bandeja-Visitas-Pendientes-WFM.md
- Spec base: docs/specs/SPEC-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md
- Spec de esta fase: docs/specs/SPEC-MOD09-BANDEJA-VISITAS-PENDIENTES-UX-v1.1.md
- Prompt base anterior: docs/prompts/PROMPT-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md
- Informe vivo: docs/informes/INFORME-MOD09-FASE-02-v1.0.md
- Instrucciones aplicables: .github/instructions/api.instructions.md, .github/instructions/database.instructions.md, .github/instructions/frontend.instructions.md, .github/instructions/portal.instructions.md, .github/instructions/testing.instructions.md, .github/instructions/e2e.instructions.md

### Artefactos faltantes detectados

- No hay catalogo territorial WFM aprobado. Para esta fase, derivar opciones desde `visit_requests` tenant-aware y documentar si se requiere catalogo maestro futuro.

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer la spec v1.1 completa antes de tocar codigo.
2. Mantener ADR-039: WFM owner de `VisitRequest`, sin FKs ni lecturas directas cross-module.
3. Implementar primero el contrato backend `GET /api/v1/wfm/visit-requests/filter-options` con `runInTenantSchema()`.
4. Derivar municipios/sectores desde `visit_requests` activas y devolver conteos.
5. Ajustar `prepareVisitRequestRecommendation()` para aceptar recomendacion basada en duracion + horizonte aunque la solicitud no tenga ventana persistida, siempre que tenga ubicacion suficiente.
6. Corregir flujo CRM para que la solicitud creada/recuperada aparezca seleccionada inmediatamente sin salir y volver a entrar.
7. Rediseñar `pending-visits` a layout de consola: bandeja amplia + panel lateral, y matriz amplia en modo recomendacion.
8. Convertir bandeja desktop a tabla/lista densa; mantener cards solo como fallback mobile si aplica.
9. Reemplazar inputs libres de municipio/sector por selectores/autocomplete con opciones del endpoint.
10. Mover la captura de duracion antes de calcular recomendaciones.
11. Hacer la matriz semanal accionable: seleccionar franja recomendada o disponible y sincronizar seleccion con el panel de recomendaciones.
12. Reducir duplicacion visual en el panel lateral; no repetir card completa de instalacion.
13. Mantener modo CRM asistido para `SALES`; no abrir bandeja global ni creacion manual a ese rol.
14. Actualizar API client, tests y E2E.
15. Registrar evidencia en `docs/informes/INFORME-MOD09-FASE-02-v1.0.md` y `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`.

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No leer tablas CRM/Assurance desde WFM.
- No introducir mapa, drag-and-drop, realtime ni IA.
- No renderizar enums crudos.
- No usar `npm` ni `yarn`; usar `pnpm`.
- No guardar PII real en docs, logs ni tests.
- No degradar calendario/lista/command center existentes.
- No permitir bandeja global a `TECHNICIAN` o `CONTRACTOR`.
- No permitir bandeja global/manual a `SALES`.

## 5. Entregables tecnicos obligatorios

### Backend

- DTO/query para `GET /wfm/visit-requests/filter-options`.
- Metodo en `VisitRequestsService` para opciones territoriales con conteos.
- Tests unitarios/HTTP del nuevo endpoint.
- Ajuste de recomendacion por solicitud con duracion + horizonte.

### Portal

- `PendingVisitRequestInbox.tsx` rediseñado como bandeja densa en desktop.
- `PendingVisitRequestsView.tsx` con layout de consola y panel lateral.
- `VisitRequestRecommendationPanel.tsx` con duracion primero y horizonte de busqueda.
- `WeeklyTechnicianMatrix.tsx` con seleccion de franja y mejor legibilidad.
- `ScheduleVisitRequestConfirmDialog.tsx` conservando confirmacion compacta.
- API client actualizado para filtros territoriales y nuevas opciones de recomendacion.

### Tests

- Backend: filtro territorial, conteos, exclusion de terminales, roles.
- Frontend: filtros territoriales, duracion primero, CRM refresh, matriz seleccionable.
- E2E portal: CRM -> pending-visits -> solicitud visible/seleccionada -> recomendacion -> seleccion de franja -> confirmacion.

## 6. Entregables documentales obligatorios

- Actualizar `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`.
- Actualizar `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`.
- Documentar comandos ejecutados y resultado.
- Crear ADR solo si aparece cambio de boundary, stack, seguridad o ownership.

## 7. Criterios de aceptacion

- CA-BVP-UX-01: Bandeja desktop escaneable con 50 solicitudes sin amontonamiento visual.
- CA-BVP-UX-02: Municipio y sector son filtros con opciones y conteos.
- CA-BVP-UX-03: Solicitud CRM aparece seleccionada inmediatamente al entrar desde oportunidad.
- CA-BVP-UX-04: Duracion estimada se captura antes de recomendaciones.
- CA-BVP-UX-05: Recomendaciones pueden calcularse con horizonte de busqueda sin fecha/hora manual exacta previa.
- CA-BVP-UX-06: Matriz semanal permite seleccionar una franja o usar una recomendacion.
- CA-BVP-UX-07: Recomendacion seleccionada y matriz permanecen sincronizadas.
- CA-BVP-UX-08: Panel lateral elimina duplicacion visual y muestra solo contexto necesario.
- CA-BVP-UX-09: `SALES` queda limitado a modo CRM asistido.
- CA-BVP-UX-10: Tests focalizados y E2E del flujo corregido quedan en verde o bloqueo documentado.

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- Se requiere cambiar ADR-039 o ownership de `VisitRequest`.
- Los filtros territoriales exigen consultar tablas CRM o Assurance.
- La matriz accionable requiere drag-and-drop real para cumplir el flujo minimo.
- No se puede evitar duplicidad o invisibilidad de solicitudes CRM creadas.
- La solucion compromete accesibilidad basica de teclado/foco.

### Documentar causa en

- docs/informes/INFORME-MOD09-FASE-02-v1.0.md
- docs/quality/QUALITY-MOD09-FASE-02-v1.0.md

### Escalar a

- EM-ARCH primero.
- CTO si afecta boundary, seguridad, multi-tenancy, stack o ADR aprobado.

## 9. Criterio de salida de la fase

- Backend validado con tests unitarios/HTTP.
- Portal validado con tests de componentes.
- Playwright focalizado del flujo CRM y confirmacion desde bandeja en verde.
- Typecheck API y portal en verde; DB/worker solo si se tocan.
- Informe vivo y quality actualizados.
- Pantalla revisada visualmente en desktop con datos suficientes para detectar densidad.
