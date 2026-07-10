# PROMPT - MOD00 Calendario operativo rediseño UI

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-05-29  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** Refinamiento UI/UX posterior a Fase 06  
**Modo activo:** Mixto  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

---

## 1. Objetivo exacto de la fase

Refinar `/dashboard/settings/calendar` para que un administrador entienda con rapidez que capa del calendario esta configurando y que impacto operativo tiene cada bloque, sin cambiar contratos, ownership ni logica base implementada en Fase 06.

### Lo que si entra

- Reordenar y jerarquizar la pantalla completa.
- Mejorar copy, estados y descripciones visibles del calendario.
- Crear una variante responsive del editor semanal.
- Reducir el ruido de formularios secundarios en excepciones y eventualidades.
- Contextualizar visualmente WFM dentro del calendario.
- Actualizar pruebas focalizadas y E2E de la ruta.
- Actualizar spec, checklist e informe vivo con la ejecucion real.

### Lo que no entra

- Cambios de API, DTOs, migraciones o modelos de datos.
- Cambios de permisos o reglas de tenancy.
- Reapertura del alcance funcional de Fase 06.
- Nueva logica de resolucion de horarios.
- Nuevas rutas fuera de `/dashboard/settings/calendar`.

## 2. Artefactos de entrada obligatorios

- Perfil rector: `docs/roles/_historico/Perfil_IA_EM_Architect_Unificado_v1.md`
- ADR MOD00: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- ADR Calendario: `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md`
- PRD MOD00: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD MOD00: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Spec base: `docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md`
- Spec de rediseño: `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md`
- Plan de implementación: `docs/plans/2026-05-29-mod00-refinamiento-calendario-operativo-jornadas.md`
- Checklist de salida: `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer la spec de rediseño y el plan completo antes de modificar código.
2. Tratar la iteracion como refinamiento visual gobernado, no como rediseño libre.
3. Mantener el orden funcional aprobado: horario base, horarios por sede, cierres por fecha, programacion de visitas, cambios puntuales.
4. Centralizar el copy nuevo en `mod00-settings-labels.ts`; no repartir labels hardcodeados.
5. Hacer que `BusinessHoursWeekEditor` conserve su contrato actual, pero con layout adaptado a mobile.
6. Mejorar jerarquia y feedback en `CalendarOrganizationHoursPanel` y `CalendarSiteHoursPanel` sin cambiar mutaciones.
7. Subordinar formularios secundarios en `CalendarExceptionsPanel` y `OperationalEventualitiesPanel` para que el listado y la lectura inicial ganen claridad.
8. Contextualizar `CalendarWfmPanel` y limitar cualquier cambio dentro de `WfmOperatingHoursManager` a presentacion segura.
9. Reutilizar `PortalAlert`, `PortalPanel` y primitives existentes antes de crear wrappers nuevos.
10. Ejecutar pruebas focalizadas del portal y Playwright de calendario antes de cerrar la checklist.
11. Si aparece necesidad de tocar backend, DTOs, permisos o nuevos endpoints, detenerse y documentar bloqueo en el informe vivo.
12. Cerrar documentacion con evidencia real: archivos tocados, comandos, resultados y deuda residual.

## 4. Restricciones no negociables

- No romper ADR-040 ni ADR-042.
- No cambiar ownership entre Organization, WFM y RR. HH. futuro.
- No agregar librerias, `tailwind.config.js` ni variaciones de stack.
- No introducir copy tecnico, nombres internos o siglas innecesarias en UI final.
- No exponer PII, secretos, tokens ni connection strings en codigo, tests, docs o logs.
- No resolver mobile con scroll horizontal como unica estrategia del editor semanal.
- No convertir el rediseño en refactor funcional profundo de `WfmOperatingHoursManager` sin aprobacion nueva.

## 5. Entregables tecnicos obligatorios

- `CalendarSettingsClient.tsx` refinado con header y jerarquia visibles.
- `BusinessHoursWeekEditor.tsx` con variante responsive estable.
- `CalendarOrganizationHoursPanel.tsx` y `CalendarSiteHoursPanel.tsx` con mejor lectura y feedback.
- `CalendarExceptionsPanel.tsx` y `OperationalEventualitiesPanel.tsx` con formularios secundarios subordinados.
- `CalendarWfmPanel.tsx` y, si aplica, `WfmOperatingHoursManager.tsx` con framing visual claro.
- Tests focalizados de portal actualizados.
- E2E `portal-settings-calendar.spec.ts` actualizado.

## 6. Entregables documentales obligatorios

- Spec de rediseño enlazada al plan, prompt y checklist.
- Informe vivo MOD00 actualizado con esta iteracion.
- Checklist `CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md` con evidencia real.
- Si surge bloqueo, documentar decision stop/go en el informe vivo sin alterar la Fase 06 cerrada.

## 7. Criterios de aceptacion

- CA-CAL-UX-01: la pantalla hace evidente que parte del calendario corresponde a empresa, sede, fechas especiales, programacion de visitas y cambios puntuales.
- CA-CAL-UX-02: el editor semanal es usable en mobile sin depender de una tabla rigida con scroll horizontal como solucion principal.
- CA-CAL-UX-03: excepciones y eventualidades dejan de competir con la lectura inicial de la pantalla.
- CA-CAL-UX-04: WFM queda contextualizado como capa especializada de programacion de visitas.
- CA-CAL-UX-05: el copy visible es consistente con vocabulario iWana y lenguaje de negocio.
- CA-CAL-UX-06: pruebas focalizadas y Playwright de calendario quedan en verde.

## 8. Criterio de stop/go

Detenerse inmediatamente si aparece cualquiera de estos casos:

- el refinamiento requiere endpoints nuevos o cambios de DTO;
- `WfmOperatingHoursManager` necesita reestructuracion funcional profunda;
- el responsive del editor semanal rompe accesibilidad o testids criticos sin una migracion controlada;
- la solucion propuesta mezcla horario base empresarial con eventualidades o ausencias personales.

Documentar la causa en `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` y escalar como `[ESCALACION AL CTO]` o bloqueo EM-ARCH segun corresponda.

## 9. Criterio de salida de la fase

- `pnpm --filter @iwana/portal typecheck` en verde.
- `pnpm --filter @iwana/portal test -- CalendarSettingsClient BusinessHoursWeekEditor CalendarWfmPanel WfmOperatingHoursManager OperationalEventualitiesPanel` en verde.
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts` en verde.
- Informe vivo actualizado con evidencia real.
- Checklist nueva cerrada o con bloqueos explicitos.
