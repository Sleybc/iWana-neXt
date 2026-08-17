# Spec UX / Contrato DS — Calendario de horarios (Settings > Calendario)

- **Fecha:** 2026-08-16
- **Modulo:** MOD00 (Settings / Control Plane)
- **Pantalla:** `/dashboard/settings/calendar` (apps/portal)
- **Autor:** AI-EM-ARCH (orquestador) — veredictos de AI-DS-OWNER y contrato de copy de AI-PROD-UX
- **Estado:** Aplicado y verificado (typecheck, lint, tests unitarios, audit-ui.mjs P0/P1 = 0)

## Contexto

La auditoria de identidad iWana sobre la pantalla arrojo P0:1, P1:2, P2:16, P3:6 (score 6/100).
Este documento congela el contrato de diseno aplicado en la remediacion y sirve de fuente de
verdad para las superficies (app, tests, E2E) y para futuras pantallas que reutilicen los tokens.

## Veredictos de diseno (AI-DS-OWNER)

| # | Veredicto | Detalle |
| --- | --- | --- |
| 1 | `TimeFieldSelect` → input nativo | `<input type="time">` estilizado con `cn(portalFieldClassName, 'tabular-nums [color-scheme:light] dark:[color-scheme:dark]', compact ? 'h-10 w-[98px] px-2.5' : 'h-11 w-full px-3.5')`. API igual a la anterior salvo `ariaLabel` opcional. Elimina el popover custom (a11y P0). |
| 2 | `portalCheckboxClassName` | `h-4 w-4 shrink-0 accent-iwana-primary dark:accent-iwana-secondary` + `interactiveFocusClassName`. Token nuevo en `portal-ui.tsx`. |
| 3 | `portalWellClassName` | `rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3`. Token nuevo en `portal-ui.tsx`. |
| 4 | `portalDatePickerButtonClassName` | h-11, `hover:border-iwana-primary-200`. Token nuevo en `portal-ui.tsx`. |
| 5 | Badges de estado | Eventualidades: pending→`warning`, confirmed→`success`, cancelled→`neutral`. Excepciones: Abierto→`success`, Cerrado→`error`, Recurrente anual→`neutral`. Sede: OVERRIDE→`warning`, base→`neutral`. |
| 6 | Acciones de fila | `Button variant="ghost" size="sm"` con tinte destructivo `hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300`. |

## Contrato de copy (AI-PROD-UX)

- Termino unico: **«horario base»** (reemplaza «horario general» en toda la pantalla).
- `organizationSaveAction` = `Guardar horario base`; `organizationStatusTitle` = `Referencia para las sedes`.
- Alertas de solo lectura: `calendarReadOnlyHint` = `Tu perfil puede consultar estos horarios, pero no modificarlos.`
- Dialogos (reemplazan `globalThis.confirm()`):
  - Eliminar cierre: titulo `¿Eliminar este festivo o cierre especial?`, confirmar `Eliminar` (destructive).
  - Quitar horario de sede: `¿Quitar el horario personalizado?`, confirmar `Volver al horario base` (secondary).
  - Eliminar eventualidad: `¿Eliminar este cambio puntual de disponibilidad?`.
  - Accion comun de cancelacion: `Cancelar`.
- Columnas de acciones: `Acciones` (una sola clave `eventualitiesTableActionsColumn` compartida por excepciones y eventualidades).
- Empty de sedes por rol: `siteEmptyReadOnlyDescription` (sin sedes aun registradas; una persona administradora puede crear la primera).
- Fallback de sede en excepciones: 3 ramas — encontrada → nombre; `organizationSiteId` null → `Todas las sedes`; eliminada → `Sede no disponible`.
- Usuario desconocido en eventualidades: `Registro sin persona asociada`.
- Errores: `calendarLoadError`, `calendarLoadFailedTitle` = `No fue posible cargar el calendario`, `calendarBlockUnavailableTitle` = `Bloque temporalmente no disponible`, `calendarRetryAction` = `Reintentar`, `siteOverrideInactive` sin el prefijo `Horario general`.

## Estructura del shell (CalendarSettingsClient)

DOM reordenado en 4 pasos (fila unica en desktop): columnas `contents xl:flex xl:flex-col xl:space-y-0` con `order-1..4`; `role="group"` + `aria-busy` durante loading; estado `sr-only` con `aria-live="polite"`; errores `PortalAlert live="assertive"`. Se conservan `data-testid` `calendar-shell-primary` / `calendar-shell-secondary`.

## Verificacion

- `pnpm.cmd --filter @iwana/portal typecheck` — limpio.
- `pnpm.cmd --filter @iwana/portal lint` — 0 errores.
- `pnpm.cmd --filter @iwana/portal test` — 185 suites / 1405 passed / 1 skipped preexistente.
- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` (8 archivos) — P0: 0, P1: 0.
- `jest-axe` (a11y automatizada) — 0 violaciones WCAG 2.2 AA en `CalendarSettingsA11y.spec.tsx`.
- E2E `e2e/tests/portal-settings-calendar.spec.ts` actualizado al input nativo; **ejecucion pendiente** (requiere stack levantado).