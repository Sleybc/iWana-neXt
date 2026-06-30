# ADR-042: Calendario operativo y jornadas como seccion federada MOD00

**Version:** 1.0  
**Estado:** Propuesto  
**Fecha:** 2026-05-23  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD00 Configuracion Control Plane / MOD09 WFM  
**PRD relacionado:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**Spec relacionada:** docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md  
**ADR antecedente:** docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md  
**ADR relacionado:** docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md

---

## Contexto

MOD00 ya opera como control plane federado de configuracion del tenant. En el estado actual, el usuario administra sedes, capacidades y horarios institucionales desde Organizacion, mientras que Operacion de campo expone configuracion WFM relacionada con horarios y cierres tecnicos.

La experiencia visible quedo funcional, pero no refleja de forma simple la operacion real del tenant:

- la empresa tiene un horario base general;
- algunas sedes pueden operar distinto;
- los tecnicos se programan dentro de esas ventanas;
- una eventualidad operativa puede abrir o bloquear una franja puntual;
- ausencias personales como licencias, incapacidades, vacaciones o permisos no pertenecen a WFM y deberan venir de RR. HH. futuro.

ADR-041 retiro las Excepciones por tecnico de WFM para evitar que el modulo de programacion se convirtiera en owner de ausencias personales. La aclaracion de producto mantiene esa decision, pero distingue un concepto valido para WFM: **eventualidades operativas puntuales** derivadas de programacion, fallas, visitas extraordinarias o extensiones de jornada.

El sistema aun no esta en produccion, por lo que conviene corregir la arquitectura de informacion y la trazabilidad antes de consolidar deuda conceptual.

---

## Decision

Se adopta la seccion federada **Calendario operativo y jornadas** dentro de MOD00 Settings.

Ruta propuesta:

```text
/dashboard/settings/calendar
```

La seccion centraliza la experiencia de usuario para:

1. horario base de empresa;
2. horarios por sede;
3. festivos, cierres y aperturas especiales;
4. ventana tecnica consumida por programacion WFM;
5. eventualidades operativas puntuales;
6. evidencia para RR. HH. futuro.

La decision mantiene ownership separado:

- **Organization** conserva sedes, capacidades, horario base, horario por sede y excepciones de calendario empresarial.
- **WFM** conserva programacion, Work Orders, recomendaciones, cierres tecnicos y eventualidades operativas puntuales.
- **RR. HH. futuro** sera owner de licencias, incapacidades, vacaciones, permisos, ausencias personales, control formal de jornada y reglas laborales.

La seccion no introduce un calendario transversal unico ni convierte MOD00 en owner de datos operativos de WFM o RR. HH.

---

## Reglas de boundary

1. MOD00 centraliza navegacion y experiencia, no ownership de todos los datos.
2. Organization no debe leer ni escribir tablas internas de WFM.
3. WFM no debe leer tablas de Organization directamente; consume sedes por puertos o APIs aprobadas.
4. WFM no debe registrar licencias, incapacidades, vacaciones ni permisos.
5. Eventualidad operativa es evidencia operacional puntual; no es liquidacion laboral ni ausencia personal.
6. Cuando exista RR. HH., WFM debera consumir ausencias aprobadas mediante un puerto tipado, por ejemplo `HcmAbsenceReadPort`.
7. Cualquier motor comun de calendario cross-module requiere ADR nuevo y aprobacion CTO.

---

## Consecuencias

### Positivas

- El usuario encuentra horarios y jornadas en una seccion coherente.
- Se reduce duplicidad entre Organizacion y Operacion de campo.
- Se preserva ADR-040: MOD00 centraliza experiencia, no datos operativos ajenos.
- Se preserva ADR-041: ausencias personales no vuelven a WFM.
- WFM gana una superficie clara para eventualidades operativas puntuales.
- RR. HH. futuro recibe una frontera conceptual limpia para consumir evidencia operacional.

### Costos y tradeoffs

- Requiere nueva metadata de settings y ruta portal.
- Requiere extraer UI de horarios desde `OrganizationSettingsClient` y `WfmOperatingHoursManager`.
- Si se crea `wfm_operational_eventualities`, requiere entidad, migracion reversible, DTOs, OpenAPI, tests y auditabilidad.
- Si se reutiliza `technician_availability` como transicion, debe evitarse lenguaje de ausencias personales en UI.
- Se deben actualizar pruebas unitarias, HTTP y Playwright del shell de settings.

### Riesgos aceptados

- El nombre "jornadas" puede sugerir RR. HH.; el copy debe aclarar que el MVP no liquida horas ni gestiona permisos laborales.
- La referencia a jornada semanal de 42 horas requiere verificacion oficial antes de automatizar cumplimiento.
- Unificar experiencia de calendario puede parecer ownership unico si no se muestran boundaries y owner modules correctamente.

---

## Alternativas consideradas

### A1: Mantener horarios en Organizacion y WFM

Descartada. Conserva boundaries, pero mantiene la friccion del usuario y la duplicidad visible.

### A2: Crear un calendario transversal unico

Descartada para este corte. Puede ser deseable en el futuro, pero cambia ownership y requiere ADR/CTO.

### A3: Reintroducir excepciones por tecnico en WFM

Descartada. Contradice ADR-041 y mezcla ausencias personales con programacion.

### A4: Crear Calendario operativo y jornadas como shell federado

Elegida. Centraliza experiencia y mantiene ownership por bounded context.

---

## Impacto de implementacion

- Shared: agregar `SettingsSectionKey.CALENDAR` y, si se aprueba, permisos de eventualidades.
- API: registrar nueva seccion en `SettingsRegistryService`.
- Portal: crear `/dashboard/settings/calendar` y `CalendarSettingsClient`.
- Organization UI: retirar editores principales de horarios y dejar resumen/enlace.
- WFM UI: retirar duplicacion de calendario y exponer eventualidades operativas puntuales.
- Database: si se crea tabla nueva, usar migracion tenant reversible y multi-tenant por schema.
- OpenAPI: actualizar si se agregan endpoints de eventualidades.
- Testing: Jest/API/portal/E2E focalizados.
- Docs: mantener spec, plan, prompt, checklist e informe vivo alineados.

---

## Estado de aprobacion

Este ADR queda en estado **Propuesto** para revision CTO antes de ejecutar cambios productivos que creen persistencia nueva o endpoints nuevos de eventualidades.

La refactorizacion puramente visual del shell federado puede prepararse como plan, pero el GO de implementacion debe respetar el criterio de salida del plan Fase 06.

---

## Referencias

- AGENTS.md
- docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md
- docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md
- docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md
- docs/plans/2026-05-23-mod00-configuracion-fase-06-calendario-operativo-jornadas.md
- docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-06-v1.0.md
