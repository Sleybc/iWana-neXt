# PROMPT - MOD00 Configuracion Fase 06

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-05-23  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 06 - Calendario operativo y jornadas  
**Modo activo:** Mixto  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md

---

## 1. Objetivo exacto de la fase

Implementar la seccion **Calendario operativo y jornadas** como superficie federada de settings para centralizar horarios de empresa, horarios por sede, cierres, aperturas, ventana tecnica y eventualidades operativas puntuales.

### Lo que si entra

- Nueva tarjeta federada en `/dashboard/settings`.
- Nueva ruta `/dashboard/settings/calendar`.
- Extraccion de editores principales de horarios desde Organizacion.
- Reubicacion de ventana tecnica y cierres WFM sin duplicar UI en Field Operations.
- Primera version de eventualidades operativas puntuales.
- Trazabilidad para consumo futuro de RR. HH.
- Pruebas unitarias, HTTP y E2E focalizadas.

### Lo que no entra

- Licencias, incapacidades, vacaciones o permisos laborales.
- Nomina, liquidacion de horas o calculo legal definitivo.
- Motor transversal unico de calendario.
- Lecturas directas a tablas de otro bounded context.
- Eliminacion de persistencia legacy sin plan aprobado.

## 2. Artefactos de entrada obligatorios

- ADR propuesto: docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md
- ADR MOD00: docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- ADR WFM: docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md
- PRD MOD00: docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- HLD MOD00: docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Spec de diseno: docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md
- Plan Fase 06: docs/plans/2026-05-23-mod00-configuracion-fase-06-calendario-operativo-jornadas.md
- Checklist Fase 06: docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-06-v1.0.md
- Informe vivo MOD00: docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md

## 3. Instrucciones para Sr. Dev Fullstack

1. Iniciar por el stop/go del plan: confirmar si ADR-042 queda aprobado y si eventualidades usan tabla nueva o transicion sobre `technician_availability`.
2. Implementar primero el shell federado y la ruta vacia con estados robustos.
3. Extraer componentes reutilizables antes de mover logica desde `OrganizationSettingsClient` y `WfmOperatingHoursManager`.
4. Mantener boundaries: Organization conserva horarios empresariales; WFM conserva programacion y eventualidades operativas; RR. HH. futuro no se implementa.
5. No introducir copy ni formularios de licencias, vacaciones, incapacidades o permisos.
6. Actualizar contratos, OpenAPI, tests y E2E segun el camino de eventualidades elegido.
7. Cerrar con informe vivo y checklist marcando evidencia real.

## 4. Restricciones no negociables

- No romper ADR-040 ni ADR-041.
- No convertir MOD00 en owner de reglas WFM.
- No convertir WFM en owner de ausencias personales.
- No acceder directamente a tablas de otro modulo.
- No hardcodear tenant/schema.
- No agregar PII, secretos, tokens ni connection strings en codigo, tests, docs o logs.
- No automatizar cumplimiento de jornada 42h sin verificacion oficial y sin modulo RR. HH. aprobado.

## 5. Entregables tecnicos obligatorios

- Metadata nueva de settings para `Calendario operativo y jornadas`.
- Ruta portal `/dashboard/settings/calendar`.
- Cliente `CalendarSettingsClient` o equivalente.
- Componentes extraidos para semana base, horarios por sede, excepciones y ventana WFM.
- Primera UI de eventualidades operativas puntuales.
- Backend/API/migracion si se aprueba modelo nuevo de eventualidades.
- Tests unitarios y HTTP actualizados.
- Playwright focalizado de la nueva ruta.

## 6. Entregables documentales obligatorios

- Informe MOD00 actualizado.
- Checklist Fase 06 actualizado con evidencia.
- ADR-042 actualizado de Propuesto a Aprobado si CTO lo aprueba.
- Spec actualizado si la implementacion cambia alcance o contratos.
- OpenAPI actualizado si hay endpoints nuevos.

## 7. Criterios de aceptacion

- CA-CFG6-01: `/dashboard/settings` muestra **Calendario operativo y jornadas** como seccion federada operable segun permisos.
- CA-CFG6-02: `/dashboard/settings/calendar` carga horarios base, sedes, cierres y ventana tecnica sin duplicar editores en otras rutas.
- CA-CFG6-03: Organizacion conserva sedes y capacidades, pero no muestra los editores principales de calendario.
- CA-CFG6-04: Field Operations no duplica la gestion de horarios ni reintroduce excepciones personales por tecnico.
- CA-CFG6-05: Eventualidades operativas permiten registrar variaciones puntuales sin modelar licencias, incapacidades, vacaciones ni permisos.
- CA-CFG6-06: El modelo elegido es tenant-safe, auditable y no tiene acceso cross-module directo.
- CA-CFG6-07: Tests focalizados y E2E de calendario pasan en verde.

## 8. Criterio de stop/go

Detenerse si aparece cualquiera de estos casos:

- la solucion requiere que MOD00 lea o escriba tablas internas de WFM;
- la solucion requiere que WFM registre ausencias personales;
- se necesita un calendario transversal unico para todos los modulos;
- se intenta automatizar cumplimiento laboral sin fuente oficial y sin RR. HH.;
- una migracion nueva no es reversible;
- la nueva UI expone PII o datos sensibles innecesarios.

Documentar causa en el informe vivo y escalar con `[ESCALACION AL CTO]`.

## 9. Criterio de salida de la fase

- Backend validado si hubo cambios de API.
- Frontend validado con tests focalizados.
- Base de datos validada si hubo migracion.
- Playwright de calendario en verde.
- Informe vivo actualizado con evidencia.
- Checklist Fase 06 cerrado o con bloqueos explicitos.
- Deuda residual documentada.
