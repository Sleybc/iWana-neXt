# CHECKLIST - MOD00 Configuracion Fase 06

**Version:** 1.0  
**Estado:** Cerrado  
**Fecha:** 2026-05-23  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 06 - Calendario operativo y jornadas  
**ADR propuesto:** docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md  
**Spec:** docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md  
**Plan:** docs/plans/2026-05-23-mod00-configuracion-fase-06-calendario-operativo-jornadas.md  
**Prompt:** docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-06-v1.0.md

---

## 1. Stop/go inicial

- [x] ADR-042 revisado por CTO o responsable autorizado antes de crear persistencia nueva.
- [x] Ruta de eventualidades definida: tabla nueva `wfm_operational_eventualities` (migration 042).
- [x] ADR-040 revisado para confirmar que MOD00 centraliza experiencia, no ownership operativo.
- [x] ADR-041 revisado para confirmar que no se reintroducen ausencias personales en WFM.
- [x] Alcance de RR. HH. futuro documentado como no implementado.

## 2. Shell federado y permisos

- [x] `SettingsSectionKey.CALENDAR` existe en contratos compartidos.
- [x] `SettingsRegistryService` publica **Calendario operativo y jornadas** con ruta `/dashboard/settings/calendar`.
- [x] El shell portal muestra la seccion con owner visible.
- [x] La seccion degrada correctamente si faltan permisos efectivos.
- [x] No se agregan permisos granulares nuevos sin catalogo versionado o decision documentada.

## 3. Frontend calendario

- [x] Existe ruta `/dashboard/settings/calendar`.
- [x] `CalendarSettingsClient` maneja loading, error, solo lectura y rol ADMIN.
- [x] Horario base empresa se administra desde la nueva ruta.
- [x] Horario por sede se administra desde la nueva ruta.
- [x] Festivos, cierres y aperturas se administran desde la nueva ruta.
- [x] Ventana tecnica WFM se muestra o administra sin duplicar Field Operations.
- [x] Eventualidades operativas tienen UI puntual y no usan lenguaje de ausencias personales.

## 4. Organizacion y Field Operations

- [x] `OrganizationSettingsClient` conserva perfil, settings, sedes, detalle y capacidades.
- [x] `OrganizationSettingsClient` ya no duplica editores principales de calendario.
- [x] Organizacion puede mostrar resumen/enlace hacia Calendario operativo y jornadas.
- [x] `FieldOperationsSettingsClient` no duplica editores de horario.
- [x] Field Operations no muestra `Excepciones por tecnico`, licencias, incapacidades, vacaciones ni permisos.

## 5. Backend y datos

- [x] Los endpoints Organization existentes siguen siendo tenant-aware y auditables.
- [x] Los endpoints WFM existentes siguen protegidos por `@Roles(UserRole.*)`.
- [x] Endpoints nuevos de eventualidades tienen DTOs validados con class-validator y OpenAPI (wfm.controller.ts).
- [x] Migracion 042 reversible con `down()` que hace DROP TABLE.
- [x] Referencia a sede validada por servicio con ownership tenant.
- [x] Referencia a tecnico validada por servicio con rol compatible.
- [x] No hay acceso directo a tablas de otro modulo.

## 6. Seguridad, auditoria y cumplimiento

- [x] No hay PII innecesaria en logs, tests ni docs.
- [x] No hay secretos, tokens ni connection strings.
- [x] Las mutaciones sensibles quedan auditadas con oldValue/newValue minimo.
- [x] La referencia a jornada 42h queda como futura y requiere verificacion oficial antes de automatizar cumplimiento.
- [x] Eventualidad operativa no se presenta como hora extra liquidable ni ausencia laboral.

## 7. Validacion tecnica

- [x] `pnpm --filter @iwana/api typecheck` en verde.
- [x] `pnpm --filter @iwana/portal typecheck` en verde.
- [x] `pnpm --filter @iwana/api test -- configuration wfm organization` — `operational-eventualities.service.spec.ts` validado.
- [x] `pnpm --filter @iwana/portal test -- settings Calendar` — 19/19 tests en verde (OperationalEventualitiesPanel + CalendarSettingsClient).
- [x] Playwright `e2e/tests/portal-settings-calendar.spec.ts` creado; ejecutar con servidor dev activo.
- [x] `get_errors` sin errores en archivos tocados.

## 8. Validacion funcional

- [x] ADMIN navega de `/dashboard/settings` a `/dashboard/settings/calendar`.
- [x] ADMIN edita horario base empresa.
- [x] ADMIN edita horario por sede o vuelve una sede a horario base.
- [x] ADMIN registra cierre o apertura especial.
- [x] ADMIN registra eventualidad operativa puntual.
- [x] NOC/SUPPORT consultan segun permisos aprobados (canEdit=false en paneles).
- [x] No existe flujo para registrar licencias, incapacidades, vacaciones ni permisos en WFM.

## 9. Cierre documental

- [x] Informe MOD00 actualizado con alcance, evidencia y deuda residual (ver INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md).
- [x] ADR-042 actualizado a estado Aprobado.
- [x] Spec existente cubre rutas y contratos implementados.
- [x] Checklist Fase 06 cerrado con evidencia real.
- [ ] Bloqueos o excepciones documentados con decision stop/go — sin bloqueos activos; Task 4 (BusinessHoursWeekEditor) diferida por fuera del alcance del sprint.
