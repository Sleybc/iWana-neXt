# Contrato de componente — Tablas operativas de Operaciones (`TasksTable` · `ExecutionOrdersTable`)

**Versión:** 1.1 — **supera a v1.0** (2026-09-13), marcada superada en este mismo acto (protocolo §3bis regla 1). Changelog v1.0 → v1.1 en §12.
**Estado:** **Aprobado** (v1.1, review OLA 4 de AI-DS-OWNER: `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-DS-OWNER-v1.0.md`) — carril rápido de UI (protocolo §3bis regla 3, delegación ADR-049; el plan §3.5 registra F3 con A = AI-DS-OWNER). Alimenta **G2**; su congelación formal la declara el prompt de ejecución citando ruta y versión (protocolo §3bis).
**Fecha:** 2026-09-13
**Fase:** F3 del plan `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 · MOD11-OPERACIONES-SUBRUTAS
**Autor:** AI-DS-OWNER
**Consumidor:** AI-FE-PLATFORM — F2 (scaffold de archivos, refactor puro) y **F5 (cableado normativo)**. F2 no implementa este contrato: la tabla actual conserva su comportamiento hasta F5.
**Skills aplicadas (modo diseño):** `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` (modo diseño), `senior-ui-systems-designer`; de apoyo `wcag-audit-patterns`. `ui-ux-pro-max` subordinada (plan §4.2); ninguna decisión de este contrato se fundamenta en sus heurísticas.

---

## 1. Alcance

Contrato de props, anatomía, variantes y estados requeridos de las dos tablas operativas del módulo Operaciones del portal:

- `TasksTable` — bandeja de tareas operativas (`/dashboard/operations/tasks`).
- `ExecutionOrdersTable` — bandeja de órdenes de ejecución (`/dashboard/operations/execution-orders`).

**Fuera de alcance de este contrato:** toolbar y filtros (`ExecutionOrdersToolbar.tsx`, composición de `TasksInboxClient`/`ExecutionOrdersClient`), layout de página, gates de permisos, drawers, copy de vacíos (F4, AI-PROD-UX) y cualquier código de implementación (AI-FE-PLATFORM).

## 2. Modelo normativo y fuentes verificadas

**Modelo a copiar: `AssuranceClient` + `AssuranceTicketsTable`** — no `UsersTable`. Verificado en código:

| Pieza | Evidencia |
| --- | --- |
| Estado de tabla en URL | `useTableQueryState` — `apps/portal/src/lib/use-table-query-state.ts:80`; consumo en `AssuranceClient.tsx:136-139` |
| Lectura de la capability | `const randomAccess = ticketsMeta.capabilities.randomAccess === true;` — `AssuranceClient.tsx:186` |
| Elección en runtime del pie | `AssuranceTicketsTable.tsx:335-366` — ramas complementarias sobre un único booleano (degradación declarada de ADR-065 §2) |
| Ventana de filas | `listPageWindow` — `apps/portal/src/lib/list-meta.ts:134-146` |
| `ListMeta` completo | `apps/portal/src/lib/list-meta.ts:5-19` (incluye `capabilities.sortableFields`) |

`UsersClient` sirve solo como referencia del helper `*-query.ts` (spec de diseño §4.10), no del pie.

**Contrato de API del que cuelgan las columnas:** la proyección de columnas de `ExecutionOrdersTable` se ancla en `ExecutionOrderListItem` según la spec de diseño v1.0 §4.7.1 (**Aprobado por el CTO**), a publicar por F0 en `packages/shared/src/contracts/operations/execution-orders-list.ts` v1; los tipos de tarea en `packages/shared/src/contracts/operations/operational-tasks.ts` v1 (spec §4.7.3), re-exportados por `@/lib/api-client` — las tablas importan los tipos **solo** desde `@/lib/api-client`. Si el contrato publicado por F0 diverge de la proyección de la spec, es re-sync de contrato vía AI-EM-ARCH (protocolo §3bis regla 1), nunca un ajuste local.

## 3. Anatomía

Composición de arriba hacia abajo; **todo** desde primitives y class-tokens existentes (`apps/portal/src/components/shared/portal-ui.tsx`, `@iwana/ui`):

```text
<TableShell>                    portalDataTableShellClassName (portal-ui.tsx:65)
├── <thead>                     portalDataTableHeadRowClassName (:69)
│   └── <th> × n                <PortalDataTableHead> (:120)
├── <tbody>                     portalDataTableBodyClassName (:73)
│   ├── fila de datos           portalTableRowHoverClassName (:62) + portalDataTableCellClassName (:112)
│   └── [loading] filas skeleton  <PortalSkeletonBlock className="h-10 rounded-xl"> (precedente PlanCatalogTable.tsx:341)
└── <pie>  ← EXACTAMENTE UNO, ley de §5
    ├── modo paginado           <PortalTablePager> (:1294) + <PortalPageSizeSelect> (:1506)
    └── modo «Cargar más»       <PortalTablePagination> (:1081)
```

Deltas de composición frente a `AssuranceTicketsTable` (declaradas por el paso 15 del prompt F3):

1. **El componente de tabla no monta `PortalPanel`** ni la toolbar. El panel de página y la posición de la toolbar los compone el contenedor (`TasksInboxClient` / `ExecutionOrdersClient`), porque en el split de F2 la toolbar es un archivo separado (`ExecutionOrdersToolbar.tsx`). Evita cards anidadas sin función y mantiene el contrato componible. La tabla entrega su contenido dentro del shell de tabla, que ya es superficie completa (borde, radio `2xl`, `bg-white` / `dark:bg-dark-surface-2`, `shadow-sm`).
2. **Sin strip de conteo duplicado.** El `PortalResultsStrip` que hoy pinta `TasksTable.tsx:64` desaparece: en modo paginado el conteo lo porta el pager (una sola vez) y en «Cargar más» lo anuncia `PortalTablePagination` en `sr-only`/`aria-live` (portal-ui.tsx:1109-1113). Conteo duplicado strip+pie es regla dura P1 (reglas duras del skill `iwana-identity-ui-review`, ADR-064 §8).
3. `<table>` lleva `aria-label` descriptivo: `"Bandeja de tareas operativas"` / `"Bandeja de órdenes de ejecución"` (precedente `AssuranceTicketsTable.tsx:202`).
4. **Los vacíos E1–E5 no los monta la tabla: los compone el contenedor de la bandeja** con `PortalEmptyState` + acción (ratificado en v1.1; ver §6.6). La tabla solo renderiza filas, skeleton y pie — la misma separación que §6.7 fija para el error.

Ancho mínimo de la tabla dentro del shell scrolleable: `TasksTable` `min-w-[880px]`, `ExecutionOrdersTable` `min-w-[1024px]` (8 columnas). El scroll horizontal vive **dentro** del shell; nunca scrollea el layout.

## 4. Contrato de props

Calco de `AssuranceTicketsTableProps` (`AssuranceTicketsTable.tsx:40-65`): los diez campos de paginación conservan nombre y semántica exactos. Sobre ese calco, el contrato introduce **una mejora de exclusividad tipada** que Assurance no tiene: el grupo de paginación es una **unión discriminada sobre `randomAccess`**, de modo que pasar los dos modos a la vez es **error de compilación**, no una convención de render.

### 4.1 Grupo de paginación exclusivo (compartido por las dos tablas)

```ts
/** Modo paginado — exige `meta.capabilities.randomAccess === true`. */
interface OperationsTablePagedPagination {
  /** Discriminador. Sin valor por defecto; sin derivados locales. */
  randomAccess: true;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Prohibidos en modo paginado — el error de tipo es la garantía del contrato. */
  hasMore?: never;
  onLoadMore?: never;
}

/** Modo «Cargar más» — `meta.capabilities.randomAccess === false` (ADR-064, vigente). */
interface OperationsTableLoadMorePagination {
  randomAccess: false;
  hasMore: boolean;
  onLoadMore: () => void;
  page?: never;
  pageCount?: never;
  pageSize?: never;
  onPageChange?: never;
  onPageSizeChange?: never;
}

type OperationsTablePagination = OperationsTablePagedPagination | OperationsTableLoadMorePagination;
```

### 4.2 `TasksTableProps`

```ts
interface TasksTableProps {
  tasks: OperationalTaskRecord[];              // tipo desde '@/lib/api-client' (re-export de @iwana/shared)
  total: number;
  /** Carga inicial: skeleton con forma. Nunca spinner. */
  isLoading: boolean;
  /** Refresco con datos ya pintados: aria-busy + controles disabled, sin opacity. */
  refreshing?: boolean;
  /** Posición 1-based de las filas visibles (ambos pies la consumen). */
  from: number;
  to: number;
  /** Apertura del detalle (drawer por URL, spec §4.6). */
  onOpenRow: (task: OperationalTaskRecord) => void;
  /** Fila con el detalle abierto (deep link ?taskId=). Resaltado de selección, §6.3. */
  activeRowId?: string | null;
  /** Grupo exclusivo: exactamente una variante. */
  pagination: OperationsTablePagination;
}
```

### 4.3 `ExecutionOrdersTableProps`

```ts
interface ExecutionOrdersTableProps {
  orders: ExecutionOrderListItem[];            // proyección spec de diseño §4.7.1, tipo desde '@/lib/api-client'
  total: number;
  isLoading: boolean;
  refreshing?: boolean;
  from: number;
  to: number;
  onOpenRow: (order: ExecutionOrderListItem) => void;
  activeRowId?: string | null;
  pagination: OperationsTablePagination;
}
```

### 4.4 Props prohibidas en v1

No existen en este contrato y su presencia es violación del mismo: `sortBy`, `sortDir`, `onSortChange`, `sortableFields`, y cualquier variante local de los diez campos calcados (nombres nuevos para el mismo concepto).

## 5. Ley del pie — cómo el contrato hace imposible montar los dos pies

**Invariante ADR-065 (verificada en el ADR): «una tabla monta `PortalTablePagination` o `PortalTablePager`, nunca ambos. Hallazgo P1 en review».** El contrato la garantiza en tres capas:

1. **Tipo:** `pagination` es una unión discriminada sobre `randomAccess` (§4.1). Un cliente no puede construir props que porten a la vez el grupo paginado (`page`/`pageCount`/`onPageChange`/`onPageSizeChange`) y el grupo cursor (`hasMore`/`onLoadMore`): los miembros `never` convierten el intento en error de compilación. Con props válidas, el componente no recibe material para montar dos pies.
2. **Render:** el pie se expresa como **un único punto de montaje** — un ternario sobre el discriminador, nunca dos bloques condicionales independientes (así lo escribe Assurance por convención; aquí es ley):

   ```tsx
   {showPager ? (
     pagination.randomAccess ? (
       <PortalTablePager page={pagination.page} pageCount={Math.max(1, pagination.pageCount)}
         onPageChange={pagination.onPageChange} from={from} to={to} total={total}
         resource={RESOURCE} loading={refreshing}
         pageSizeControl={<PortalPageSizeSelect value={pagination.pageSize}
           onChange={pagination.onPageSizeChange} disabled={refreshing} />} />
     ) : (
       <PortalTablePagination hasMore={pagination.hasMore} onLoadMore={pagination.onLoadMore}
         loading={refreshing} resourceLabel={RESOURCE_LABEL} shown={to} total={total} />
     )
   ) : null}
   ```

   con `showPager = !isLoading && total > 0` (patrón `AssuranceTicketsTable.tsx:102`). QA lo verifica con grep: exactamente una ocurrencia de `PortalTablePager` y una de `PortalTablePagination` por archivo de tabla, en ramas opuestas de un mismo ternario (§9).
3. **Ubicación del modo:** el modo **no se decide en el componente ni por módulo**. Lo calcula el **cliente contenedor** desde el `meta` del servidor y lo entrega por props:

   ```ts
   const randomAccess = listMeta.capabilities.randomAccess === true;        // AssuranceClient.tsx:186
   const pageCount = listMeta.totalPages ?? (listMeta.total > 0 ? 1 : 0);   // AssuranceClient.tsx:380
   const { from, to } = listPageWindow(listMeta);                            // list-meta.ts:134
   ```

   El componente carece de default, de `useState` y de cualquier constante que derive `randomAccess`; la prop es obligatoria sin valor por defecto. Prohibido decidirlo por ruta, módulo o preferencia local — es la corrección del defecto actual (`TasksTable.tsx:128` monta siempre «Cargar más»).

Receta de construcción de la prop en el cliente (evita fricción al cablear):

```ts
const pagination = randomAccess
  ? { randomAccess: true as const, page, pageCount, pageSize, onPageChange, onPageSizeChange }
  : { randomAccess: false as const, hasMore, onLoadMore };
```

## 6. Estados requeridos

Los ocho estados del encargo, con primitive o token real y contraste calculado sobre tokens vigentes de `packages/ui/src/styles/globals.css`. Ninguna celda es editable: las bandejas son de lectura (estado *readonly* por construcción); el *success* de acciones vive en los drawers/contenedores (`PortalSuccessAlert`), no en la tabla.

### 6.1 Hover

Fila: `portalTableRowHoverClassName` (`hover:bg-iwana-surface-soft/80 dark:hover:bg-dark-surface-3`). Token de sistema, ya en vigor.

### 6.2 Focus

Todo elemento interactivo de fila (botón de número o título, acción de apertura) con `interactiveFocusClassName` (patrón vigente en `TasksTable.tsx:98`). El pager y el selector de tamaño ya lo traen del primitive (`portal-ui.tsx:1265`, `:247`). Foco siempre visible; prohibido `outline-none` sin reemplazo.

### 6.3 Active / selección

- **Fila con detalle abierto** (`activeRowId === row.id`): `bg-iwana-primary-50/60 dark:bg-iwana-primary-950/30` (patrón vigente `TasksTable.tsx:85`; texto de celda `gray-700` sobre ese fondo mantiene contraste AA holgado). Con `aria-current` no se marca: es selección de detalle, no navegación.
- **Página activa del pager:** `pageButtonActiveClassName` del primitive — fondo azul noche `iwana-primary`, nunca lima (la página es posición, no avance).

### 6.4 Disabled

Controles con atributo `disabled` real **más** `opacity-50` (contrato de estados atenuados, `portalDisabledControlClassName`, portal-ui.tsx:93; pager: `portal-ui.tsx:1266`). Durante `refreshing`: `PortalPageSizeSelect` disabled y controles del pie disabled.

### 6.5 Loading — skeleton con forma, nunca spinner

- **Carga inicial** (`isLoading` y sin filas): filas de skeleton con forma de tabla — un `<tr>` por fila esperada (tope 8) con `<PortalSkeletonBlock className="h-10 rounded-xl" />` en celda `colSpan` igual al número de columnas. Precedente: `PlanCatalogTable.tsx:341`, `BundlesManager.tsx:354-357`. Prohibido `animate-spin` como carga primaria de la tabla (regla dura P3 del skill).
- **Refresco** (`refreshing` con datos): sin skeleton — `portalDataBusyRegionClassName` (cursor progress) + `aria-busy="true"` en la región scrolleable (patrón `AssuranceTicketsTable.tsx:196-201`). Prohibido aplicar `opacity-*` a la región (contrato de estados atenuados §4.2).

### 6.6 Empty — con acción

**Composición ratificada (v1.1).** Los vacíos E1–E5 los **compone el contenedor de la bandeja** —conoce los filtros activos, el permiso de creación y las acciones de navegación— invocando `PortalEmptyState` con acción; la tabla no recibe props de vacío ni monta el primitive. Es la misma separación que §6.7 fija para el error: el estado es de la bandeja, el componente conserva sus props y solo renderiza filas, skeleton y pie. Ratificado en el review de OLA 4 sobre la implementación F5 (`INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-DS-OWNER-v1.0.md`): no vuelve a consultarse.

- **Sin filtros activos:** `PortalEmptyState` con acción obligatoria (CTA «Crear tarea» en la bandeja de tareas; orientación a programación en la de OT). Título, descripción y copy exacto los fija F4 (AI-PROD-UX); este contrato exige la presencia de la acción y el uso del primitive.
- **Con filtros activos:** `PortalEmptyState` «Sin resultados» + acción «Limpiar filtros».

### 6.7 Error

Lo renderiza el **contenedor** de la bandeja sobre el shell de tabla: `PortalAlert variant="error"` con acción «Reintentar» (re-ejecuta la última consulta). La tabla conserva el último dato válido; el mensaje es operativo, sin payload técnico ni PII. La condición de error no entra como prop de la tabla: es estado del contenedor, y separarlo mantiene el contrato de props calcado. El error **no co-renderiza el vacío**: mientras `error` esté presente, el estado de la bandeja es el error con reintento —sin filas previas sustituye a la composición vacía; con filas previas, la tabla las conserva—. Aclarado en v1.1 a partir del review de OLA 4 (hallazgo P1-1).

## 7. Columnas

Todas las celdas de fecha y número en `font-mono text-xs` (JetBrains Mono, firma de dato técnico) o `tabular-nums`; etiquetas **solo** vía `apps/portal/src/components/operations/operations-labels.ts` — prohibido renderizar enums crudos (regla dura P1; gate del script de auditoría).

### 7.1 `TasksTable` — 7 columnas

| # | Encabezado | Dato | Render |
| --- | --- | --- | --- |
| 1 | Número | `taskNumber` | `font-mono text-xs` |
| 2 | Título | `title` | Botón de apertura con `interactiveFocusClassName`; `font-medium` |
| 3 | Tipo | `type` | `getTaskTypeLabel(task.type)` |
| 4 | Estado | `status` | `Badge` con `getTaskStatusLabel` + `TASK_STATUS_VARIANTS` |
| 5 | Prioridad | `priority` | `getTaskPriorityLabel` (texto) |
| 6 | Destinatario | `recipientLabel` | `?? '—'` |
| 7 | **Vence** | `dueAt` | Gramática de despacho de la UX spec §7.3 («Vencida · fecha» con icono en escala `error`; «Hoy»/«Mañana»; fecha futura; terminada sin señal; `null → '—'`, decisión de este contrato pendiente de ratificación de AI-PROD-UX — D-4). El valor completo de `formatTaskDateTime(task.dueAt)` va en el texto accesible de la celda. **Sustituye a «Creada»** |

**Decisión «Vence» sustituye a «Creada»** (espec §4.10 admitía ambas): en una bandeja de despacho el vencimiento ordena el trabajo y la fecha de creación no es operativa (queda en el drawer). Siete columnas ya es el techo de densidad cómoda; dos fechas compiten sin aportar.

**Vencida** (decisión DS declarada, ratificable por AI-PROD-UX en F4): `dueAt` en el pasado con tarea no terminal (no Resuelta, no Cancelada) → texto del dato en `text-iwana-error-700 dark:text-error-400` con `font-medium`. Urgencia en escala `error` — nunca lima. Contraste: `iwana-error-700` #dc2626 sobre blanco 4,83:1 (AA; token designado para texto de error, `globals.css:92`); sobre dark rige la norma ADR-056 §2 punto 4 («error requiere su tono `-400` sobre dark-surface-3 y -4»). La comparación temporal se evalúa de forma determinista en el cliente (mecanismo a elección de FE-PLATFORM, p. ej. tras montar) para no inducir mismatch de hidratación.

### 7.2 `ExecutionOrdersTable` — 8 columnas (proyección spec §4.7.1)

| # | Encabezado | Dato | Render |
| --- | --- | --- | --- |
| 1 | Número | `number` (campo del contrato congelado `ExecutionOrderListItem`; `executionOrderNumber` es el nombre lógico del tramo futuro de ordenación, no de la proyección) | `font-mono text-xs`, botón de apertura |
| 2 | Estado | `status` | `Badge` con `EXECUTION_ORDER_STATUS_LABELS` + `EXECUTION_ORDER_STATUS_VARIANTS` |
| 3 | Resultado | `result` | `Badge` con `EXECUTION_ORDER_RESULT_LABELS` + `EXECUTION_ORDER_RESULT_VARIANTS`; `null → '—'` (texto) |
| 4 | Tipo de trabajo | `workType` | `EXECUTION_ORDER_WORK_TYPE_LABELS[workType]` |
| 5 | Ventana planificada | `plannedWindowStartAt` / `plannedWindowEndAt` | Inicio con `formatTaskDateTime`; si hay fin y difiere del inicio, «– fin»; `null → '—'`. `font-mono text-xs` |
| 6 | Asignado a | `assignee?.displayLabel` | `?? 'Sin asignar'` (vocabulario de `AssuranceTicketsTable.tsx:306`; encabezado ratificado contra UX spec §4.5) |
| 7 | Cliente | `customerDisplayLabel` | Texto |
| 8 | Municipio | `municipality` | Texto |

**Sin dirección ni datos de contacto, jamás:** `serviceAddress`, `workInstructions`, teléfono, correo o equivalente no existen en la proyección del listado y ninguna columna de este contrato los introduce (ADR-067, **Aprobado**, verificado — la ampliación de la proyección exige tabla de finalidad por campo). La dirección exacta vive en el detalle.

## 8. Decisiones de identidad

1. **Encabezados no ordenables.** Todas las columnas con `PortalDataTableHead`. **Prohibido adoptar `PortalDataTableSortableHead`** y cualquier control de orden mientras `meta.capabilities.sortableFields` esté vacío: `sortableFields: []` es estado conforme (ADR-065 §22-bis, verificado: «es un estado conforme, no deuda»), y la lista blanca la declara el servidor — la interfaz no la codifica por módulo (ADR-065 §18, verificado). Cuando el contrato de API publique la lista blanca (con medición p95 y autorización de AI-EM-ARCH), este contrato sube a v1.2 y se adopta `PortalDataTableSortableHead` con `field` validado contra la capability — modelos: `PlanCatalogTable.tsx:319`, `SubscribersListClient.tsx:284`. El orden por columna solo aplica con `randomAccess: true` (ADR-065 §19).
2. **Semántica del lima (spec Firma iWana §3).** En estas tablas el lima aparece exclusivamente como badge de **éxito** terminado: `EXECUTION_ORDER_STATUS_VARIANTS[COMPLETED] = 'lime'`. Prohibido en: pager (página = posición → azul noche), encabezados, columna «Vence»/vencida (urgencia → escala `error`), fondos base y toolbar. El archivo de etiquetas vigente ya codifica esto; el contrato lo ratifica como norma del módulo.
3. **Superficies y dark mode.** Solo class-tokens del sistema (`portalDataTableShellClassName`, `dark-surface-*`, `dark-border`). **Prohibido `dark:bg-gray-{700,800,900,950}`** (norma de `globals.css:120`, regla dura P1 del script). Prohibido proponer `tailwind.config.*` — sistema CSS-first. Glass/blur: prohibido en tablas (uso reservado a overlays).
4. **Tokens reales, cero inventos.** Este contrato no propone ningún token nuevo: todo se resuelve con los existentes (verificado contra `globals.css` v vigente). Si F5 encuentra una necesidad no cubierta, es `[CONSULTA]` a AI-DS-OWNER — no un valor local.
5. **Estados atenuados.** Ningún estado de esta tabla usa opacidad sobre texto salvo el patrón `disabled` del contrato de estados atenuados (`docs/specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md`, citado por los class-tokens de `portal-ui.tsx:76-103`).
6. **Tipografía y firmas presentes con función:** mono técnico en números/fechas, badges tonales de estado (par tonal del primitive `Badge`), eyebrow de encabezados (`.portal-eyebrow-muted` vía `PortalDataTableHead`), targets táctiles ≥44px (pager `h-11`, botones de fila con `min-h` del sistema).

## 9. Verificación del contrato (auditable por QA en F6)

1. **Un pie:** exactamente una ocurrencia de `PortalTablePager` y una de `PortalTablePagination` por archivo de tabla, en ramas opuestas de un único ternario sobre `pagination.randomAccess`; `pagination` sin default ni valor que combine grupos (el tipo no compila con ambos).
2. **Modo externo:** en el componente no existe `useState`, constante de módulo ni default que produzca `randomAccess`; en el cliente contenedor, la única fuente es `listMeta.capabilities.randomAccess === true`.
3. **Sin orden:** cero ocurrencias de `PortalDataTableSortableHead`, `sortBy`, `sortDir`, `onSortChange` en los archivos de las dos tablas; `aria-sort` ausente (tabla sin orden declarado).
4. **Etiquetas:** cada etiqueta de enum proviene de `operations-labels.ts`; cero enums crudos en JSX.
5. **Estados:** skeleton de filas en carga inicial, `aria-busy` en refresco, `PortalEmptyState` con acción en ambos vacíos **compuestos por el contenedor de la bandeja** (§6.6), `PortalAlert variant="error"` + reintento en el contenedor y sin co-render de vacío y error (§6.7).
6. **Gate mecánico obligatorio antes de entregar F5** (y tras cualquier toque de estos archivos):

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

Hoy corre limpio (corrida de verificación en el informe de esta sesión); debe seguir limpio.

## 10. Deltas declaradas frente a `AssuranceTicketsTableProps` (paso 15 del prompt F3)

| Delta | Motivo |
| --- | --- |
| Grupo de paginación como unión discriminada `pagination` (en vez de diez props planas) | Hacer **imposible** montar los dos pies: garantía de tipo, no convención (ADR-065: hallazgo P1). Nombres y semántica de los diez campos intactos |
| `randomAccess` sin default, solo en el grupo de paginación | El modo se lee de `meta`, jamás se decide en el componente |
| Sin `PortalPanel` ni toolbar dentro de la tabla | La toolbar es archivo separado en el split F2 (`ExecutionOrdersToolbar.tsx`); evita cards anidadas |
| Sin `PortalResultsStrip` | El conteo vive una sola vez (pager o `sr-only` del pie); conteo duplicado es regla dura P1 |
| `onOpenRow` (equivalente a `onOpenTicket`) + `activeRowId` nuevo | El detalle se abre por deep link (`?taskId=`, `?executionOrderId=`); `activeRowId` resalta la fila con detalle abierto |
| Columna «Vence» sustituye a «Creada»; énfasis de vencida en escala `error` | Bandeja de despacho: el vencimiento ordena el trabajo; urgencia nunca en lima |
| Fila de skeleton con forma (`PortalSkeletonBlock h-10 rounded-xl`) en carga inicial | Encargo §2.7: loading es skeleton con forma, no spinner; la carga textual de `AssuranceTicketsTable.tsx:220-229` no se replica |

## 11. Trazabilidad

- **Spec de diseño (encargo):** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0, Aprobado por el CTO 2026-09-13 — §2.3 (problema), §4.10 (este contrato).
- **UX spec (H5):** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md` v1.0 — §4.4/§4.5 (columnas), §6 (estados E1–E7), §7.3 (gramática de «Vence»).
- **ADR-065** — Paginación numerada y orden por columna, v1.2, **Aprobado**: invariante de pie único, §9 (estado en URL), §18 (lista blanca del servidor), §19 (orden solo con `randomAccess`), §22-bis (lista vacía conforme). Citas verificadas abriendo el ADR.
- **ADR-064** — Paginación de tablas del portal, **Aprobado** (superado parcialmente por ADR-065 en §§2, 3, 5 y 9; vigente para `randomAccess: false`).
- **ADR-067** — Proyección de datos personales en listados operativos, v1.0, **Aprobado**: sin dirección ni contacto en la bandeja.
- **ADR-056** — Base normativa de diseño, **Aprobado**: §2 normas dark (`dark-surface-*`, semánticos en `-400` sobre dark), prohibición `dark:bg-gray-*` registrada en `globals.css:120`.
- **ADR-049** — Carril rápido de UI (delegación de aprobación de este contrato).
- **Plan v2.1** — `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md`: F3, §3bis.3, §6 handoff H4 (criterio de aceptación: «permite un solo pie y no decide el modo en el componente»), R5 (riesgo de dos pies — dueño AI-DS-OWNER).
- **Tokens y primitives:** `packages/ui/src/styles/globals.css`; `apps/portal/src/components/shared/portal-ui.tsx`; `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`.

---

## 12. Changelog

| Versión | Fecha | Cambio | Origen |
| --- | --- | --- | --- |
| 1.0 | 2026-09-13 | Contrato inicial de las dos tablas operativas (F3) | Plan v2.1 §3.5; G2 |
| **1.1** | 2026-09-13 | (1) Ratificada la composición de vacíos E1–E5 por el contenedor de la bandeja (§3 delta 4, §6.6) — resuelve la consulta asíncrona de F5; (2) §7.2 col. 1 anclada al campo `number` del contrato congelado `ExecutionOrderListItem` y encabezado «Asignado a» ratificado contra UX §4.5 — resuelve la observación de OLA 3; (3) §7.1 «Vence» referenciada a la gramática UX §7.3; (4) §6.7 y §9.5 aclarados: el error no co-renderiza el vacío. **La v1.0 queda superada en este acto** (protocolo §3bis regla 1) | Review OLA 4 de AI-DS-OWNER (`INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-DS-OWNER-v1.0.md`) |
