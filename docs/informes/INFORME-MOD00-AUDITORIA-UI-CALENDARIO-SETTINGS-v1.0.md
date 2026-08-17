# INFORME — Auditoria y remediacion de UI del Calendario de horarios (Settings)

- **Tipo:** INFORME
- **Version:** v1.0
- **Modulo:** MOD00 (Settings / Control Plane)
- **Alcance:** `/dashboard/settings/calendar` (apps/portal) — `CalendarSettingsClient` y dependencias
- **Fecha:** 2026-08-16
- **Autor:** AI-EM-ARCH (orquestador, protocolo multiagente)

## Resumen ejecutivo

La pantalla de calendario de horarios paso de **6/100** a identidad iWana conforme tras la
remediacion. Se elimino el P0 de accesibilidad (selector de hora custom), se unifico el copy
al vocabulario del sistema (horario base), se reemplazo `confirm()` por Dialogos accesibles,
se aplicaron los tokens semanticos del design system y se eliminaron 902 lineas de codigo
muerto del antiguo gestor WFM.

## Auditoria inicial

| Severidad | Cantidad | Principales |
| --- | --- | --- |
| P0 | 1 | `TimeFieldSelect` no operable por teclado ni SR (popover de 84 botones sin foco gestionado) |
| P1 | 2 | Checkbox lima inline (`OperationalEventualitiesPanel:735`); row actions sin target/foco (`:499-526`) |
| P2 | 16 | Copy tecnicos («horario general», «Persona no disponible», errores), `confirm()`, ISO crudo en tabla, wells arbitrarios, bordes arbitrarios, empty states por rol, Badges crudos, live regions, `aria-busy`, orden DOM, boton crear deshabilitado por validacion, cobertura de tests faltante |
| P3 | 6 | Robustez de copy, helpers, anuncios de carga, dependencia de tests a copy |

Score: 6/100. Veredicto: **Aprobada con cambios**.

## Remediacio aplicada (waves)

### Wave 1 — Contratos (AI-DS-OWNER + AI-PROD-UX + exploracion)

- 6 veredictos de diseno congelados en `docs/specs/2026-08-16-mod00-calendario-settings-ds-contrato.md`.
- Contrato de copy unificado con el sistema («horario base»), keys nuevas y eliminadas.
- Verificacion de codigo muerto, scripts del paquete y ausencia de jest-axe.

### Wave 2 — Implementacion (AI-FE-PLATFORM)

- `TimeFieldSelect.tsx`: reescrito a `<input type="time">` nativo (191 lineas eliminadas).
- `portal-ui.tsx`: tokens `portalCheckboxClassName`, `portalWellClassName`, `portalDatePickerButtonClassName`.
- Paneles: Badges semanticos, Dialogos para confirmaciones destructivas, wells, checkboxes,
  `live="assertive"`, fallback de sede en 3 ramas, `formatDateOnlyEsCo` (`src/lib/format-date.ts`).
- Shell: DOM en 4 pasos con `role="group"`, `aria-busy`, estados de error/retry/loading completos.
- Eliminado: `WfmOperatingHoursManager.tsx` (902 lineas), su spec, `SettingsTabPanel.tsx`,
  bloque `WFM_SETTINGS_COPY` y el `jest.mock` asociado.
- Reparacion de cierre (orquestador): fragmento JSX roto en `CalendarSiteHoursPanel.tsx` y
  import faltante `portalDatePickerButtonClassName` en `OperationalEventualitiesPanel.tsx`
  (rompian typecheck/lint).

### Wave 3 — Calidad (AI-SR-QA)

- 5 specs migrados al contrato real (copy, input nativo, Dialogos, validacion en submit).
- +10 tests de cobertura: read-only por rol, dialogs (confirmar/cancelar), fallos de
  create/delete, paginador y page size con el mecanismo real de `useTableQueryState`.
- jest-axe integrado (devDependency de `@iwana/portal`) con `CalendarSettingsA11y.spec.tsx`:
  **0 violaciones WCAG 2.2 AA**.
- E2E `portal-settings-calendar.spec.ts` actualizado al input nativo; **pendiente de ejecucion**
  (requiere stack dev levantado: api 3000 / web 3001 / portal 3002).

## Verificacion final (evidencia ejecutada por el orquestador)

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal typecheck` | Limpio |
| `pnpm --filter @iwana/portal lint` | 0 errores (51 warnings preexistentes, ninguno del alcance calendar salvo warning conocido `sites`) |
| `pnpm --filter @iwana/portal test` | 185 suites, 1405 passed, 1 skipped preexistente, 0 failed |
| `audit-ui.mjs` (8 archivos calendar + portal-ui) | P0: 0 · P1: 0 |
| Jest-axe (a11y automatizada) | 0 violaciones AA |

Pendiente: ejecucion del E2E de calendar cuando el stack este levantado (gate de merge).

## Archivos del alcance

- Modificados: `CalendarSettingsClient.tsx`, `CalendarOrganizationHoursPanel.tsx`,
  `CalendarSiteHoursPanel.tsx`, `CalendarExceptionsPanel.tsx`,
  `OperationalEventualitiesPanel.tsx`, `BusinessHoursWeekEditor.tsx`, `TimeFieldSelect.tsx`,
  `mod00-settings-labels.ts`, `portal-ui.tsx`, `CalendarSettingsClient.spec.tsx`,
  `BusinessHoursWeekEditor.spec.tsx`, `CalendarOrganizationHoursPanel.spec.tsx`,
  `CalendarSiteHoursPanel.spec.tsx`, `CalendarExceptionsPanel.spec.tsx`,
  `OperationalEventualitiesPanel.spec.tsx`, `SettingsClient.spec.tsx`,
  `ui-primitives-a11y.spec.tsx`, `jest.setup.ts`, `package.json`, lockfile,
  `e2e/tests/portal-settings-calendar.spec.ts`.
- Creados: `src/lib/format-date.ts`, `CalendarSettingsA11y.spec.tsx`,
  `docs/specs/2026-08-16-mod00-calendario-settings-ds-contrato.md`.
- Eliminados: `WfmOperatingHoursManager.tsx`, `WfmOperatingHoursManager.spec.tsx`,
  `SettingsTabPanel.tsx`.

## Fuera de alcance

Cambios preexistentes de otra sesion en el working tree (no tocados): `AccessControlSettingsClient.*`,
`OrganizationSettingsClient.*`, `packages/ui/src/components/CheckboxCard.tsx`,
`e2e/tests/portal-settings-access-ui.spec.ts` + snapshots,
`docs/specs/2026-08-15-mod00-acceso-ui-remediation.md`,
`docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`,
`docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (v1.63–v1.70).