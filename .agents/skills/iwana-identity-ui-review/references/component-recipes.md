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

- **Usa los class-tokens de `portal-ui.tsx`:**
  - Shell: `portalDataTableShellClassName` (rounded-2xl + borde + overflow contenido — evita scroll horizontal del layout).
  - Encabezados: `portalDataTableHeadClassName` (eyebrow-muted) / `portalDataTableNestedHeadClassName`.
  - Celdas: `portalDataTableCellClassName`; hover de fila: `portalTableRowHoverClassName` (hover `iwana-surface-soft`).
- **Cifras:** `tabular-nums` o `font-mono` en columnas numéricas, IDs y timestamps.
- **Estados por fila:** columna de estado con `<Badge variant={...}>` de `@iwana/ui` mapeada por severidad — nunca enum crudo.
- **Dirección aprobada (Firma §2.3, aún sin primitive):** sticky header, densidad configurable (cómoda/compacta), filtros persistidos en URL, bulk actions con checkbox on-hover, virtualización desde ~1k filas. Proponer como evolución, no citar como existente.
- **Nunca:** tabla sin empty state; spinner como carga primaria; acciones solo visibles en hover.

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
