# PROMPT - MOD09 Programacion / WFM Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-09  
**Modo activo:** EM  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Archivo destino:** docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md

---

## Modulo

- **Nombre:** Programacion / WFM
- **Codigo:** MOD09
- **Fase:** Fase 02 - Command center liviano
- **Version:** 1.0
- **Fecha:** 2026-05-09
- **Ejecutor previsto:** Sr. Dev Fullstack

---

## 1. Objetivo exacto de la fase

Implementar la evolucion de MOD09 hacia una vista operacional de supervision dentro de la ruta actual `/dashboard/scheduling`, basada en la agenda y Work Orders ya existentes.

### Resultado esperado

Un usuario `ADMIN`, `NOC` o `SUPPORT` puede abrir un command center liviano con KPIs priorizados, alertas operativas, timeline diario por tecnico y carga por responsable, sin perder acceso a calendario y lista.

### Lo que si entra

- Extender `WfmDashboardSummary` con KPIs y alertas aditivas.
- Calcular banda de saturacion por tecnico.
- Reusar eventos del dia para timeline de supervision.
- Crear componentes portal para overview, alertas, timeline y carga.
- Mantener filtros sincronizados entre command center, calendario y lista.
- Mantener gating por rol y ownership existentes.
- Actualizar pruebas backend, frontend y E2E focalizadas.
- Actualizar informe y evidencia de calidad.

### Lo que no entra

- Mapa.
- GPS realtime, WebSocket o SSE.
- Drag-and-drop.
- IA o smart dispatch.
- Kanban.
- Capacity planning por zona.
- Inventario, materiales, firma o mobile tecnico.
- Nuevas tablas persistentes para alertas.

---

## 2. Artefactos de entrada obligatorios

- PRD del modulo: docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- Addendum funcional: docs/prds/PRD-MOD09-PROGRAMACION-WFM-ADDENDUM-COMMAND-CENTER-v1.1.md
- HLD del modulo: docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- Spec de diseno: docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md
- ADR aplicable: docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- Sprint plan aplicable: docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md
- Informe previo: docs/informes/INFORME-MOD09-FASE-01-v1.0.md
- Informe vivo de la fase: docs/informes/INFORME-MOD09-FASE-02-v1.0.md
- Stack: docs/prds/Stack_Tecnologico.md
- Gobernanza: AGENTS.md, .github/copilot-instructions.md
- Instrucciones aplicables: .github/instructions/api.instructions.md, .github/instructions/frontend.instructions.md, .github/instructions/portal.instructions.md, .github/instructions/testing.instructions.md, .github/instructions/e2e.instructions.md

### Artefactos faltantes detectados

- Ninguno para iniciar Fase 02.

---

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer PRD base, addendum, HLD, spec, plan e informe previo antes de tocar codigo.
2. Mantener el trabajo dentro del boundary `WfmModule`; no abrir integraciones nuevas ni dependencias de mapa o realtime.
3. Implementar primero las extensiones backend del summary y las reglas de alerta con pruebas en rojo/verde.
4. Reusar `GET /wfm/events` y `GET /wfm/technicians/availability` antes de proponer endpoints nuevos.
5. Separar la nueva vista operacional en componentes nuevos; no seguir agrandando `SchedulingClient` sin necesidad.
6. Mantener copy en espanol y enfoque de consola operativa, no landing.
7. No exponer KPIs globales ni alertas agregadas a `TECHNICIAN` o `CONTRACTOR`.
8. Si aparece una necesidad real de realtime, mapa o algoritmo de dispatch, detenerse y escalar.
9. Actualizar informe de fase y evidencia de calidad al cerrar cada bloque funcional relevante.

---

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro modulo directamente.
- No usar credenciales, tokens ni datos reales.
- No omitir validacion ni pruebas de reglas core.
- No introducir WebSocket, SSE o proveedores de mapa.
- No crear nuevas tablas para alertas o timeline.
- No exponer vistas globales a roles restringidos.
- No eliminar calendario ni lista actuales.
- No introducir drag-and-drop, Kanban o dispatch asistido en esta fase.

---

## 5. Entregables tecnicos obligatorios

### Backend

- Extension de DTO/tipo `WfmDashboardSummary`.
- Reglas de alertas y saturacion dentro de la superficie WFM existente.
- Ajustes de controller/service necesarios para summary aditivo.
- Tests unitarios/integracion focalizados.

### Frontend

- Integracion de vista operacional en `apps/portal/src/app/dashboard/scheduling/page.tsx` via `SchedulingClient`.
- Componentes nuevos de overview, alertas, timeline y carga en `apps/portal/src/components/scheduling/`.
- Helpers UI y mapping de severidad/carga consistentes con el patron actual.

### Tests

- Unit/integration backend de summary, alertas y gating.
- Tests frontend de render e interacciones clave.
- E2E portal para command center y restriccion por rol.

---

## 6. Entregables documentales obligatorios

- Actualizar `docs/informes/INFORME-MOD09-FASE-02-v1.0.md` como documento vivo.
- Crear o actualizar evidencia de calidad en `docs/quality/`.
- No crear ADR nuevo salvo cambio estructural real.
- No actualizar PRD/HLD salvo desviacion aprobada por EM-ARCH.
- Documentar decision stop/go si aparece bloqueo tecnico.

---

## 7. Criterios de aceptacion

- CA-WFM-13: Admin/NOC/Support visualiza command center con KPIs priorizados.
- CA-WFM-14: El timeline diario agrupa por tecnico y abre detalle del evento.
- CA-WFM-15: La pantalla muestra carga y saturacion por tecnico con semantica consistente.
- CA-WFM-16: Las alertas son deterministicas y no requieren persistencia nueva.
- CA-WFM-17: Tecnico y contratista no visualizan KPI global ni alertas agregadas.
- CA-WFM-18: Si una fuente secundaria falla, la pantalla degrada a cobertura parcial sin caida total.
- CA-WFM-19: Calendario y lista existentes siguen operativos y sincronizados con filtros.
- CA-WFM-20: Tests focalizados en verde o bloqueo documentado.

---

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- La implementacion exige infraestructura realtime no aprobada.
- Se requiere una dependencia de mapa o libreria pesada fuera del stack aprobado.
- Se detecta exposicion de datos globales a `TECHNICIAN` o `CONTRACTOR`.
- La solucion propuesta exige nuevas tablas o un cambio de boundary.
- El summary extendido rompe compatibilidad de consumidores vigentes.

### Documentar causa en

- `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`.
- Documento de bloqueo tecnico aplicable si corresponde.

### Escalar a

- EM-ARCH primero.
- CTO si afecta boundary, seguridad, multi-tenancy o stack.

### Recomendacion esperada

Presentar maximo 3 opciones, impacto y recomendacion concreta.

---

## 9. Criterio de salida de la fase

- Backend validado con tests focalizados.
- Frontend validado con tests focalizados.
- Sin cambios de base de datos no aprobados.
- E2E ejecutado o bloqueo documentado.
- Informe y evidencia de calidad actualizados.
- Command center liviano operativo sin degradar las vistas existentes.