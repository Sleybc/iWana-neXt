# Spec UX / Contrato DS — Calendario de horarios (Settings > Calendario)

- **Fecha:** 2026-08-16
- **Actualizado:** 2026-08-17 (addendum de densidad, responsive de listados y contrato de eventualidades)
- **Modulo:** MOD00 (Settings / Control Plane)
- **Pantalla:** `/dashboard/settings/calendar` (apps/portal)
- **Autor:** AI-EM-ARCH (orquestador) — veredictos de AI-DS-OWNER y contrato de copy de AI-PROD-UX
- **Estado:** Aplicado y verificado en UI; el cursor de eventualidades permanece bloqueado por contrato API

## Contexto

La auditoria de identidad iWana sobre la pantalla arrojo P0:1, P1:2, P2:16, P3:6 (score 6/100).
Este documento congela el contrato de diseno aplicado en la remediacion y sirve de fuente de
verdad para las superficies (app, tests, E2E) y para futuras pantallas que reutilicen los tokens.

## Veredictos de diseno (AI-DS-OWNER)

| # | Veredicto | Detalle |
| --- | --- | --- |
| 1 | `TimeFieldSelect` → popover iWana compacto | Trigger `Button` con chevron (reloj solo en modo default), `PopoverContent` denso con dos listboxes accesibles (`Hora` y `Minutos`), seleccion `HH:mm`, foco por teclado. No usa popup nativo del navegador. La densidad no copia el bounding box del `DatePicker` de Agenda: el calendario elige un dia; el time picker es un control de celda. |
| 2 | `portalCheckboxClassName` | `h-4 w-4 shrink-0 accent-iwana-primary dark:accent-iwana-secondary` + `interactiveFocusClassName`. Token nuevo en `portal-ui.tsx`. |
| 3 | `portalWellClassName` | `rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3`. Token nuevo en `portal-ui.tsx`. |
| 4 | `DatePicker` canonico | Usar directamente `DatePicker` de `@iwana/ui`, con su `label`, trigger y popover. No crear clases locales para el boton. |
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

El shell usa dos carriles semánticos independientes en desktop amplio: `calendar-lane-1-2` agrupa
**Horarios habituales** (horario base y sedes) y `calendar-lane-3-4` agrupa **Cambios por fecha**
(cierres y cambios puntuales). Cada carril es una pila `flex-col` con `gap-4`; el wrapper exterior usa
`grid gap-8 xl:grid-cols-2 xl:items-start xl:gap-6`. En tablet y mobile los carriles se apilan completos
en el orden DOM `1→2→3→4`, sin `order-*`, `grid-flow-dense`, masonry ni alturas igualadas.

Cada carril tiene `min-w-0`, un rótulo `.portal-eyebrow-muted` asociado mediante `aria-labelledby` y un
stack interno `mt-3 space-y-4`. Los pasos conservan `role="group"`, sus `data-testid` técnicos
`calendar-step-1` a `calendar-step-4` y nombres accesibles derivados de sus títulos, pero no muestran
numeración de wizard. El shell conserva `aria-busy` durante refresh, estado `sr-only` con
`aria-live="polite"` y errores `PortalAlert live="assertive"`.

## Addendum de densidad — TimeFieldSelect (2026-08-17)

El popover de hora vive dentro de celdas del editor semanal. Tras la remediacion de a11y, el overlay copio escala de superficie (`w-18rem`, `min-h-11`, titulo visible) y tapo la tabla. Contrato de densidad:

**Trigger**

- Compacto (grilla semanal desktop): `h-8 w-[5.5rem] justify-center gap-1 px-1.5 text-xs`, sin icono de reloj, chevron `h-3` pegado al valor (no `ml-auto`). Vacio: `--:--`.
- Default (eventualidades, mobile): `h-10 w-full px-3`, reloj visible, placeholder `Selecciona una hora`.
- Foco: `interactiveFocusClassName`. Disabled: opacidad del `Button` outline.

**Popover**

- `w-44`, `p-1.5`, `rounded-xl`, `shadow-iwana-active`, `sideOffset={4}`, `align="start"`.
- Sin titulo visible «Selecciona una hora» (el `aria-label` del dialog lo conserva). Preview `font-mono text-xs`: `07:15` o `HH:mm`.
- Columnas visibles `Hora` / `Min` con `.portal-eyebrow-muted`; `aria-label` del listbox de minutos permanece `Minutos`.
- Listas: wrapper `overflow-hidden rounded-lg` + scroller `max-h-32`. Opciones `h-7 min-h-7 text-xs`. Seleccionado: `bg-iwana-primary text-white` (navy = posicion, no lima).
- Conserva horas `00-23`, minutos `00-59`, teclado, `aria-selected`, Escape sin commit, retorno de foco, cierre al elegir minuto.
- Excepcion documentada de 44 px: WCAG 2.2 AA 2.5.8 pide 24×24; `h-8` (32 px) cumple AA. Aplicar 44 px a 84 opciones inflaba el overlay y tapaba la tarea.

**Tabla semanal**

- Grilla desktop: `min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)]`. El sobrante va a Inicio/Fin, no a Dia. Encabezado `Abierto` con `whitespace-nowrap` (nunca `3.5rem`).
- Trigger de hora compacto alineado al inicio de la celda; no estira `w-full` dentro de la columna.

**Eventualidades y festivos**

- Eventualidades y el alta de festivos/cierres usan el modo default (`h-10`, reloj, placeholder `Selecciona una hora`).
- `CalendarExceptionsPanel` usa `TimeFieldSelect` con popover accesible para las horas de apertura y cierre; no depende de controles nativos del navegador.

**E2E de densidad**

- El trigger es el `button` accesible del primitive `TimeFieldSelect`.
- Ancho del trigger compacto ≤ 96 px.
- Al abrir, el dialog mide ≤ 192×200 px.
- El encabezado `Abierto` permanece visible sin recorte.

## Verificacion

- `pnpm.cmd --filter @iwana/portal typecheck` — limpio (2026-08-17, densidad).
- `pnpm.cmd --filter @iwana/portal lint` — 0 errores en archivos tocados (`TimeFieldSelect`, `BusinessHoursWeekEditor`).
- Jest focalizado de calendario — 9 suites, 114 pruebas pasando en la verificación final.
- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` (`TimeFieldSelect.tsx`, `BusinessHoursWeekEditor.tsx`) — sin hallazgos.
- `jest-axe` (a11y automatizada) — 0 violaciones WCAG 2.2 AA en `CalendarSettingsA11y.spec.tsx`.
- E2E focalizado de `portal-settings-calendar.spec.ts` — 9 pruebas pasando en Chromium; incluye
  independencia geométrica de carriles, expansión del paso 3, responsive mobile y flujos de eventualidades.

## Addendum final — listados, estados y contrato de eventualidades (2026-08-17)

- Excepciones y eventualidades conservan la tabla desktop (`hidden md:block`) y ofrecen una lista
  móvil apilada (`md:hidden`) con nombre, fecha/horario, alcance, estado y acciones con target mínimo
  de 44 px y foco visible.
- Los selectores E2E del shell son `calendar-step-1`, `calendar-step-2`, `calendar-step-3` y
  `calendar-step-4`; no se conserva evidencia basada en selectores de pasos anteriores.
- `OperationalEventualitiesPanel` mantiene una sola carga inicial; el modo de acceso se lee del
  envelope recibido sin formar parte de las dependencias de la carga.
- `ListOperationalEventualitiesParams` admite únicamente `page`/`limit` y el controller actual solo
  implementa paginación numerada. Si el envelope declara `randomAccess=false`, la UI mantiene una
  advertencia visible y no inventa cursor ni «Cargar más».
- **Bloqueo de contrato abierto:** la variante cursor requiere contrato API y soporte backend
  explícitos antes de poder cerrar este comportamiento. No se declara cierre funcional de cursor.
- La prueba axe del shell declara su alcance real: pasos 1–3, con mock mínimo documentado para el
  paso 4; la suite focalizada de `OperationalEventualitiesPanel` cubre el panel real.
