# SPEC: Alineación visual — Submódulo Compras (MOD12)

**Versión:** 1.0  
**Estado:** Ejecutado (Fase visual A + B)  
**Fecha:** 2026-06-25  
**Fecha aprobación:** 2026-06-25  
**Modo activo:** Mixto  
**Módulo:** MOD12 Inventario / SCM — Submódulo Compras  
**Superficie:** Portal tenant (`apps/portal`)  
**Responsable:** AI-EM-ARCH  
**Owner de diseño:** Senior UI Systems Designer (AI-SR-UI-SYS)  
**Owner de ejecución:** Sr. Dev Fullstack (AI-SR-FULL)  
**Aprobado por:** AI-EM-ARCH  
**Clasificación:** Uso interno

---

## 1. Trazabilidad

| Artefacto | Relación |
| --- | --- |
| `docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md` | Diseño funcional aprobado (Fase 02) |
| `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md` | Alcance funcional vigente |
| `docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md` | Contratos backend sin cambio en esta spec |
| `docs/informes/INFORME-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md` | Evidencia de implementación funcional |
| `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md` | Boundary inmutable |
| `docs/plans/2026-06-25-mod12-compras-ui-alignment-fase-a.md` | Plan de ejecución Fase visual A |
| `docs/quality/CHECKLIST-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md` | Gate de verificación UI |
| Referentes visuales portal | `SchedulingSummaryStrip`, `OperationsClient`, `TasksToolbar` |

**Motivo de este artefacto:** La Fase 02 cerró funcionalidad y deuda técnica backend/frontend, pero la revisión de identidad iWana (AI-SR-UI-SYS) detectó brecha visual y de affordances operativas respecto a módulos maduros del portal. Este spec define la alineación visual ejecutable sin modificar reglas de negocio ni contratos API.

---

## 2. Contexto

### 2.1 Situación actual

El submódulo Compras ya implementa el workspace híbrido aprobado:

- KPIs por etapa (`PurchaseWorkspaceSummary`)
- Tabla con filtros (`PurchaseRequestsTable`)
- Compositor de solicitud con líneas mixtas (`PurchaseRequestComposer`)
- Drawer de trabajo (`PurchaseRequestWorkbenchDrawer`)
- Flujos de OC y recepción (`PurchaseOrderDrawer`, `GoodsReceiptPanel`)
- Selector de proveedor operativo (`SupplierPicker`)

La funcionalidad cumple el PRD y el checklist de Fase 02. La experiencia visual permanece en **fase beta**: layout lineal, estados UI inconsistentes, KPIs no accionables, tabla sin semántica visual de estado y drawer con sobrecarga cognitiva.

### 2.2 Veredicto de diseño (entrada a este spec)

| Dimensión | Estado |
| --- | --- |
| Arquitectura de información | Alineada al diseño Fase 02 |
| Madurez visual iWana | Parcial |
| Paridad con Scheduling / Operaciones | Insuficiente |
| Listo para producción operativa (UI) | No — requiere Fase visual A como mínimo |

---

## 3. Objetivo

Elevar el submódulo Compras al estándar visual y operativo iWana del portal tenant, de modo que un usuario de abastecimiento pueda en menos de 3 segundos:

1. Entender qué está pendiente por etapa.
2. Filtrar o abrir la solicitud correcta.
3. Crear una solicitud sin perder contexto de la bandeja.
4. Completar el ciclo cotización → aprobación → OC → recepción con señales claras de “siguiente acción”.

**Sin cambiar:** boundaries MOD12, contratos API existentes, reglas de aprobación, política por tipo + monto, ni modelo de datos.

---

## 4. Alcance

### 4.1 Incluye

1. Recomposición de layout del workspace Compras.
2. Sistematización de KPIs, toolbar, tabla, badges y estados vacío/carga/error.
3. Refactor visual del drawer de trabajo con navegación interna por secciones.
4. Separación visual de flujos OC y recepción cuando compiten en el mismo contexto.
5. Alineación de `SupplierPicker` a patrón combobox accesible del portal.
6. Extensión de `inventory-labels.ts` con variantes semánticas de badge (estado, prioridad, alertas).
7. Pruebas unitarias de componentes afectados y ampliación E2E de affordances visuales críticas.

### 4.2 No incluye

1. Nuevos endpoints, migraciones ni cambios de dominio backend.
2. Scoring avanzado de proveedor, portal proveedor o contratos marco (Fase 3 PRD).
3. Rediseño del shell global del portal ni de otras pestañas de Inventario.
4. Nuevas dependencias npm ni cambios de stack.
5. ADR nuevo (permanece dentro de ADR-048).

---

## 5. Dirección visual aprobada

### 5.1 Principio rector

**Bandeja como centro operativo; creación como superficie secundaria accesible.**

Inspiración directa: split operativo de `OperationsClient` (crear vs seguir) y KPIs accionables de `SchedulingSummaryStrip`.

### 5.2 Arquitectura de franjas

```mermaid
flowchart TB
    subgraph A [Franja A — Resumen operativo]
        KPI[PurchaseWorkspaceSummary\nKPIs clicables con acento semántico]
    end

    subgraph B [Franja B — Trabajo principal xl:grid 5+7]
        Composer[PurchaseRequestComposer\no drawer Nueva solicitud]
        Queue[PortalPanel Bandeja de solicitudes]
        Toolbar[PurchaseRequestsToolbar\nfiltros + refresh + chips activos]
        Table[PurchaseRequestsTable\nbadges + fila activa + empty state]
    end

    subgraph C [Franja C — Contextual]
        Workbench[PurchaseRequestWorkbenchDrawer\ntabs: Resumen | Líneas | Cotizaciones | Aprobación | OCs | Recepciones]
        Order[PurchaseOrderDrawer\nsolo OC]
        Receipt[GoodsReceiptPanel\npaso posterior o tab Recepciones]
    end

    A --> B
    B --> C
    KPI -->|click filtra bandeja| Toolbar
    Table -->|abrir fila| Workbench
    Workbench --> Order
    Order --> Receipt
```

### 5.3 Orden obligatorio top-down

| # | Bloque | Responsabilidad |
| --- | --- | --- |
| 1 | Franja A — KPIs | Contadores por etapa; clic aplica filtro equivalente |
| 2 | Franja B — Split principal | Izquierda: nueva solicitud (≥1280px) o CTA que abre drawer; derecha: bandeja |
| 3 | Toolbar de bandeja | Filtros, contador de resultados, actualizar, limpiar filtros |
| 4 | Tabla densa | Escaneo rápido con badges y alertas |
| 5 | Drawers contextuales | Trabajo por solicitud sin anidar paneles |

---

## 6. Especificación por componente

### 6.1 `PurchaseWorkspaceSummary` → KPIs accionables

**Referencia:** `SchedulingSummaryStrip` (`apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx`).

| KPI | Acento | Filtro al hacer clic |
| --- | --- | --- |
| Por cotizar | `primary` | `status ∈ {DRAFT, PENDING_QUOTES}` (Fase 10) |
| Por aprobar | `warning` | `status=PENDING_APPROVAL` |
| Listas para OC | `primary` | `status=APPROVED` |
| Por recibir | `neutral` | preset `pendingReceipt` → `status=CONVERTED_TO_PO` |
| Urgentes | `danger` | preset `urgent` → `priority=URGENT` |
| Vencidas | `danger` | preset `overdue` → `neededByDate` vencida y no cerrada |

**Contrato de filtro cliente (Fase A/B):**

```typescript
type PurchaseKpiPreset =
  | 'pendingQuotes'
  | 'pendingApproval'
  | 'readyForPo'
  | 'pendingReceipt'
  | 'urgent'
  | 'overdue';

interface PurchaseRequestFilters {
  requestType?: PurchaseRequestType;
  status?: PurchaseRequestStatus;
  priority?: PurchaseRequestPriority;
  search?: string;
  kpiPreset?: PurchaseKpiPreset;
}
```

Los presets `overdue` y `pendingReceipt` se resuelven en cliente sobre el arreglo `requests` ya cargado (misma lógica que `PurchaseWorkspaceSummary`). No requieren extensión API en v1.0.

**Reglas visuales:**

- Contenedor: `rounded-3xl`, `shadow-sm`, `portal-eyebrow-muted`, `bg-iwana-surface-soft` o acento semántico.
- Altura mínima uniforme entre tarjetas (`min-h-[168px]` como referencia WFM).
- Estado activo: borde `border-iwana-primary/40` cuando el KPI coincide con filtro aplicado.
- Loading: skeleton por tarjeta, no texto “Cargando…”.
- Props nuevas sugeridas: `activeFilter`, `onFilterChange`, `isLoading`.

### 6.2 `PurchaseRequestsToolbar` (nuevo)

Extraer de `PurchaseRequestsTable` la fila de filtros y acciones.

**Contenido mínimo:**

- `Select` / `Input` de `@iwana/ui` (no controles HTML crudos).
- Chips de filtros activos con acción “Quitar”.
- Botón “Actualizar” con `interactiveFocusClassName`.
- Texto auxiliar: “{n} solicitudes” / “Sin resultados con estos filtros”.

### 6.3 `PurchaseRequestsTable`

**Columnas Fase A** (campos disponibles en `PurchaseRequestRecord`):

| Columna | Presentación |
| --- | --- |
| Número / título | Texto semibold; fila clickeable |
| Tipo | Texto secundario |
| Prioridad | `Badge` con variante semántica |
| Área solicitante | `requestingArea` truncado con `title` |
| Estado | `Badge` con variante de `inventory-labels` |
| Fecha requerida | `neededByDate` localizada; alerta si vencida |
| Alertas | Icono + badge (“Urgente”, “Vencida”, “Excepción” si `exceptionReason`) |
| Acción | Botón secundario “Abrir” o solo fila clickeable |

**Columnas diferidas** (requieren extensión aditiva de listado o puerto de usuarios — fuera de Fase A/B):

| Columna | Motivo |
| --- | --- |
| Solicitante (nombre) | Listado expone `requestedByUserId`, no display name |
| Proveedor adjudicado | No viene en `GET /purchasing/requests` |
| Total estimado | Agregación por líneas no incluida en listado actual |

EM-ARCH autoriza mostrar estas columnas solo cuando exista contrato de listado enriquecido; hasta entonces permanecen en drawer de detalle.

**Estados UI:**

- Vacío: `PortalEmptyState` con CTA “Nueva solicitud”.
- Carga: `PortalSkeletonBlock` (mínimo 5 filas).
- Error: `PortalAlert variant="danger"`.
- Fila activa: `bg-iwana-primary-50/60` + `interactiveFocusClassName` en foco.

**Prohibido en UI final:** mostrar `inventoryItemId`, `partyRefId` u otros identificadores técnicos como texto principal.

### 6.4 `PurchaseRequestComposer`

> **Addendum 2026-07-14 (AI-EM-ARCH):** el layout create-mode de este componente **evoluciona a "lienzo apilado"** — se elimina el split `xl:grid-cols-[7fr_5fr]` descrito abajo y se reemplaza por cuatro zonas apiladas a todo el ancho (Datos → Captura sticky → Borrador full-width → Justificación + footer). El campo "Título" deja de ser full-bleed y la tabla del borrador pasa a ancho completo para eliminar el scroll horizontal al crecer. Esta sub-sección queda **superseded** por [`docs/specs/2026-07-14-mod12-compras-composer-lienzo-apilado-design.md`](2026-07-14-mod12-compras-composer-lienzo-apilado-design.md), que es la fuente vigente para el compositor.

| Bloque | Encabezado |
| --- | --- |
| Cabecera | `PortalSectionHeader` — “Datos de la solicitud” |
| Líneas | `PortalSectionHeader` — “Líneas de abastecimiento” |
| Justificación | `PortalSectionHeader` — “Justificación” |

**Cambios obligatorios:**

- Título del panel: **“Nueva solicitud de compra”** (eliminar copy técnico “Compositor con líneas mixtas”).
- Cada línea: botón quitar línea (mínimo 2 líneas para mostrar quitar).
- Keys estables por `line.id` temporal en cliente o índice con uuid local — no depender solo de `index` en listas dinámicas.
- Resumen previo al envío: tipo, prioridad, cantidad de líneas, total estimado.
- En viewport `<1280px`: composer en drawer full-width “Nueva solicitud” disparado desde CTA en toolbar.

### 6.5 `PurchaseRequestWorkbenchDrawer`

**Problema actual:** múltiples `PortalPanel` anidados dentro de `Dialog` (cards dentro de cards).

**Solución aprobada:**

- Un único contenedor de drawer (`Dialog` / drawer portal existente).
- Navegación interna por **tabs** o **segmented control** sticky:

| Tab | Contenido |
| --- | --- |
| Resumen | Tipo, prioridad, política, siguiente acción recomendada |
| Líneas | Tabla de líneas con estado por línea |
| Cotizaciones | `QuoteComparisonPanel` + registro de cotización |
| Aprobación | Gating, excepción, historial de decisión |
| Órdenes | Listado de OCs derivadas + CTA generar OC |
| Recepciones | Enlaces a recepciones / `GoodsReceiptPanel` embebido ligero |

**Reglas:**

- Usar `PortalSectionHeader` dentro de cada tab, no `PortalPanel` hijo.
- Loading: `PortalSkeletonBlock` por sección.
- Banner único “Siguiente acción recomendada” según estado (ej. “Registrar cotización”, “Aprobar con excepción”, “Generar OC”).
- CTA primario siempre en footer del drawer, contextual al tab activo.
- Líneas: mostrar descripción operativa o ítem; fallback técnico solo en modo depuración (no en producción).

### 6.6 `PurchaseOrderDrawer`

- Responsabilidad única: creación/edición de OC.
- Recepción se abre desde tab Recepciones del workbench o desde `GoodsReceiptPanel` — no mezclar formulario de recepción en el mismo scroll de OC.
- Unificar inputs con `@iwana/ui`; eliminar `tracking-[0.14em]` manual en eyebrows (usar `portal-eyebrow` / `portal-eyebrow-muted`).

### 6.7 `SupplierPicker`

Promover a primitive reutilizable del portal **solo en Fase C**. Hasta entonces permanece en `apps/portal/src/components/inventory/SupplierPicker.tsx`.

**Requisitos WCAG mínimos:**

- `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`.
- Navegación ↑↓ Enter Escape.
- Debounce de búsqueda ≥300 ms; no disparar con texto vacío.
- Lista en `role="listbox"`; ítems `role="option"`.
- Error con `PortalAlert`; foco visible en todos los estados.

### 6.8 `QuoteComparisonPanel` y `SupplierSummaryCard`

- Cotización seleccionada: borde `border-iwana-primary/30` + check visible.
- Comparación: monto total, cobertura de líneas, proveedor — alineado a densidad de tabla operativa.
- `SupplierSummaryCard`: mantener; añadir skeleton en carga.

### 6.9 `inventory-labels.ts` — variantes de badge

Extender con funciones o mapas de variante (no solo label):

```typescript
// Ejemplo de contrato esperado (implementación a criterio de dev)
getPurchaseRequestStatusBadgeVariant(status): 'neutral' | 'primary' | 'warning' | 'danger' | 'success'
getPurchaseRequestPriorityBadgeVariant(priority): 'neutral' | 'warning' | 'danger'
```

| Estado solicitud | Variante sugerida |
| --- | --- |
| `DRAFT` | `neutral` |
| `PENDING_QUOTES` | `primary` |
| `PENDING_APPROVAL` | `warning` |
| `APPROVED` | `success` |
| `REJECTED` / `CANCELLED` | `danger` |
| `CONVERTED_TO_PO` | `success` |

| Prioridad | Variante |
| --- | --- |
| `LOW` / `NORMAL` | `neutral` |
| `HIGH` | `warning` |
| `URGENT` | `danger` |

---

## 7. Tokens y patrones iWana

| Patrón | Uso en Compras |
| --- | --- |
| `portal-eyebrow` / `portal-eyebrow-muted` | Subtítulos de KPI y secciones |
| `bg-iwana-surface-soft` | Superficies secundarias |
| `rounded-2xl` / `rounded-3xl` | Tarjetas KPI (`3xl`), paneles (`2xl`) |
| `shadow-sm` | KPIs y tarjetas elevadas |
| `text-iwana-secondary-700` | Texto sobre blanco (AA) |
| `interactiveFocusClassName` | KPIs clicables, filas, botones custom |
| `PortalEmptyState` | Bandeja vacía, tabs sin datos |
| `PortalSkeletonBlock` | Carga de tabla y drawer |
| `PortalAlert` | Errores de API y validación |
| `PortalSectionHeader` | Bloques dentro de composer y tabs |
| `Badge` (`@iwana/ui`) | Estado, prioridad, alertas |

**Anti-patrones prohibidos en este submódulo:**

- `PortalPanel` anidado dentro de otro `PortalPanel` o `Dialog`.
- Controles `<select>` / `<input>` / `<textarea>` crudos donde exista equivalente `@iwana/ui`.
- Copy técnico visible al usuario (“Compositor”, IDs de sistema).
- `fieldClassName` duplicado en 5+ archivos sin extracción a helper compartido del módulo.

---

## 8. Breakpoints y comportamiento responsive

| Viewport | Franja B (split) | KPIs | Drawer |
| --- | --- | --- | --- |
| `≥1536px` | Grid `5fr / 7fr` — composer fijo izquierda | 6 columnas × 1 fila | Ancho `max-w-3xl` o equivalente portal |
| `≥1280px` y `<1536px` | Grid `5fr / 7fr` | 3 × 2 | Tabs horizontales |
| `≥768px` y `<1280px` | Stack: bandeja arriba, composer en drawer | 2 × 3 | Full width |
| `<768px` | CTA “Nueva solicitud” en toolbar; bandeja full width | 2 columnas | Full screen; tabs scroll horizontal |

**Orden mobile:** KPI → Toolbar → Tabla → drawers. Acciones primarias siempre en footer sticky del drawer.

---

## 9. Fases de ejecución propuestas

### Fase visual A — Quick wins (prioridad merge UI)

| ID | Entregable | Archivos principales |
| --- | --- | --- |
| VA-01 | KPIs accionables con acento y skeleton | `PurchaseWorkspaceSummary.tsx`, `PurchaseWorkspace.tsx` |
| VA-02 | Badges estado/prioridad en tabla | `PurchaseRequestsTable.tsx`, `inventory-labels.ts` |
| VA-03 | `PortalEmptyState` + `PortalSkeletonBlock` | `PurchaseRequestsTable.tsx`, drawers |
| VA-04 | Reorden layout split composer/bandeja | `PurchaseWorkspace.tsx` |
| VA-05 | Eliminar IDs técnicos visibles | `PurchaseRequestWorkbenchDrawer.tsx` |
| VA-06 | Unificar inputs `@iwana/ui` | Tabla, composer, `PurchaseOrderDrawer.tsx` |
| VA-07 | Extraer `PurchaseRequestsToolbar` (filtros, chips, actualizar) | Nuevo + `PurchaseRequestsTable.tsx` |

**Gate Fase A:** criterios CA-UI-01 a CA-UI-05 y CA-UI-10 (sección 11).

### Fase visual B — Drawer operativo

| ID | Entregable | Archivos principales |
| --- | --- | --- |
| VB-01 | Tabs internos workbench | `PurchaseRequestWorkbenchDrawer.tsx` |
| VB-02 | Banner “siguiente acción” | `PurchaseRequestWorkbenchDrawer.tsx` |
| VB-03 | Separar recepción de OC drawer | `PurchaseOrderDrawer.tsx`, `GoodsReceiptPanel.tsx` |
| VB-04 | `SupplierPicker` combobox accesible (aria + teclado) | `SupplierPicker.tsx` |

**Gate Fase B:** criterios CA-UI-06 a CA-UI-09.

### Fase visual C — Design system (opcional post-A/B)

| ID | Entregable |
| --- | --- |
| VC-01 | Promover `SupplierPicker` a shared primitive |
| VC-02 | Helper `purchaseFieldClassName` o adopción total de primitives UI |
| VC-03 | Documentar patrones en skill/catálogo interno si EM-ARCH lo dispone |

---

## 10. Mapeo técnico por archivo

### Frontend portal

| Archivo | Acción |
| --- | --- |
| `apps/portal/src/components/inventory/PurchaseWorkspace.tsx` | Layout split, estado de filtro KPI, orquestación drawers |
| `apps/portal/src/components/inventory/PurchaseWorkspaceSummary.tsx` | KPIs clicables, acentos, skeleton |
| `apps/portal/src/components/inventory/PurchaseRequestsTable.tsx` | Badges, fila activa, empty/loading/error |
| `apps/portal/src/components/inventory/PurchaseRequestsToolbar.tsx` | **Crear** — filtros y acciones |
| `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx` | Secciones, quitar línea, copy, drawer mobile |
| `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx` | Tabs, sin paneles anidados, siguiente acción |
| `apps/portal/src/components/inventory/PurchaseOrderDrawer.tsx` | Alcance OC únicamente |
| `apps/portal/src/components/inventory/SupplierPicker.tsx` | A11y combobox; posible move a shared |
| `apps/portal/src/components/inventory/QuoteComparisonPanel.tsx` | Estado seleccionado |
| `apps/portal/src/components/inventory/inventory-labels.ts` | Variantes badge |
| `apps/portal/src/components/inventory/InventoryClient.tsx` | Wiring si cambia estructura de pestaña |

### Backend

**Sin cambios de contrato** en Fase visual A/B.

**Decisión EM-ARCH (Q5):** los filtros KPI `overdue` y `pendingReceipt` se implementan en **filtro cliente** sobre el listado ya cargado. No se autoriza extensión API en v1.0 de este spec.

Columnas diferidas (proveedor, total, nombre solicitante) quedan fuera de alcance hasta un addendum que apruebe enriquecimiento aditivo de `GET /purchasing/requests`.

### Testing

| Capa | Archivos |
| --- | --- |
| Unit portal | `*.spec.tsx` de cada componente tocado |
| E2E | `e2e/tests/portal-inventory-scm.spec.ts` — KPI filtra bandeja, abrir solicitud por fila, composer mobile |

---

## 11. Criterios de aceptación visual

| ID | Criterio | Fase |
| --- | --- | --- |
| CA-UI-01 | Al cargar Compras, el usuario identifica pendientes por etapa sin leer la tabla | A |
| CA-UI-02 | Clic en KPI aplica filtro visible (chip o estado activo en tarjeta) | A |
| CA-UI-03 | Tabla usa `Badge` para estado y prioridad; ningún enum crudo visible | A |
| CA-UI-04 | Bandeja vacía muestra `PortalEmptyState` con CTA crear | A |
| CA-UI-05 | Cero identificadores técnicos como texto principal en drawer | A |
| CA-UI-06 | Workbench usa tabs/secciones sin `PortalPanel` anidado | B |
| CA-UI-07 | OC y recepción no comparten el mismo formulario en un único scroll | B |
| CA-UI-08 | `SupplierPicker` operable por teclado y con aria combobox | B |
| CA-UI-09 | Layout responsive cumple matriz sección 8 | A+B |
| CA-UI-10 | Paridad de tokens con `SchedulingSummaryStrip` en KPIs | A |

---

## 12. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Filtros KPI `overdue` / `pendingReceipt` | Bajo | Filtro cliente sobre `requests` (aprobado EM-ARCH) |
| Regresión E2E por cambio de selectores | Medio | Actualizar `portal-inventory-scm.spec.ts` en mismo PR |
| Promoción `SupplierPicker` a shared amplía alcance | Bajo | Diferida a Fase C; permanece en inventory |
| Tabs en drawer aumentan complejidad de estado | Medio | Estado de tab local en drawer; sin URL obligatoria en v1.0 |
| Columnas proveedor/total/solicitante ausentes en listado | Medio | Diferidas; no bloquean Fase A |

---

## 13. Entregables documentales

| Artefacto | Estado |
| --- | --- |
| `docs/quality/CHECKLIST-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md` | Creado — gate de ejecución |
| `docs/plans/2026-06-25-mod12-compras-ui-alignment-fase-a.md` | Creado — plan Fase A |
| Informe post-ejecución Fase A | Pendiente al cerrar implementación |

Al cerrar Fase visual A:

1. Crear `docs/informes/INFORME-MOD12-COMPRAS-UI-ALIGNMENT-FASE-A-v1.0.md` con evidencia de comandos y CA-UI-*.
2. Marcar checklist y este spec como **Parcialmente ejecutado** (Fase A) o **Ejecutado** (A+B).

---

## 14. Decisión EM-ARCH

### 14.1 Resolución de preguntas

| # | Pregunta | Decisión EM-ARCH |
| --- | --- | --- |
| Q1 | ¿Se aprueba la dirección visual de franjas A/B/C? | **Aprobado** |
| Q2 | ¿Composer fijo en desktop vs siempre drawer? | **Aprobado:** fijo `≥1280px`; drawer en `<1280px` |
| Q3 | ¿Alcance de merge gate? | **Aprobado:** Fase A obligatoria para “UI producción”; Fase B en sprint inmediato siguiente |
| Q4 | ¿Promover `SupplierPicker` a shared en Fase C? | **Diferido a Fase C**; no elevar a `packages/ui` |
| Q5 | ¿Extensión API para filtros KPI? | **No** en v1.0; solo filtro cliente |

### 14.2 Condiciones de aprobación

1. Fase visual A es prerequisito de merge para considerar Compras cerrado en identidad iWana.
2. Columnas proveedor, total y nombre de solicitante quedan explícitamente fuera de Fase A/B.
3. No se emitirá ADR; el cambio es presentacional dentro de ADR-048.
4. Ejecución autorizada a AI-SR-FULL con plan y checklist referenciados.

### 14.3 Bloque de firma

| Rol | Nombre | Decisión | Fecha |
| --- | --- | --- | --- |
| EM-ARCH | AI-EM-ARCH | ☑ Aprobado | 2026-06-25 |
| CTO | — | ☑ N/A (sin cambio de stack ni boundary) | 2026-06-25 |
| AI-SR-UI-SYS | AI-SR-UI-SYS | Spec emitido | 2026-06-25 |

**Comentarios EM-ARCH:**

Spec coherente con PRD/HLD Fase 02 y ADR-048. Se corrigen inconsistencias de dominio (`neededByDate`), secuenciación de toolbar (movido a Fase A como VA-07) y columnas de tabla no soportadas por contrato actual. Dirección visual alineada a referentes WFM/Operaciones. Autorizada ejecución Fase visual A.

---

## 15. Definition of Done (Fase visual A)

- [ ] Checklist `CHECKLIST-MOD12-COMPRAS-UI-ALIGNMENT-v1.0` secciones 2 y 4 completas.
- [ ] `pnpm --filter @iwana/portal typecheck` sin errores.
- [ ] Tests unitarios de componentes tocados en verde.
- [ ] E2E `portal-inventory-scm.spec.ts` en verde.
- [ ] Sin regresión de boundaries ni contratos API.
- [ ] Informe de cierre Fase A publicado.

---

## 16. Resumen ejecutivo

La Fase 02 de Compras es **funcionalmente correcta** y respeta ADR-048. La deuda pendiente es **exclusivamente de experiencia visual y consistencia iWana**. Este spec — **aprobado por EM-ARCH** — autoriza ejecución incremental: Fase A (obligatoria) y Fase B (siguiente sprint), sin cambios backend en v1.0, reutilizando patrones de Programación y Operaciones.

---

## 17. Extensión — Ingreso directo / Compra de mostrador (2026-07-16)

El modo `counter-purchase` quedó fuera de las fases A/B originales. El contrato de pantalla create-mode alineado a Firma iWana vive en:

- [`docs/specs/2026-07-16-mod12-ingreso-directo-ui-contract.md`](./2026-07-16-mod12-ingreso-directo-ui-contract.md)

**Carril rápido DS-OWNER:** paridad estructural con create-mode (shell, secciones, `DatePicker`, tabla `portalDataTable*`, `PurchaseProductSearch`); sin cambio de API ni tokens de marca.

## 18. Extensión — Fusión "Cotización" + "Cotizaciones" → "Cotizar" (2026-07-17, Fase 10)

La pestaña `rfq` ("Cotización") y la pestaña `quotes` ("Cotizaciones") de `PurchaseRequestWorkbenchDrawer` se fusionan en una sola pestaña **"Cotizar"** (`PurchaseWorkbenchTab` baja de 8 a 7 valores), con dos zonas internas: "Invitar proveedores" (contenido actual de `RfqInvitationsPanel`) y "Ofertas registradas" (contenido actual de `QuoteComparisonPanel`). Motivo: ambas pestañas eran fácilmente confundibles por nombre y forman parte del mismo paso conceptual del flujo.

**Enmienda de alcance (GO CTO 2026-07-17):**
- KPI/filtro «Por cotizar» incluye `DRAFT | PENDING_QUOTES`.
- Invariante C1: oferta manual sin invitación se bloquea si existe RFQ activa; `RfqService.send` no retrocede una solicitud ya avanzada.

**Contrato UI (carril rápido DS-OWNER):** un `TabsContent value="cotizar"` con `space-y-6`, zona superior "Invitar proveedores" y zona inferior "Ofertas registradas"; empty state histórico: «Cotización sin ronda formal».

Diseño funcional completo en:

- [`docs/specs/2026-07-17-mod12-compras-cotizar-fase10-design.md`](./2026-07-17-mod12-compras-cotizar-fase10-design.md)
- [`docs/prompts/PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md`](../prompts/PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md)
