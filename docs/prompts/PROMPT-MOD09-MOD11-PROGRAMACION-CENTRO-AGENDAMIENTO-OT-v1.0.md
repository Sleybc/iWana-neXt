# PROMPT - MOD09 Programacion como Centro de Agendamiento y MOD11 OT de Ejecucion

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-24  
**Modo activo:** Ejecucion  
**Generado por:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Ejecutor previsto:** Sr. Dev Fullstack  
**Archivo destino:** docs/prompts/PROMPT-MOD09-MOD11-PROGRAMACION-CENTRO-AGENDAMIENTO-OT-v1.0.md

---

## Modulo

- **Nombre principal:** Programacion / WFM
- **Codigo:** MOD09
- **Modulo relacionado:** MOD11 Ejecucion Operativa / Tareas
- **Fase objetivo:** Separacion de agenda y OT de ejecucion
- **Fecha:** 2026-06-24

---

## 1. Objetivo exacto de la fase

Implementar la separacion operativa donde `Programacion` queda como centro unico de agendamiento y `MOD11` pasa a ser owner de la OT enriquecida de campo, incluyendo trabajo realizado y consumo de inventario previamente cargado al tecnico o cuadrilla.

### Resultado esperado

Un coordinador puede:

- crear o coordinar solicitudes de visita desde MOD09;
- confirmar agenda y abrir OT en MOD11;
- reprogramar o reasignar sin capturar trabajo de campo en WFM;
- ver el estado resumido de ejecucion desde Programacion.

Un tecnico o cuadrilla puede:

- abrir la OT en MOD11;
- registrar trabajo realizado;
- consumir equipos/materiales desde su custodia operativa;
- cerrar la OT con resultado tecnico.

---

## 2. Artefactos de entrada obligatorios

- Spec principal: docs/specs/2026-06-24-mod09-mod11-programacion-centro-agendamiento-ot-ejecucion-design.md
- ADR aprobado: docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md
- ADRs base: docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md, docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md
- PRDs: docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- HLDs: docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- Plan de implementacion: docs/plans/2026-06-24-mod09-mod11-programacion-centro-agendamiento-y-ot-ejecucion.md
- Gobernanza: AGENTS.md, .github/copilot-instructions.md
- Stack: docs/prds/Stack_Tecnologico.md

---

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer spec, ADR, PRD, HLD y plan antes de tocar codigo.
2. Mantener `MOD09` limitado a agenda, despacho, reasignacion, reprogramacion y supervision resumida.
3. No agregar en WFM formularios de materiales, seriales, actividades de campo ni cierre tecnico.
4. Crear o activar la OT enriquecida en `MOD11` cuando la agenda quede confirmada.
5. Tratar la `WorkOrder` actual de WFM como puente transitorio, no como owner final de ejecucion.
6. Consumir inventario desde la custodia del tecnico/cuadrilla, no desde stock abstracto de agenda.
7. Mantener integracion por referencias logicas, puertos o eventos; no leer tablas cross-module.
8. Documentar todo cambio de boundary o incompatibilidad antes de seguir.

---

## 4. Restricciones no negociables

- No romper multi-tenancy por schema.
- No usar FKs cross-module entre MOD09, MOD11 e Inventario.
- No mover trabajo de campo detallado a Programacion.
- No convertir Inventario en owner de agenda ni MOD11 en owner de agenda.
- No exponer PII real, secretos ni tokens.
- No introducir infraestructura fuera del stack aprobado sin ADR.
- No dejar al tecnico ejecutando desde `ScheduleEvent`; debe ejecutar desde la OT.

---

## 5. Entregables tecnicos obligatorios

### Backend

- Servicio de creacion/activacion de OT desde agenda confirmada.
- Modelo `ExecutionOrder` y sus agregados de ejecucion.
- Endpoints MOD11 para:
  - abrir OT
  - iniciar ejecucion
  - registrar trabajo
  - registrar consumo/instalacion/devolucion
  - cerrar OT
- Integracion de consumo de inventario por custodia del tecnico/cuadrilla.

### Frontend

- Ajuste de `Programacion` para abrir OT en lugar de capturar ejecucion.
- Drawer o vista de OT en `Operaciones`.
- Flujo de trabajo de campo, inventario y cierre tecnico en MOD11.

### Documentacion

- Actualizar PRD/HLD de MOD09 y MOD11.
- Actualizar informes vivos.
- Mantener trazabilidad con ADR-047.

---

## 6. Lo que no entra en esta fase

- App movil nativa.
- Geofencing o GPS realtime.
- Mapa o optimizacion de rutas.
- BPM complejo.
- Control financiero avanzado de inventario.
- Reestructuracion total de CRM o Assurance.

---

## 7. Criterios de aceptacion

- `Programacion` no captura trabajo de campo detallado.
- Al confirmar agenda, existe OT en MOD11 o handoff claro hacia su creacion.
- El tecnico/cuadrilla puede ejecutar y cerrar desde OT.
- La OT consume inventario desde custodia del tecnico/cuadrilla.
- La trazabilidad deja claro que item salio de bodega, fue asignado a tecnico y termino en cliente/consumo/retorno.
- La supervision en WFM muestra solo estado resumido de ejecucion.

---

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- la implementacion requiere romper ADR-037 o ADR-046 sin documentarlo;
- aparece necesidad de leer tablas de Inventario, WFM o MOD11 de forma cruzada y directa;
- la OT no puede distinguir entre custodia de tecnico y stock global;
- `Programacion` empieza a absorber materiales/equipos/cierre tecnico para "salir rapido".

### Documentar causa en

- docs/informes/INFORME-MOD09-FASE-02-v1.0.md
- docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md

### Escalar a

- EM-ARCH primero
- CTO si cambia boundary, ownership o estrategia de inventario

---

## 9. Criterio de salida

- OT enriquecida con owner claro en MOD11.
- Programacion limitada a agendamiento.
- Consumo de inventario desde custodia operativa funcional o bloqueo documentado.
- PRD/HLD/informes alineados.
- Tests backend y frontend focalizados en verde o bloqueo documentado.
