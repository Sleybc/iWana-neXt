# INFORME — Auditoria y remediacion de UI del Calendario de horarios (Settings)

- **Tipo:** INFORME
- **Version:** v1.0
- **Modulo:** MOD00 (Settings / Control Plane)
- **Alcance:** `/dashboard/settings/calendar` (apps/portal) — `CalendarSettingsClient` y dependencias
- **Fecha:** 2026-08-16
- **Autor:** AI-EM-ARCH (orquestador, protocolo multiagente)

## Resumen ejecutivo

La pantalla de calendario de horarios paso de **6/100** a identidad iWana conforme tras la
remediacion. Se elimino el P0 de accesibilidad del selector inicial y posteriormente se sustituyo
el popup nativo por un popover de hora accesible, se unifico el copy
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

- `TimeFieldSelect.tsx`: selector custom accesible con `Popover`, dos listboxes y salida `HH:mm`.
- `portal-ui.tsx`: tokens `portalCheckboxClassName` y `portalWellClassName`; los DatePicker usan la primitive canonica de `@iwana/ui`.
- Paneles: Badges semanticos, Dialogos para confirmaciones destructivas, wells, checkboxes,
  `live="assertive"`, fallback de sede en 3 ramas, `formatDateOnlyEsCo` (`src/lib/format-date.ts`).
- Shell: DOM en 4 pasos con `role="group"`, `aria-busy`, estados de error/retry/loading completos.
- Eliminado: `WfmOperatingHoursManager.tsx` (902 lineas), su spec, `SettingsTabPanel.tsx`,
  bloque `WFM_SETTINGS_COPY` y el `jest.mock` asociado.
- Reparacion de cierre (orquestador): fragmento JSX roto en `CalendarSiteHoursPanel.tsx`.

### Wave 3 — Calidad (AI-SR-QA)

- 5 specs migrados al contrato real (copy, controles `TimeFieldSelect`, Dialogos, validacion en submit).
- +10 tests de cobertura: read-only por rol, dialogs (confirmar/cancelar), fallos de
  create/delete, paginador y page size con el mecanismo real de `useTableQueryState`.
- jest-axe integrado (devDependency de `@iwana/portal`) con `CalendarSettingsA11y.spec.tsx`:
  **0 violaciones WCAG 2.2 AA**.
- E2E `portal-settings-calendar.spec.ts` actualizado al trigger y popover de `TimeFieldSelect`; **pendiente de ejecucion**
  (requiere stack dev levantado: api 3000 / web 3001 / portal 3002).

### Correccion visual posterior — DatePicker (2026-08-17)

- Se comparo la captura de Settings con la superficie canonica `SchedulingToolbar`.
- `CalendarExceptionsPanel` dejo de envolver `DatePicker` con label y clases locales (`h-11`,
  `shadow-sm`, `text-xs`). Ahora usa `label={exceptionsDateLabel}` y el estilo/popover por defecto
  de `@iwana/ui`, igual que Agenda.
- Se actualizo el mock del DatePicker y se verificaron `CalendarExceptionsPanel` y
  `CalendarSettingsA11y`: 13 tests pasando.

### Correccion posterior — TimeFieldSelect (2026-08-17)

- La captura demostro que el popup azul observado era el selector nativo del navegador, no el
  DatePicker de Agenda.
- `TimeFieldSelect` ahora usa un trigger iWana y un popover propio accesible para seleccionar horas y minutos.
- La seleccion conserva horas `00-23`, minutos `00-59`, teclado, `aria-selected`, Escape y retorno
  de foco. Se agrego `TimeFieldSelect.spec.tsx` y se migraron las pruebas del editor semanal.
- Verificacion dirigida: 4 suites, 55 tests pasando.

### Correccion de densidad — TimeFieldSelect (2026-08-17)

- El popover de hora se compacto para subordinarse a la tabla del horario base: `w-52`, `p-2`, opciones `h-8`, listas `max-h-40`, `shadow-iwana-active`.
- Trigger compacto: `h-9 w-[6.75rem]`, sin reloj, placeholder `--:--`. Modo default (eventualidades/mobile): `h-10` con reloj y «Selecciona una hora».
- Grilla desktop del editor semanal: `min-w-0` (se elimino `min-w-[640px]`) y columnas al contenido para evitar scroll horizontal y dias recortados.
- E2E de densidad actualizado: el control es `button`; trigger ≤120 px; dialog ≤220×240. El caso de eventualidades usa interacción con el popover de `TimeFieldSelect`.
- Verificacion: typecheck limpio; lint 0 errores; 5 suites / 66 tests; `audit-ui.mjs` sin hallazgos. E2E de densidad **1 passed**.

### Cierre residual — TimeFieldSelect en festivos (2026-08-17)

- `CalendarExceptionsPanel` usa `TimeFieldSelect` en modo default para las horas de apertura y cierre.
- `CalendarExceptionsPanel.spec.tsx`: 10/10, con asercion de ausencia de `type=time`.

### Cierre de review frontend — calendario settings (2026-08-17)

- `BusinessHoursWeekEditor` expone `idPrefix` para evitar colisiones entre los formularios de
  organización y sede; los paneles usan los prefijos `organization` y `site`.
- El cambio de sede con borrador pendiente usa `Dialog` accesible y conserva el borrador hasta que
  la persona confirme el descarte; se elimino el `window.confirm` del flujo.
- Las excepciones y eventualidades mantienen la tabla desktop y ofrecen una lista móvil apilada,
  con regiones etiquetadas, targets mínimos de 44 px y foco visible compartido.
- La validacion del formulario de eventualidades se muestra junto a cada campo, mueve el foco al
  primer error y conserva los estados loading, empty, error, retry, success y readonly.
- El contrato real de eventualidades solo expone paginacion `page`/`limit` y el backend usa offset;
  no se invento un cursor ni se renderiza «Cargar más» cuando `randomAccess=false`. Se muestra una
  advertencia operativa hasta que exista el contrato cursor real.
- El dropdown de mes/año de `@iwana/ui` ahora soporta foco gestionado, flechas, Home/End, Enter,
  Space, Escape y retorno de foco al trigger, con opciones deshabilitadas representadas como tales.
- Verificación dirigida final: 9 suites, 114 tests pasando; typecheck de Portal y `@iwana/ui`, ESLint
  focalizado y `audit-ui.mjs` sin hallazgos.
- E2E de calendar permanece pendiente: esta sesion no dispuso de autenticacion/stack levantado.

### Gaps finales solicitados para review (2026-08-17)

- La carga inicial de eventualidades no depende del modo `randomAccess` y el test confirma una sola
  llamada inicial. El error inicial usa un único `PortalAlert` con `Reintentar`, separado del empty.
- `CalendarDropdownA11y.spec.tsx` cubre mes y año, ArrowUp/ArrowDown efectivos, Space, Enter,
  selección concreta, Escape y retorno de foco.
- La prueba axe del shell se titula según su evidencia real: pasos 1–3, con mock mínimo documentado
  para el paso 4; el panel real tiene cobertura focalizada propia.
- El envelope/API vigente de eventualidades solo admite `page`/`limit`; controller y cliente no
  exponen cursor. `randomAccess=false` permanece como **bloqueo de contrato**, con advertencia visible
  y sin inventar «Cargar más». No se declara cierre de esta variante.

### Cierre de review de calidad — correcciones aplicadas (2026-08-17)

- Los reintentos globales y de bloques usan el mismo handler que la actualización manual, por lo que
  respetan el guard de borradores pendientes y no descartan cambios locales.
- `Calendar` usa el anillo de foco compartido también en navegación y días, incluyendo el contraste
  específico de modo oscuro. El dropdown usa `--z-popover` y `--shadow-iwana-lg`.
- `TimeFieldSelect` usa foco roving en sus opciones y no mezcla ese patrón con `aria-activedescendant`.
- Se agregaron regresiones para reintento de carga parcial y axe con el selector de hora abierto.
- Durante una actualización se bloquean los editores de los cuatro pasos para impedir que una respuesta
  en vuelo sobrescriba una edición iniciada localmente. `TimeFieldSelect` mantiene el índice roving por
  columna y genera IDs de opción únicos por instancia.
- Verificación fresca: 9 suites, 114 tests pasando; typecheck de Portal y `@iwana/ui`; ESLint focalizado
  con 0 errores y 50 warnings preexistentes fuera del alcance; `git diff --check` sin errores de contenido.
- La ejecución global del script `test` no se usa como evidencia porque el wrapper inserta un separador
  adicional y termina en «No tests found» al pasar argumentos; el comando Jest explícito de las suites
  del calendario sí fue ejecutado y pasó.
- Ajuste posterior: se retiró `Actualizar` del `PageHeader`; la actualización permanece disponible solo
  como `Reintentar` contextual dentro de estados de error. La suite de `CalendarSettingsClient` valida
  que el contenedor del título no rendera ese botón.
- Ajuste posterior: se eliminó definitivamente la card `Resumen del calendario`, junto con su cálculo
  agregado, copy y selector E2E. La pantalla conserva los cuatro pasos y sus estados específicos sin
  una quinta superficie visual redundante.
- Ajuste posterior: el shell se reorganizó en dos carriles semánticos independientes. `calendar-lane-1-2`
  contiene horarios habituales y `calendar-lane-3-4` contiene cambios por fecha; el DOM mantiene `1→2→3→4`,
  mientras las alturas dinámicas dejan de compartir tracks entre carriles. Los prefijos visibles `Paso N`
  se sustituyeron por rótulos funcionales de panel y carril.
- Verificación del layout: 9 suites y 114 tests Jest pasando; E2E focalizado del calendario 9/9 en Chromium;
  typecheck Portal limpio; lint con 0 errores y 50 warnings preexistentes; auditoría mecánica UI sin hallazgos.

## Verificacion final (evidencia ejecutada por el orquestador)

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal typecheck` | Limpio |
| `pnpm --filter @iwana/portal lint` | 0 errores (50 warnings preexistentes, ninguno del alcance calendar) |
| Jest focalizado de calendario | 9 suites, 114 passed, 0 failed |
| E2E focalizado `portal-settings-calendar.spec.ts` | 9 passed en Chromium |
| `audit-ui.mjs` (8 archivos calendar + portal-ui) | P0: 0 · P1: 0 |
| Jest-axe (a11y automatizada) | 0 violaciones AA |

El E2E focalizado pasó con el stack de pruebas disponible; el resto de la suite E2E del portal queda fuera de este alcance.

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
