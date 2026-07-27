# Recetas canónicas por patrón

Qué usar (y qué nunca) al construir cada patrón de pantalla. Fuentes reales: `apps/portal/src/components/shared/portal-ui.tsx` (primitives y class-tokens del portal), `packages/ui/src` (`@iwana/ui`), spec Firma iWana §Fase 2, prototipos de `docs/prototipo/`. **Antes de estilar a mano, verifica que el patrón no exista ya aquí** — reimplementar una primitive existente es hallazgo P2.

## Índice

1. [KPI / metric cards](#1-kpi--metric-cards) · 2. [Tabla operativa](#2-tabla-operativa-datatable) · 3. [Panel / card de contenido](#3-panel--card-de-contenido) · 4. [Tabs de módulo](#4-tabs-de-módulo) · 5. [Empty states](#5-empty-states) · 6. [Loading](#6-loading) · 7. [Alertas y feedback](#7-alertas-y-feedback) · 8. [Formularios](#8-formularios) · 9. [Side peek / drawer de detalle](#9-side-peek--drawer-de-detalle) · 10. [Shell (sidebar/header)](#10-shell-sidebarheader) · 11. [Eyebrows y headers de sección](#11-eyebrows-y-headers-de-sección) · 12. [Auth](#12-auth) · 13. [Timeline de actividad](#13-timeline-de-actividad)

## 1. KPI / metric cards

- **Usa:** `portalMetricCardShellClassName` + `portalMetricCardAccentClassName(accent)` (acentos `neutral/primary/warning/danger`) de `portal-ui.tsx`.
- **Anatomía (Firma §2.1):** eyebrow + cifra rol *title* en azul noche + icono neutro + **delta como badge tonal** (nunca texto de color suelto) + hueco para sparkline.
- **Límite: 5–9 métricas núcleo por vista**; el resto va tras progressive disclosure. >12 KPIs por vista es anti-patrón.
- **Nunca:** inventar una card de métrica local; usar lima para deltas negativos o alertas (eso es `error`/`warning`).

## 2. Tabla operativa (DataTable)

- **Anatomía obligatoria** (contenedor → filtros → conteo → grilla):
  ```text
  PortalPanel (§3)
    ├── filtros / chips (fuera del shell)
    ├── PortalResultsStrip          ← conteo SOLO en modo cursor; en modo paginado cede el conteo al pie
    └── portalDataTableShellClassName
          ├── <table> …
          └── pie — EXACTAMENTE UNO, nunca los dos:
                ├── PortalTablePagination   randomAccess:false · «Cargar más» (omitido si !hasMore)
                └── PortalTablePager        DEFAULT · «Mostrando 21–40 de 128 usuarios»
                                            + PortalPageSizeSelect + Anterior · 1 … 12 · Siguiente
                                            (nav omitida si pageCount <= 1)
  ```
- **Usa los class-tokens de `portal-ui.tsx`:**
  - Shell: `portalDataTableShellClassName` (rounded-2xl + borde + overflow contenido — evita scroll horizontal del layout). **Solo envuelve la grilla**, no los filtros.
  - Encabezados: `portalDataTableHeadRowClassName` + `PortalDataTableHead` / `portalDataTableHeadClassName` (eyebrow-muted) / `portalDataTableNestedHeadClassName`.
  - Cuerpo: `portalDataTableBodyClassName` (`divide-y`); celdas: `portalDataTableCellClassName`; hover: `portalTableRowHoverClassName`.
- **Paginación (ADR-065 — supersede ADR-064 §§2/3/5/9):**
  - **El modo lo declara el servidor**, no la pantalla: `meta.capabilities.randomAccess`. Nunca lo infieras en el frontend ni lo codifiques por módulo.
  - **Default `randomAccess: true` → `PortalTablePager`**: `Anterior · 1 … N · Siguiente` + `PortalPageSizeSelect` (`[10, 20, 50]`, default 20) + conteo `Mostrando {desde}-{hasta} de {total} {recurso}` **en el pie**. Si `pageCount <= 1` → sin nav; si no hay resultados → sin pie.
  - **`randomAccess: false` → `PortalTablePagination`** (feeds cronológicos y colas de alto volumen): «Cargar más» solo si `hasMore`, conteo en `PortalResultsStrip` con la gramática de ADR-064 §3.
  - **Una tabla monta un pie o el otro, nunca los dos** — hallazgo P1.
  - **Un solo conteo visible por tabla.** En modo paginado el strip cede el conteo; duplicarlo es hallazgo.
  - `page`, `pageSize`, `sort`, filtros y búsqueda **en la URL**: `push` al cambiar de página (el botón Atrás debe funcionar), `replace` para filtros y búsqueda. Cambiar filtro, orden o tamaño → vuelve a página 1.
  - **Prohibido** ornamento en el pie: «Fin de resultados», filas de relleno, badges decorativos.
  - Detalles rechazados del demo TailAdmin: números **con borde** (fallan WCAG 1.4.11 como único identificador), targets de 40 px (el mínimo es 44), opciones 5/8/10.
  - **El lima no entra en el pager** — ni relleno, ni borde, ni subrayado del activo. Página activa = `bg-iwana-primary text-white`; en dark, `bg-iwana-primary-400` **obliga** a `ring-iwana-primary-300`. El lima significa avance; la página actual es posición.
  - El FE **no** materializa listados unbounded como estrategia permanente.
  - Excepciones: preview ≤10 filas, matrices/settings de cardinalidad fija pequeña, pickers en modal (búsqueda tipo-ahead) — documentar en el módulo.
  - Contrato completo: `docs/specs/2026-07-24-paginacion-numerada-ds-contrato.md`; criterios CA-PAG v2 en `docs/specs/2026-07-24-paginacion-numerada-ux.md`.
- **Orden por columna (ADR-065 §Decisión 17-22):**
  - **Qué columnas son ordenables lo declara el servidor** en `meta.capabilities.sortableFields`. Nunca una lista local en la pantalla.
  - Ordenable → `PortalDataTableSortableHead`; no ordenable → `PortalDataTableHead` **sin botón y sin `aria-sort`** (un control deshabilitado sugiere una capacidad que no existe).
  - Ciclo de tres estados calculado por el primitive: `sin orden → asc → desc → sin orden`. El tercer paso restituye el orden por defecto del recurso.
  - `aria-sort` en el `<th>`; exactamente **uno** distinto de `none` por tabla. El nombre accesible del botón enuncia la **acción siguiente**, no el estado actual.
  - El estado activo **no se comunica solo con el ícono**: el rótulo pasa a `font-semibold` + `text-iwana-primary` (WCAG 1.4.1).
  - **Un solo ícono**, no el par de carets apilados de TailAdmin: a 8×5 px no hay estado distinguible y el encabezado se vuelve una rejilla de ruido.
  - Bajo `sm` el orden **sale del encabezado** y se expone con el `Select` de `@iwana/ui` en la barra de filtros — pulsar un caret dentro de una tabla que se desplaza horizontalmente es una trampa táctil.
  - **El lima no entra en el orden** (igual que en el pager): el orden es posición, no avance.
  - Solo en recursos con `randomAccess: true`; en modo cursor cada orden exigiría su propio codificador keyset.
- **Cifras:** `tabular-nums` o `font-mono` en columnas numéricas, IDs y timestamps.
- **Estados por fila:** columna de estado con `<Badge variant={...}>` de `@iwana/ui` mapeada por severidad — nunca enum crudo.
- **Dirección aprobada (Firma §2.3):** sticky header, densidad configurable, filtros en URL, bulk actions, virtualización desde ~1k filas — **complementa** la paginación servidor, no la sustituye.
- **Nunca:** tabla sin empty state; spinner como carga primaria; acciones solo visibles en hover; filtros metidos dentro del borde del shell; listado operativo sin cota de página.

## 3. Panel / card de contenido

- **Usa:** `PortalPanel` (rounded-2xl, borde, p-5, header con eyebrow/título/descripción/acciones) — no dupliques su shell a mano.
- Card base **blanca** con `shadow-iwana-soft`; `iwana-surface-soft` solo para superficies de apoyo.
- **Nunca:** cards dentro de cards sin función; glass en superficies de contenido; `iwana-secondary-50` como fondo de panel.

## 4. Tabs de módulo

- **Usa:** `portalModuleTabsShellClassName` / `-GroupClassName` / `-DividerClassName` / `-TrackClassName` / `-TriggerClassName`, con estado activo `portalTabActiveClassName` (activo = `bg-iwana-primary text-white`) e inactivo `portalTabInactiveClassName`.
- Volver a una tab no pierde el estado de filtros (dirección: filtros en URL).

## 5. Empty states

- **Usa:** `PortalEmptyState` (título + explicación + acción). Un vacío sin acción es un callejón sin salida (P1).
- **Distinguir (Firma §2.6):** *primera vez* (ilustración ligera opcional — blob lima 5% permitido aquí — + explicación + CTA primario) vs *sin resultados de filtro* (mensaje corto + acción "limpiar filtros").

## 6. Loading

- **Usa:** `PortalSkeletonBlock` — skeletons con forma de contenido que reservan espacio (sin layout shift). Aparecen solo si la carga supera ~300 ms.
- Loading de acción puntual: estado `loading` del `<Button>` de `@iwana/ui` (spinner + `aria-busy` ya resueltos).
- **Nunca:** spinner bloqueante como estado de carga primario de una página o tabla (P3).

## 7. Alertas y feedback

- **Usa:** `PortalAlert` (semántica ARIA ya resuelta — no re-auditarla). Toda acción asíncrona muestra estado, resultado y siguiente paso.
- Severidad por escala semántica (`success/warning/error/info`) — el lima no es una severidad.

## 8. Formularios

- **Usa:** `FormField`/`FormSection`, `Input`, `Select`, `MultiSelect`, `DatePicker`, `CheckboxCard`, `OtpInput` de `@iwana/ui`; superficies de input con `.portal-input-surface`; textarea con `portalTextareaClassName`.
- Labels: patrón `PortalSearchField` (label asociado o `sr-only`); agrupar por decisión de negocio.
- Validación en blur; error junto al campo en español claro (el error global no reemplaza al de campo); auto-foco al primer inválido.
- Foco visible en todo interactivo custom: `interactiveFocusClassName`.

## 9. Side peek / drawer de detalle

- Panel lateral desde la fila (clic en fila o menú) con edición inline, expandible a página completa (patrón Attio/Airtable; Firma §2.7 — generaliza `SupplierFormDrawer`).
- Regla de edición: cambios de un solo campo → inline; ediciones estructurales o multi-campo → drawer/página con guardado deliberado.
- Base: `Dialog` de `@iwana/ui` o drawer del módulo; glass permitido aquí (overlay).

## 10. Shell (sidebar/header)

- Sidebar azul noche (`bg-iwana-primary`) colapsable, ítem activo con **barra lima** (firma #1); header con búsqueda (`PortalSearchField` / dirección Cmd+K), campana, chip de usuario.
- Referencia de arquitectura: TailAdmin (ADR-023) — **solo como referencia**; ver `prototype-map.md` para lo prohibido.
- Footers sticky de modo creación: `createModeStickyFooterClassName`, `CreateModeSummaryFooter`, `CreateModeMobileStepIndicator`, `CreateModeMobileCaptureFooter`.

## 11. Eyebrows y headers de sección

- **Usa:** `.portal-eyebrow` / `.portal-eyebrow-muted` (10 px, uppercase, tracking del sistema) — nunca un eyebrow manual (P3).
- Headers de sección: `PortalSectionHeader`; toolbars: `PortalActionToolbar` (colapsan `md:flex-row` en tablet).

## 12. Auth

- Split-screen: panel oscuro de marca (imagen + gradiente + logo en badge lima + patrón de puntos) + card blanca `rounded-2xl shadow-2xl max-w-[480px]`.
- **Usa:** `AuthPremiumShell`, `AuthBrandHeader`, `auth-form-styles` de `@iwana/ui`. Aquí sí se permiten glass y decoración orgánica (pantalla de marca).

## 13. Timeline de actividad

- Línea vertical con degradado a transparente + nodos anillados (`bg-iwana-secondary` activo / `bg-iwana-primary/20` pasado) + timestamps en `font-mono` (prototipo expediente; Firma §3.3).

---

## Regla de promoción

Un patrón repetido ≥2 veces (clase compuesta, valor arbitrario, mini-componente local) se promueve: a utility en `globals.css`, a class-token/primitive en `portal-ui.tsx`, o a componente en `@iwana/ui` — y el hallazgo debe decir a cuál. La cadena de madurez es: pantalla → `portal-ui.tsx` → `@iwana/ui`.
