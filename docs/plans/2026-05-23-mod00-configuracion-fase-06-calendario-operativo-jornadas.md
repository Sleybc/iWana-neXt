# MOD00 Configuracion Fase 06 Calendario operativo y jornadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la seccion federada **Calendario operativo y jornadas** para centralizar la experiencia de horarios, cierres, aperturas y eventualidades operativas sin mover ownership entre Organization, WFM y RR. HH. futuro.

**Architecture:** MOD00 publica la ruta y shell de experiencia; Organization conserva horario base, horario por sede y excepciones empresariales; WFM conserva programacion, ventana tecnica y eventualidades operativas puntuales. RR. HH. futuro queda documentado como owner de ausencias personales mediante puerto tipado, sin implementarse en esta fase.

**Tech Stack:** NestJS, TypeORM, PostgreSQL multi-tenant por schema, Zod/class-validator segun boundary existente, OpenAPI, Next.js App Router, React, Tailwind v4, Jest, Supertest, Playwright, pnpm/Turborepo.

---

## Source Artifacts

- ADR propuesto: `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md`
- ADR MOD00: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- ADR WFM: `docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md`
- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Spec: `docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md`
- Prompt: `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-06-v1.0.md`
- Checklist: `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-06-v1.0.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## Scope

### Build in Fase 06

- Nueva tarjeta federada `Calendario operativo y jornadas` en `/dashboard/settings`.
- Nueva ruta portal `/dashboard/settings/calendar`.
- Extraccion de editores de horario desde Organizacion hacia la nueva ruta.
- Reubicacion de ventana tecnica y cierres WFM sin duplicar calendario en Field Operations.
- Primera version de eventualidades operativas puntuales.
- Trazabilidad para RR. HH. futuro sin implementar ausencias laborales ni nomina.
- Tests unitarios, HTTP y E2E focalizados.

### Do not build in Fase 06

- Licencias, incapacidades, vacaciones o permisos laborales.
- Liquidacion de horas, nomina o reglas definitivas de cumplimiento laboral.
- Motor transversal comun de calendarios.
- Acceso directo a tablas de otro bounded context.
- Eliminacion fisica de tablas legacy sin plan separado.

## File Structure

### Shared contracts

- Modify: `packages/shared/src/enums/configuration/settings-section-key.enum.ts`
- Optional modify: `packages/shared/src/enums/access-control/access-permission-key.enum.ts`
- Optional create: `packages/shared/src/enums/wfm/operational-eventuality-type.enum.ts`
- Optional create: `packages/shared/src/enums/wfm/operational-eventuality-origin.enum.ts`
- Optional create: `packages/shared/src/enums/wfm/operational-eventuality-status.enum.ts`
- Modify: `packages/shared/src/enums/wfm/index.ts` if new enums are created.

### Database

- Optional create: `packages/database/src/entities/wfm-operational-eventuality.entity.ts`
- Optional modify: `packages/database/src/entities/index.ts`
- Optional create: `packages/database/src/migrations/tenant/0XX_create_wfm_operational_eventualities.ts`
- Optional modify: tenant migration runner if required by current migration pattern.

### API

- Modify: `apps/api/src/modules/configuration/services/settings-registry.service.ts`
- Modify: `apps/api/src/modules/configuration/configuration.controller.http.spec.ts`
- Optional create: `apps/api/src/modules/wfm/dto/operational-eventuality.dto.ts`
- Optional create: `apps/api/src/modules/wfm/services/operational-eventualities.service.ts`
- Optional modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Optional modify: `apps/api/src/modules/wfm/wfm.module.ts`
- Optional create: `apps/api/src/modules/wfm/tests/operational-eventualities.controller.http.spec.ts`

### Portal

- Create: `apps/portal/src/app/dashboard/settings/calendar/page.tsx`
- Create: `apps/portal/src/components/settings/CalendarSettingsClient.tsx`
- Create: `apps/portal/src/components/settings/BusinessHoursWeekEditor.tsx`
- Create: `apps/portal/src/components/settings/CalendarOrganizationHoursPanel.tsx`
- Create: `apps/portal/src/components/settings/CalendarSiteHoursPanel.tsx`
- Create: `apps/portal/src/components/settings/CalendarExceptionsPanel.tsx`
- Create: `apps/portal/src/components/settings/CalendarWfmPanel.tsx`
- Optional create: `apps/portal/src/components/settings/OperationalEventualitiesPanel.tsx`
- Modify: `apps/portal/src/components/settings/SettingsSectionGrid.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/FieldOperationsSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx` if extracting WFM panels.
- Modify: `apps/portal/src/lib/api-client.ts` if new WFM endpoints are added.

### Tests and E2E

- Create: `apps/portal/src/components/settings/CalendarSettingsClient.spec.tsx`
- Create: `apps/portal/src/components/settings/BusinessHoursWeekEditor.spec.tsx`
- Modify: `apps/portal/src/components/settings/SettingsSectionGrid.spec.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`
- Modify: `apps/portal/src/components/settings/FieldOperationsSettingsClient.spec.tsx`
- Create: `e2e/tests/portal-settings-calendar.spec.ts`

### Docs

- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Update this checklist: `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-06-v1.0.md`

---

## Task 1: Decision gate before code

- [ ] Confirmar con CTO o responsable autorizado si ADR-042 queda aprobado o si la fase debe ejecutarse solo como preparacion sin persistencia nueva.
- [ ] Elegir una de dos rutas para eventualidades:
  - Opcion A: crear `wfm_operational_eventualities` como modelo correcto del MVP.
  - Opcion B: reutilizar `technician_availability` como transicion limitada y documentada.
- [ ] Registrar la decision elegida en `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` antes de tocar codigo productivo.

**Stop/go:** detener si se intenta modelar licencias, incapacidades, vacaciones o permisos dentro de WFM.

## Task 2: Shell federado de settings

- [ ] Agregar `CALENDAR = 'calendar'` a `SettingsSectionKey`.
- [ ] Registrar la seccion en `SettingsRegistryService` con label `Calendario operativo y jornadas`, owner `MOD00 / Organization + MOD09 / WFM` y route `/dashboard/settings/calendar`.
- [ ] Agregar icono en `SettingsSectionGrid` para `SettingsSectionKey.CALENDAR`.
- [ ] Actualizar tests HTTP de configuration para incluir la nueva seccion.
- [ ] Actualizar tests de portal para que el shell renderice la tarjeta y respete permisos efectivos.

**Comandos de validacion:**

```bash
pnpm --filter @iwana/api test -- configuration
pnpm --filter @iwana/portal test -- SettingsSectionGrid SettingsClient
```

## Task 3: Ruta base de Calendario operativo y jornadas

- [ ] Crear `apps/portal/src/app/dashboard/settings/calendar/page.tsx` como Server Component simple que renderiza `CalendarSettingsClient`.
- [ ] Crear `CalendarSettingsClient` con estados de loading, error, solo lectura y ADMIN.
- [ ] Consumir inicialmente `organizationApi.list()`, `organizationApi.getCompanyHours()`, `organizationApi.getExceptions()`, `wfmApi.businessHours.getCompany()` y `wfmApi.holidayBlackouts.list()`.
- [ ] No duplicar logica de permisos solo en frontend: cada mutacion debe depender del backend existente.
- [ ] Agregar test de render inicial y degradacion de error.

**Comando de validacion:**

```bash
pnpm --filter @iwana/portal test -- CalendarSettingsClient
```

## Task 4: Extraer editor semanal reutilizable

- [ ] Crear `BusinessHoursWeekEditor` para editar semana con dias, abierto/habilitado, hora inicio y hora fin.
- [ ] Soportar adaptadores para shape Organization (`isOpen`, `opensAt`, `closesAt`) y WFM (`isEnabled`, `startTime`, `endTime`) en el componente consumidor, no dentro del editor base.
- [ ] Validar que dias habilitados tengan inicio y fin y que inicio sea menor que fin.
- [ ] Reutilizar labels de `mod00-settings-labels.ts` cuando aplique.
- [ ] Cubrir con tests de cambio de dia abierto, horario invalido y modo read-only.

## Task 5: Mover horarios Organization al calendario

- [ ] Crear `CalendarOrganizationHoursPanel` para horario base empresa.
- [ ] Crear `CalendarSiteHoursPanel` para horario por sede y accion `usar horario base`.
- [ ] Crear `CalendarExceptionsPanel` para festivos, cierres y aperturas empresariales o por sede.
- [ ] Reducir `OrganizationSettingsClient` para que no renderice editores principales de horario; dejar resumen con enlace a `/dashboard/settings/calendar`.
- [ ] Mantener CRUD de sedes y capacidades dentro de Organizacion.
- [ ] Actualizar tests de Organization para verificar que la vista no duplica editores de calendario.

## Task 6: Mover superficie WFM de calendario

- [ ] Crear `CalendarWfmPanel` para ventana tecnica y cierres WFM.
- [ ] Reducir `FieldOperationsSettingsClient` para mostrar reglas operativas y enlace/resumen hacia calendario sin duplicar editores.
- [ ] Si se conserva `WfmOperatingHoursManager`, partirlo para evitar que una ruta importe secciones no deseadas.
- [ ] Validar que no se reintroduce copy de `Excepciones por tecnico` ni ausencias personales.
- [ ] Actualizar tests de Field Operations y WFM manager.

## Task 7: Eventualidades operativas puntuales

- [ ] Si ADR-042 aprueba modelo nuevo, crear entidad, migracion, DTO, servicio y endpoints de `wfm_operational_eventualities`.
- [ ] Si se usa transicion, crear panel sobre `wfmApi.technicians.listAvailability()` y `createAvailability()` con copy de eventualidad operativa, no ausencia personal.
- [ ] Exponer tipos visibles: disponibilidad extra, bloqueo operativo, entrada anticipada, extension de jornada y respuesta a emergencia.
- [ ] Agregar campos visibles: tecnico, sede opcional, inicio, fin, motivo, origen, requiere revision RR. HH.
- [ ] Validar `startsAt < endsAt` en frontend y backend.
- [ ] No permitir valores UI de licencia, incapacidad, vacaciones o permiso.

## Task 8: E2E y cierre documental

- [ ] Crear `e2e/tests/portal-settings-calendar.spec.ts` con mocks de auth, tenants, settings sections, permisos, Organization y WFM.
- [ ] Validar que ADMIN navega desde `/dashboard/settings` hacia `Calendario operativo y jornadas`.
- [ ] Validar horario base, horario por sede, cierre/apertura y eventualidad operativa en flujo focalizado.
- [ ] Mockear endpoints no relacionados para evitar proxies al backend real, siguiendo notas de memoria `portal-e2e`.
- [ ] Actualizar informe vivo con comandos ejecutados, evidencia y deuda residual.

**Comandos de validacion final:**

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/api test -- configuration wfm organization
pnpm --filter @iwana/portal test -- settings Calendar
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts
```

## Self-review checklist

- [ ] La seccion centraliza experiencia, no ownership.
- [ ] Organization sigue siendo owner de sedes y horarios empresariales.
- [ ] WFM sigue siendo owner de programacion y eventualidades operativas.
- [ ] RR. HH. futuro queda documentado, no implementado.
- [ ] No hay ausencias personales registradas desde WFM.
- [ ] No hay acceso directo cross-module.
- [ ] OpenAPI se actualiza si hay endpoints nuevos.
- [ ] Migraciones son reversibles si hay tabla nueva.
- [ ] Tests y E2E cubren la nueva ruta.
