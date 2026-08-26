# Contrato DS — `PortalTablePager`, `PortalPageSizeSelect` y `PortalDataTableSortableHead`

**Versión:** 1.3 (v1.3 añade `density` compacta para paneles embebidos; v1.2 documenta el guard de `options` explícito y el techo local 100; v1.1 añade el encabezado ordenable, por la enmienda de alcance de ADR-065)
**Estado:** **Vigente** — [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) aprobado por el CTO el 2026-07-24
**Fecha:** 2026-07-24 · enmienda v1.2: 2026-08-19 · enmienda v1.3: 2026-08-25
**Autor:** AI-DS-OWNER (consulta) · consolidado por AI-EM-ARCH
**Aprobación:** carril rápido DS (componente + estados; sin alcance, sin contrato de datos, sin boundary, **cero tokens nuevos**)
**Relaciona:** [spec UX](2026-07-24-paginacion-numerada-ux.md), [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2, `component-recipes.md` §2

> **Nota de desempate.** El borrador original de DS-OWNER mantenía el conteo exclusivo en `PortalResultsStrip`, con el pie limitado a `Página 3 de 12`. AI-EM-ARCH resolvió a favor del conteo en el pie (ADR-065 §Decisión 4), por instrucción del CTO y coincidencia con la enmienda E3 de AI-PROD-UX. Este documento refleja el contrato **ya resuelto**: `PortalTablePager` lleva el rango, y el strip lo cede en modo paginado.

> **v1.2 (2026-08-19).** Un `options` explícito valida **pertenencia al array pasado**, no el rango 10–50 del token default. El techo local documentado es 100 (`MAX_LIMIT` del API). `options` sigue `readonly number[]`. No existe `{ value: 'all' }` ni `PORTAL_PAGE_SIZE_ALL`: «Todos» no forma parte del contrato. El token global permanece `[10, 20, 50]` con default 20.

> **v1.3 (2026-08-25).** `density?: 'default' | 'compact'` en `PortalTablePager` y `PortalPageSizeSelect`. El default permanece `h-11` (target iWana 44 px, ADR-065). `compact` densifica a `h-8` (32 px) **solo** en paneles embebidos densos (bitácora, peeks secundarios); cumple WCAG 2.5.8 AA (24 px) y se documenta como excepción de densidad auxiliar, no como rebaja del default. Prohibido usar `compact` en tablas operativas de módulo.

---

## 1. Forma: primitive hermano, no una variante

`PortalTablePagination` **no se modifica**. Nacen dos primitives nuevos. Cuatro razones de contrato — cualquiera basta:

1. **Datos incompatibles.** Uno habla cursor (`hasMore`, `onLoadMore`), el otro offset (`page`, `pageCount`, `onPageChange`). Una prop `variant` obligaría a una unión discriminada con props opcionales en ambas ramas: el compilador dejaría de proteger a los 28 consumidores actuales.
2. **Ciclo de vida opuesto.** `PortalTablePagination` **desaparece** al agotarse el listado (ADR-064 §5, con test que exige `container` vacío). El pager es **estado persistente de navegación**: si desapareciera en la última página, el operador perdería el «Anterior».
3. **Accesibilidad distinta.** Load-more es un `<button>` suelto; el pager es un landmark `<nav aria-label>` con `aria-current="page"` y ventana de elipsis.
4. **Riesgo desproporcionado.** 28 call sites tocados por un cambio que ninguno usa.

**Nombres congelados:** `PortalTablePager`, `PortalPageSizeSelect`, `PORTAL_PAGE_SIZE_OPTIONS`, `PORTAL_DEFAULT_PAGE_SIZE`.

**Invariante de exclusión mutua:** una tabla monta `PortalTablePagination` **o** `PortalTablePager`, nunca ambos. Hallazgo **P1** en review.

## 2. Ubicación

`apps/portal/src/components/shared/portal-ui.tsx` — **no** `@iwana/ui` todavía.

Es composición de shell (fila de pie, ventana de elipsis, landmark) sobre `Button` e `interactiveFocusClassName` de `@iwana/ui`; no introduce un CVA nuevo. ADR-064 §5 ya fija el precedente («`PortalTablePagination` en `portal-ui`, no `@iwana/ui` en Ola 1»).

**Regla de graduación a `@iwana/ui`** (aplica a este y a los futuros): asciende cuando (a) tiene ≥2 consumidores en apps distintas, (b) su API sobrevivió un ciclo de módulo sin cambios, y (c) no depende de class-tokens exclusivos del portal. Cuando `apps/web` adopte números, `PortalTablePager` y `PortalTablePagination` graduan **juntos** como `TablePager` / `TableLoadMore`. Esa graduación mueve frontera de paquete → decisión del orquestador, no carril rápido (no requiere ADR: no cambia stack ni librería).

## 3. API pública

```ts
export interface PortalTablePagerLabels {
  previous: string;                            // default 'Anterior'
  next: string;                                // default 'Siguiente'
  page: (n: number) => string;                 // default (n) => `Página ${n}`
  position: (p: number, c: number) => string;  // default (p, c) => `Página ${p} de ${c}`
  nav: (resource?: string) => string;          // default (r) => r ? `Paginación de ${r}` : 'Paginación'
}

/** Sustantivo del recurso en singular y plural, minúscula. Un solo string no basta:
 *  el caso «1 usuario» es frecuente tras filtrar. */
export interface PortalResourceNoun {
  singular: string;
  plural: string;
}

export interface PortalTablePagerProps {
  /** REQUERIDO. Página actual, 1-based. Controlado: el primitive no guarda estado. */
  page: number;
  /** REQUERIDO. Total de páginas, >= 0. `0` y `1` → no se renderiza la navegación. */
  pageCount: number;
  /** REQUERIDO. El consumidor persiste la página en la URL (ADR-065 §9). */
  onPageChange: (page: number) => void;
  /** REQUERIDO. Índice 1-based de la primera fila visible. */
  from: number;
  /** REQUERIDO. Índice 1-based de la última fila visible. */
  to: number;
  /** REQUERIDO. Total del conjunto filtrado. */
  total: number;
  /** REQUERIDO. Sustantivo del recurso para el conteo y el aria-label del nav. */
  resource: PortalResourceNoun;
  /** `total` aproximado → el conteo antepone «más de». Default false. */
  totalIsEstimate?: boolean | undefined;
  /** Página en vuelo: aria-busy + todos los controles disabled. Default false. */
  loading?: boolean | undefined;
  /** Páginas visibles a cada lado de la actual. Default 1. Rango 0–2. */
  siblingCount?: number | undefined;
  /** Páginas fijas en cada extremo. Default 1. Rango 1–2. */
  boundaryCount?: number | undefined;
  /** Selector de tamaño, renderizado a la izquierda junto al conteo. */
  pageSizeControl?: ReactNode | undefined;
  /** Sobrescritura parcial de copy. Prohibido usarlo para inyectar nodos. */
  labels?: Partial<PortalTablePagerLabels> | undefined;
  className?: string | undefined;
  /**
   * Densidad visual. Default `'default'` (h-11, ADR-065).
   * `'compact'` (h-8) solo paneles embebidos densos — ver §4-bis.
   */
  density?: 'default' | 'compact' | undefined;
}

export const PORTAL_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const PORTAL_DEFAULT_PAGE_SIZE = 20;   // alineado a USERS_PAGE_SIZE

export interface PortalPageSizeSelectProps {
  /** REQUERIDO. Debe pertenecer a `options`. */
  value: number;
  /** REQUERIDO. El consumidor DEBE resetear a page=1 en el mismo commit. */
  onChange: (pageSize: number) => void;
  /** Default PORTAL_PAGE_SIZE_OPTIONS. Un override explícito valida pertenencia al array, no el rango 10–50. Techo local documentado: 100. Sin `'all'`. */
  options?: readonly number[] | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;   // default useId()
  className?: string | undefined;
  /** Misma semántica que `PortalTablePager.density`. Default `'default'`. */
  density?: 'default' | 'compact' | undefined;
}
```

### Reglas de API no negociables

- **Controlado puro.** Sin `defaultPage`: la página vive en la URL, así volver a una tab no la pierde.
- **`labels` solo acepta `string` o funciones que devuelven `string`** — nunca `ReactNode`. Evita que un módulo inyecte un badge o un icono y convierta el pie en toolbar.
- **`PORTAL_DEFAULT_PAGE_SIZE` es un token, no un literal.** Prohibido `const PAGE_SIZE = 20` local en pantallas nuevas. Debe permanecer alineado con `USERS_PAGE_SIZE` (`apps/portal/src/components/users/users-query.ts`); moverlos por separado es hallazgo.
- **El selector se inyecta por `pageSizeControl`**, no se acopla dentro del pager: permite colocarlo fuera del pie bajo `sm` (spec UX §5) sin prop drilling inverso.
- **`from`/`to`/`total` se derivan en el consumidor** a partir de `meta` — el servidor no los envía, para que servidor y cliente no puedan discrepar.
- **`density="compact"` no se usa en tablas operativas de módulo** (listados Assurance, Commercial, Users, Inventory, etc.). Solo paneles embebidos densos (bitácora de expediente, peeks secundarios). Hallazgo P2 si aparece en un pie de DataTable.

## 4. Receta de clases

Todos los tokens existen en `packages/ui/src/styles/globals.css`. **Cero `dark:bg-gray-{700..950}`** (ADR-056 §2). Cero hex.

**Contenedor del pie** — dentro de `portalDataTableShellClassName`, hermano de `<table>`, **fuera** del contenedor con `overflow-x`:

```
flex flex-col gap-3 border-t border-gray-100 px-5 py-4
dark:border-dark-border
sm:flex-row sm:items-center sm:justify-between
```

Misma frontera superior que `PortalTablePagination`: los dos pies se leen idénticos de cintura para arriba.

**Conteo** (izquierda, junto al selector):

```
text-xs tabular-nums text-gray-500 dark:text-gray-400
```

`gray-500` sobre blanco ≈ 4.8:1 (AA); `gray-400` sobre `dark-surface-2` ≈ 6.3:1.

**Navegación:** `<nav aria-label="Paginación de usuarios">` → `flex items-center gap-1`.

**Anterior / Siguiente:** `<Button variant="secondary" size="sm" className="min-h-11 gap-1 px-3">` + `ChevronLeft`/`ChevronRight` (`aria-hidden`). Reutiliza el CVA aprobado — mismo peso visual que el CTA «Cargar más», lo que hace que los dos modos de pie se sientan del mismo sistema.

**Botón de página — base:**

```
inline-flex h-11 min-w-11 items-center justify-center rounded-xl px-3
text-sm font-semibold tabular-nums transition-colors
+ interactiveFocusClassName
+ disabled:pointer-events-none disabled:opacity-50
```

**Inactivo — sin borde (desviación deliberada del demo):**

```
text-gray-700 hover:bg-iwana-surface-soft hover:text-iwana-primary
active:bg-iwana-primary-100
dark:text-gray-200 dark:hover:bg-dark-surface-4 dark:hover:text-white
```

Justificación técnica, no estética: un cuadrado con borde `gray-200` sobre blanco da ~1.3:1 y **falla WCAG 1.4.11** como único identificador del control. Las salidas eran subir el borde a `iwana-neutral-600` (3.45:1, cumple pero pesa como una rejilla) o quitarlo y regirse por contraste de texto, como los ghost ya aprobados. Se elige lo segundo: `gray-700` sobre blanco ≈ 10.3:1. Efecto lateral buscado: deja de parecer TailAdmin.

**Activo:**

```
bg-iwana-primary text-white shadow-sm
dark:bg-iwana-primary-400 dark:text-white
dark:ring-1 dark:ring-inset dark:ring-iwana-primary-300
```

Con `aria-current="page"`, **sin `disabled`** (mantiene foco y anuncio en tecnología asistiva), `cursor-default` y sin cambio en hover.

Contrastes sobre tokens reales: blanco sobre `iwana-primary` = **17.3:1** (AAA); blanco sobre `iwana-primary-400` = **6.1:1** (AA). El fill `-400` contra `dark-surface-2` da solo 2.6:1, por eso el `ring-iwana-primary-300` (5.1:1 sobre `#222`) aporta la frontera ≥3:1 de 1.4.11. **Sin ese ring, el estado activo en dark no es conforme — no es opcional.**

Se alinea con `portalTabActiveClassName`: activo = azul noche relleno.

**Elipsis:** `<span aria-hidden="true">` → `inline-flex h-11 min-w-11 items-center justify-center text-sm text-gray-500 dark:text-gray-400`. Nunca clicable, nunca focusable, nunca con `title`.

**Selector de tamaño:**

```
wrapper: flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400
control: <Select> de @iwana/ui con className="h-11 w-auto min-w-[5.5rem]"
label:   <label htmlFor> visible «Filas por página»
```

Se usa `Select` de `@iwana/ui` (ya trae `h-11`, `rounded-xl`, `shadow-iwana-soft`, `text-iwana-primary` y menú en portal). **Prohibido** un `<select>` crudo estilado a mano: sería un cuarto camino de campo en el portal.

### El lima queda fuera del pager por completo

Ni relleno, ni borde, ni subrayado del número activo. No es contraste (`iwana-secondary-700` + blanco = 4.76:1, pasa AA) sino **rol**: Firma §3 asigna al lima avance/éxito/completitud, y «la página en la que estás» es **posición**. Un `4` en lima leería como «página completada», que es falso. Además, un relleno lima sólido de tamaño botón en un listado operativo es el «botón filled de CTA» que la enmienda CTO de 2026-07-23 sacó del portal operativo.

## 5. Matriz de estados

| Estado | Contrato |
| --- | --- |
| **default** | Números ghost; activo relleno azul noche con `aria-current="page"` |
| **hover** | Inactivo → `bg-iwana-surface-soft` + `text-iwana-primary` (dark: `dark-surface-4`). Activo → sin cambio, `cursor-default`. Prev/Next → hover del CVA `secondary` |
| **focus-visible** | `interactiveFocusClassName`. Obligatorio **también** sobre el botón activo |
| **active (pressed)** | `active:bg-iwana-primary-100` en inactivos; Prev/Next heredan del CVA |
| **disabled** | Prev en `page===1`, Next en `page===pageCount`: atributo `disabled` real + `opacity-50` + `pointer-events-none`. **Nunca ocultar** — el hueco desplaza los números y produce mis-clicks |
| **loading de página** | `aria-busy="true"` en el `<nav>` + controles `disabled`. Sin spinner en el pager. **El contenido no se atenúa: la señal son los controles deshabilitados, `aria-busy`, el anuncio `aria-live` y —si el contenido debe ceder— su sustitución por `SkeletonBlock`** — ver [contrato de estados atenuados](2026-07-26-estados-atenuados-contraste-ds-contrato.md) §4.2. El pager **no se desmonta** (evita CLS). `data-loading` expuesto para E2E **(fila enmendada el 2026-07-26: se retira la cláusula «la señal es el contenido atenuado», origen del defecto A-1/A-3 del gate ADR-065)** |
| **página única** | `pageCount <= 1` → sin navegación; el conteo permanece. El selector se oculta si `total <= min(options)` |
| **cero resultados** | Sin nodo de pie. El vacío lo resuelve `PortalEmptyState` dentro del `<tbody>` |
| **error de carga** | El pager permanece montado y **habilitado** (permite reintentar navegando); el error va en `PortalAlert` sobre la tabla, nunca en el pie |
| **readonly** | No aplica: el pager no captura datos |
| **dark** | Recetas de §4. Frontera de control en dark = `ring-iwana-primary-300` o `iwana-neutral-600`, nunca `dark-border` |
| **targets** | Página `h-11 min-w-11` (44×44); Prev/Next `min-h-11`. Los 40 px del demo quedan descartados. Excepción: `density="compact"` → `h-8` (32 px); ver §4-bis |
| **responsive** | Bajo `sm`: números `hidden sm:inline-flex`; quedan `Anterior` · `Página 3 de 12` · `Siguiente`. La etiqueta de posición pasa a ser información *load-bearing*, no decorativa |
| **teclado** | Tab natural izquierda→derecha, sin roving tabindex (≤9 controles). Enter/Espacio nativos. Sin atajos globales |
| **a11y** | `<nav aria-label="Paginación de {recurso}">`; cada número con `aria-label="Página 3"`; activo con `aria-current="page"`; elipsis `aria-hidden`; una región `aria-live="polite"` anuncia el cambio una sola vez |

## 4-bis. Densidad `compact` (v1.3)

Segunda densidad del **mismo** primitive. No es un fork visual ni un override local por pantalla.

| Pieza | `default` (tablas) | `compact` (embebido) |
| --- | --- | --- |
| Prev/Next | `Button secondary sm` + `min-h-11 gap-1 px-3` | `Button secondary sm` **sin** `min-h-11` → `h-8`, `px-2.5 text-xs` |
| Nº página | `h-11 min-w-11 rounded-xl text-sm` | `h-8 min-w-8 rounded-lg text-xs` |
| Elipsis | `h-11 min-w-11 text-sm` | `h-8 min-w-8 text-xs` |
| Page size Select | `h-11 … rounded-xl` | `h-8 … rounded-lg px-2.5 text-xs` |
| Shell pie | `gap-3 px-5 py-4 border-t` | mismas clases base; el consumidor puede anular shell con `className` (`border-0 px-0 py-2`) |

**Adopción permitida:** bitácora de expediente, peeks / paneles auxiliares densos alineados a `PortalFilterChip`.

**Adopción prohibida:** pies de DataTable de módulo, listados operativos con shell de tabla.

**A11y:** 32 px ≥ WCAG 2.5.8 AA (24 px). Queda por debajo del mínimo iWana 44 px documentado en §5 `targets`; esa rebaja **no** se aplica al default.

## 5-bis. `PortalDataTableSortableHead` — orden por columna

Extensión de `PortalDataTableHead` (`portal-ui.tsx:49-65`), que **ya emite `scope="col"` por construcción** (SPEC-PORTAL-SIDEPEEK-A11Y §3). No se reemplaza: se compone sobre él, para que una tabla mezcle columnas ordenables y no ordenables sin dos caminos de `<th>`.

`aria-sort` **no aparece hoy ni una vez en el repo**: se resuelve aquí, una sola vez, y no se replica en catorce pantallas.

### API

```ts
export type PortalSortDirection = 'asc' | 'desc';

export interface PortalDataTableSortableHeadProps
  extends Omit<PortalDataTableHeadProps, 'onClick'> {
  /** REQUERIDO. Campo lógico de esta columna; debe estar en meta.capabilities.sortableFields. */
  field: string;
  /** REQUERIDO. Rótulo visible; alimenta también el nombre accesible del botón. */
  children: ReactNode;
  /** Orden vigente de la tabla; null = orden por defecto del recurso. */
  activeSort: { by: string; dir: PortalSortDirection } | null;
  /** REQUERIDO. `null` = tercer paso del ciclo: volver al orden por defecto. */
  onSortChange: (next: { by: string; dir: PortalSortDirection } | null) => void;
  /** Orden en vuelo: control disabled + aria-busy en la tabla. Default false. */
  loading?: boolean | undefined;
  /** Alineación del contenido; en columnas numéricas el control va a la derecha. */
  align?: 'left' | 'right' | undefined;
}
```

**Reglas de API:**

- **Controlado puro.** El primitive no guarda el orden: vive en la URL vía `useTableQueryState`.
- **El ciclo lo calcula el primitive**, no el consumidor: `sin orden → asc → desc → sin orden`. Una pantalla que implemente su propio ciclo es hallazgo.
- **Sin prop de lista blanca.** El consumidor decide si monta `PortalDataTableHead` o la variante ordenable leyendo `sortableFields`; el primitive no valida el contrato del servidor.
- `field` es un **nombre lógico**, nunca una columna de base de datos.

### Receta de clases

Hereda `portalDataTableHeadClassName` (`px-4 py-3 text-left portal-eyebrow-muted`). El `<th>` no cambia de aspecto; lo que se añade es el control:

```
botón:    group inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1
          text-left transition-colors
          + interactiveFocusClassName
          + disabled:pointer-events-none disabled:opacity-50
inactivo: text-gray-500 hover:text-iwana-primary
          dark:text-gray-400 dark:hover:text-white
activo:   text-iwana-primary font-semibold
          dark:text-white
icono:    h-3.5 w-3.5 shrink-0
          inactivo → text-gray-300 group-hover:text-iwana-primary dark:text-dark-border-2
          activo   → text-iwana-primary dark:text-white
```

**Decisiones tomadas y por qué:**

- **Sin el par de carets apilados del demo.** TailAdmin pinta dos triángulos de 8×5 px permanentes en cada columna: a ese tamaño no hay estado distinguible y el encabezado se convierte en una rejilla de ruido. Se usa **un solo ícono** (`ChevronUp` / `ChevronDown` de lucide) que aparece atenuado en reposo y se resuelve al ordenar.
- **`min-h-11` en el botón**, no en el `<th>`: mantiene el target de 44 px sin engordar la fila de encabezado de todas las tablas.
- **El estado activo no depende del ícono solo** (`color-not-only`, WCAG 1.4.1): el rótulo pasa a `font-semibold` y a `text-iwana-primary`. Un lector que no distinga el ícono sigue viendo qué columna manda.
- **El lima no entra**, igual que en el pager: el orden es posición, no avance.
- Columnas numéricas alinean el control a la derecha, coherente con `tabular-nums` en las celdas.

### Estados

| Estado | Contrato |
| --- | --- |
| **no ordenable** | `PortalDataTableHead` normal, **sin botón y sin `aria-sort`**. No se pinta un control deshabilitado: sugiere una capacidad que no existe |
| **sin orden** | `aria-sort="none"`, ícono atenuado, rótulo en peso normal. Nombre accesible: `Ordenar por {rótulo}, ascendente` |
| **ascendente** | `aria-sort="ascending"`, `ChevronUp` en `iwana-primary`, rótulo `font-semibold`. Nombre accesible: `Ordenar por {rótulo}, descendente` |
| **descendente** | `aria-sort="descending"`, `ChevronDown`. Nombre accesible: `Quitar orden por {rótulo}` |
| **hover** | Solo el ícono y el color del rótulo cambian; **la caja del `<th>` no se mueve** (nada de bordes o fondos que desplacen el texto) |
| **focus-visible** | `interactiveFocusClassName` sobre el botón, no sobre el `<th>` |
| **loading** | Botón `disabled`; `aria-busy` lo lleva la tabla, no cada encabezado. El control **no se desmonta** |
| **tras pulsar** | El foco **permanece en el encabezado pulsado** — permite recorrer el ciclo sin volver a tabular |
| **mobile (`< sm`)** | El botón **no se renderiza**. El orden se expone en la barra de filtros (spec UX §5). El `<th>` vuelve a ser `PortalDataTableHead` puro |
| **dark** | Recetas de arriba. `dark-border-2` para el ícono en reposo; prohibido `dark:bg-gray-{700..950}` |

### Variante mobile — reutilización, no componente nuevo

Bajo `sm` el orden usa el `Select` de `@iwana/ui` en la barra de filtros, con las opciones derivadas de `sortableFields` más `Orden por defecto`. **Es el patrón que ya existe** en `AdditionalProductsPanel.tsx:619`: deja de ser el camino particular de Comercial y pasa a ser la variante mobile del contrato único. No se crea un primitive nuevo para esto.

## 6. Anatomía canónica del DataTable

Sustituye el árbol de `component-recipes.md` §2:

```text
PageHeader?                                    (ruta + CTA principal de página)
└── PortalPanel                                (header: eyebrow / título / acciones de DOMINIO)
      ├── filtros / chips                       (SIEMPRE fuera del shell)
      ├── PortalResultsStrip                    modo cursor → conteo
      │                                         modo paginado → cede el conteo; filtros/acciones
      ├── control de orden                       (solo bajo `sm` — Select en la barra de filtros)
      └── portalDataTableShellClassName
            ├── <table>
            │     ├── <thead>
            │     │     ├── PortalDataTableHead            columna no ordenable (sin aria-sort)
            │     │     └── PortalDataTableSortableHead    solo si el campo está en sortableFields
            │     └── <tbody> …                   (celdas con sus class-tokens)
            └── pie — EXACTAMENTE UNO, nunca los dos:
                  ├── PortalTablePagination      randomAccess:false · cursor
                  │     └── «Cargar más»          (nodo omitido si !hasMore)
                  └── PortalTablePager           DEFAULT · offset
                        ├── izquierda: «Mostrando 21–40 de 128 usuarios»
                        │              + PortalPageSizeSelect («Filas por página»)
                        └── derecha:  nav Anterior · 1 … 3 … 12 · Siguiente
                                       (nav omitida si pageCount <= 1)
```

## 7. Impacto en el contrato existente

**`PortalTablePagination`: cero breaking, cero deprecación.** No gana `variant`, no pierde props; sus 28 consumidores y su spec (`portal-ui.spec.tsx:220-257`) siguen verdes.

**`PortalResultsStrip`: cambio aditivo.** Gana `controls?: ReactNode` (izquierda, con `justify-between`; sin `controls` conserva `justify-end`). Cero call sites rotos: los ~55 actuales pasan solo `badge`. En modo paginado el strip **no** pinta conteo.

**Deuda de nomenclatura registrada:** `PortalTablePagination` sería más claro como `PortalTableLoadMore`. Es churn sin valor hoy; se resuelve en la graduación a `@iwana/ui`.

## 8. Anti-duplicación

**Duplicación en el portal (resuelta en v1.3).** La bitácora de Seguimiento (`ExpedienteTimelinePanel`) adoptó `PortalTablePager` + `PortalPageSizeSelect` con `density="compact"`. Queda prohibido reintroducir forks locales de botones numerados o círculos «Ver» en CRM.

Los 28 consumidores de `PortalTablePagination` sí están limpios. El resto de la duplicación está en `apps/web`, que **no consume `portal-ui.tsx`**:

| Archivo | Problema |
| --- | --- |
| `apps/web/src/components/audit/AuditLogsTable.tsx:380-410` | Pie a mano con receta propia y línea `{n} registro(s) · Página {p}` — **duplica el pager y duplica el conteo en el pie** |
| `apps/web/src/components/users/UsersTable.tsx:340-378` | Tercer camino: `Mostrando {n} de {total} usuarios internos` + Anterior/Siguiente con `Button variant="outline"` `rounded-xl`, mientras el portal usa `secondary` pill — dos pesos visuales para el mismo control |
| `apps/web/src/components/shared/` | No contiene ningún primitive de tabla (solo `ConfirmDialog`, `PlatformTenantPicker`) — la duplicación es **estructural**, no un descuido |

**Órdenes de consolidación:**

- Ninguna pantalla define literales `Anterior` / `Siguiente` ni botones numerados fuera de `portal-ui.tsx` → **hallazgo P2 automático** en review.
- El selector de tamaño usa `Select` de `@iwana/ui`; un `<select>` crudo estilado a mano es P2.
- Al graduar a `@iwana/ui`, los dos pies de `apps/web` se sustituyen en el mismo PR.
