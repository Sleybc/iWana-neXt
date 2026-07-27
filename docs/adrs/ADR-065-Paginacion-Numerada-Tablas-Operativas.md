# ADR-065 — Paginación numerada y orden por columna en tablas operativas (portal y web)

**Versión:** 1.2
**Estado:** **Aprobado**
**Fecha:** 2026-07-24 · v1.1 el mismo día (añade el orden por encabezado de columna, que la v1.0 omitía) · **v1.2 el 2026-07-25** (aprobada por el CTO: fija el régimen de adopción del orden por columna tras el gate de cierre)
**Modo activo:** Architect + Orchestrator
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO (2026-07-24) — aprobado en v1.1, cubriendo paginación numerada y orden por columna en una sola decisión
**Skills:** `architecture-decision-records`, `docs-architect`, `iwana-identity-ui-review`, `ui-ux-pro-max`
**Protocolo multiagente:** consulta paralela AI-PROD-UX · AI-DS-OWNER · AI-FE-PLATFORM · AI-SR-FULL (sesión 2026-07-24). Los cuatro veredictos: **GO-CON-ENMIENDAS**
**Supersede:** [ADR-064](ADR-064-Paginacion-Tablas-Operativas-Portal.md) §§2, 3, 5, 9 — el resto de ADR-064 sigue vigente
**Relaciona:** [ADR-023](ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) (qué se toma de TailAdmin), [ADR-056](ADR-056-Integridad-Base-Normativa-Diseno.md) (base normativa de diseño), [ADR-061](ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) (frontera de audiencias), Firma iWana §2.3
**Vigencia:** norma **efectiva desde 2026-07-24**. Merge gate: tabla operativa nueva o remediada que no cumpla la anatomía de este ADR = rechazo

---

## Contexto

El CTO instruye (2026-07-24) portar al producto el sistema de paginación de la referencia TailAdmin (`nextjs-demo.tailadmin.com/data-tables`): **selector de tamaño de página**, **conteo de rango en el pie** («Mostrando X a Y de Z») y **navegación numerada** (Anterior / 1…N / Siguiente).

**Enmienda v1.1 (mismo día).** El CTO señala que la v1.0 omitió el **orden por encabezado de columna** — los controles de orden que el demo pone en cada columna. La observación es correcta y la omisión era sustantiva: sin orden por columna la paginación numerada queda a medias, porque el operador puede llegar a la página 7 pero no puede decidir qué contiene esa página 7. AI-FE-PLATFORM ya lo había marcado como frontera («no hay orden por clic en encabezado en ninguna tabla; añadirlo es alcance nuevo, no porte»); esta versión lo convierte en alcance declarado. Se enmienda en lugar de emitir un ADR-066 porque este documento **aún no ha entrado en vigor**: superar un ADR que nunca se aprobó dejaría dos artefactos vigentes sobre la misma superficie, cuando paginación y orden son la misma decisión de producto.

Esa instrucción **contradice cuatro cláusulas de [ADR-064](ADR-064-Paginacion-Tablas-Operativas-Portal.md)**, aprobado por el CTO ese mismo día:

| Cláusula ADR-064 | Qué prohíbe | Qué pide la instrucción |
| --- | --- | --- |
| §2 | Default UX = «Cargar más» | Default UX = páginas numeradas |
| §3 | Conteo visible exclusivo de `PortalResultsStrip`; prohibido duplicarlo en el pie | Conteo de rango en el pie |
| §5 | El footer contiene **únicamente** la acción «Cargar más» | El footer contiene conteo + selector + navegación |
| §9 | Páginas numeradas = contrato distinto, **solo con requisito PRD explícito** | Páginas numeradas como norma general |

ADR-064 evaluó las páginas numeradas como **Opción B** y las descartó. La instrucción del CTO constituye el «requisito PRD explícito» que su propia §9 contempla, pero elevado de excepción a norma. **Un cambio de esa magnitud no se resuelve con una instrucción de implementación: exige ADR que supere al anterior.** Este documento es ese ADR.

### Lo que la consulta multiagente cambió respecto de la premisa inicial

La decisión resultó **más barata de lo que aparentaba** en dos frentes y **más cara** en uno:

1. **16 de 35 endpoints de listado ya sirven `page`/`offset`.** El salto a la página N ya existe en el backend para casi la mitad del inventario (AI-SR-FULL §1, grupo B). Para esas superficies el trabajo es de interfaz, no de contrato.
2. **El `COUNT(*)` exacto ya se paga en cada request** en los 18 endpoints keyset — `inventory-item.service.ts:564` y once sitios equivalentes. Añadir `page` **no introduce coste de conteo nuevo**. Este hecho invalida el argumento de coste que ADR-064 usó implícitamente contra la Opción B.
3. En cambio, la paginación numerada **vuelve visibles al usuario cuatro defectos preexistentes** que el «Cargar más» disimula (sección siguiente). Ese es el verdadero costo de la decisión.

### Restricción heredada de ADR-023

Se copia **el patrón de interacción, nunca el código ni la paleta**. Quedan expresamente fuera: markup y Alpine.js como código productivo, la paleta literal de TailAdmin (`#465FFF`, fuente Outfit), la guerra de z-index, y los tres detalles del demo que esta decisión rechaza por norma propia (§Decisión, punto 7).

---

## Defectos preexistentes que esta decisión obliga a cerrar

Los cuatro tienen archivo y línea, y **ninguno es opinable**. Con «Cargar más» se disimulan; con números de página el operador los ve.

### DEF-1 · Órdenes sin desempate único — decide la viabilidad

Siete listados ordenan por un campo no único sin desempatar por `id`: `subscribers` (`subscribers.service.ts:295`), `support_tickets` (`tickets.service.ts:274`), `visit_requests` (`visit-requests.service.ts:174-176`), `inventory_write_offs` (`write-off.service.ts:259`), `supplier_profiles` (`supplier-profile.service.ts:188`), `asset_loan_assignments` (`asset-loan.service.ts:138`) y `parties` — este último **sin `orderBy` alguno** (`party.service.ts:77-103`).

Con offset, dos filas con la misma clave de orden pueden **aparecer en dos páginas o en ninguna**. Es corrupción silenciosa del barrido, no un defecto cosmético.

**Agravado por la enmienda v1.1.** Con orden fijo el defecto era latente: solo se manifestaba en las columnas que el código ya usaba para ordenar. Con orden por encabezado el operador **puede provocarlo a voluntad** ordenando por una columna con muchos empates —estado, categoría, tipo, prioridad—, donde decenas de filas comparten clave. El desempate por `id` deja de ser una buena práctica y pasa a ser la condición que hace publicable cada columna ordenable.

### DEF-2 · `page` sin techo — explotable hoy, sin esta migración

Ninguno de los 16 endpoints offset acota `page`. Un `GET /inventory/movements?page=99999999` calcula un `OFFSET` de ~2·10⁹ y fuerza a PostgreSQL a materializar y descartar el conjunto entero. Con `ThrottlerModule` a 100 req/min y ~8 conexiones útiles vía pgBouncer, unas 20 peticiones saturan el pool.

**Severidad media-alta. Debe cerrarse aunque este ADR se rechace.**

### DEF-3 · Keyset roto en auditoría — correctitud sobre el registro de cumplimiento

`audit-query.service.ts:124` y `platform-audit.service.ts:150` filtran el cursor con `id < cursor` sobre un **UUID v4 aleatorio** (`audit-log.entity.ts:23`, `@PrimaryGeneratedColumn('uuid')`), mientras ordenan por `created_at DESC, id DESC`. El predicado no guarda relación con el orden: **la paginación salta registros y repite otros de forma no determinista**, precisamente en el log que sirve de prueba de cumplimiento.

### DEF-4 · Filtros de cliente sobre el buffer acumulado — bloqueante de UI

Seis tablas filtran sobre lo ya cargado y por eso **desactivan el pie cuando hay filtro activo**: `PurchaseWorkspace.tsx:230`, `StockIssuesWorkspace.tsx:112`, `StockLocationsMatrix.tsx:293`, `StockCountsWorkspace.tsx:117`, `StockByProductTable.tsx:220`, `SuppliersPanel.tsx:155`.

Si se reemplaza la página sin subir esos filtros al servidor, la página 3 filtrada saldrá casi siempre vacía mientras el pie afirma «Mostrando 41–60 de 340». **Es una mentira visible al usuario y no tiene parche de interfaz.**

### Deuda adicional detectada en el mismo barrido

`tickets.service.ts:266-326` materializa la tabla completa de tickets en memoria para derivar SLA en JavaScript; `expediente.service.ts:666-669` pagina con `slice` sobre un array con PII ya descifrada; **9 endpoints siguen sin cota alguna** (violación viva de ADR-064 §8); `users.service.ts:319` ordena por UUID aleatorio; y conviven **6 formas de envelope** distintas con `@iwana/shared` sin contrato de listado usado por nadie.

### Línea base del orden (enmienda v1.1)

Verificado en el repo, y explica por qué el orden por columna es alcance nuevo y no un ajuste de interfaz:

| Hecho | Evidencia |
| --- | --- |
| **Un solo endpoint de 35 acepta `sort`** | `commercial/dto/catalog-query.dto.ts:93-101`. Los otros 34 tienen `ORDER BY` fijo en código |
| El modelo de orden vigente es **preset con nombre de negocio**, no columna + dirección | `CATALOG_SORT_VALUES = ['CATEGORY_NAME', 'ACTIVE_NAME', 'RECENTLY_UPDATED']` (`:15-19`) |
| Se expone con un `<Select>`, nunca con clic en encabezado | `AdditionalProductsPanel.tsx:619-620`; tipo en `catalog-filter-params.ts:5` |
| **`aria-sort` no aparece ni una vez en todo el repo** | también ausentes `onSort`, `sortable`, `toggleSort`, `sortDirection` |
| Existe el punto de extensión correcto | `PortalDataTableHead` (`portal-ui.tsx:49-65`) ya emite `scope="col"` por construcción (SPEC-PORTAL-SIDEPEEK-A11Y §3) |
| Los cursores keyset son **uno por ordenación** | `commercial-pagination.ts`: `NameIdCursor`, `DateIdCursor`, `ActiveNameIdCursor`, `CategoryRankNameIdCursor` |

Dos consecuencias ordenan el diseño:

1. **El contrato de orden actual no sirve para clic en encabezado.** Un preset con nombre de negocio (`RECENTLY_UPDATED`) no se mapea a «clic en la columna Actualizado, dirección descendente» sin una explosión combinatoria de valores de enum.
2. **Cada orden ofrecido cuesta un índice.** Con `OFFSET`, un `ORDER BY` sin índice de soporte degrada a seq scan más ordenación completa del conjunto filtrado en cada request. El demo ordena por todas sus columnas porque tiene diez filas en memoria; aquí se paga un índice por orden, multiplicado por tenant.

### Duplicación adicional detectada (enmienda v1.1)

`apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx:246-281` **ya implementa un paginador numerado completo** —ventana de cinco botones, selector de tamaño con opción «todos», reset por filtro y corrección de página fuera de rango— en cliente, sobre un array en memoria. No estaba en el inventario de AI-DS-OWNER ni de AI-FE-PLATFORM porque ambos buscaron consumidores de `PortalTablePagination`, y este no lo es. Entra en la consolidación de la Ola 5. Su opción «todos» requiere decisión aparte: `PORTAL_PAGE_SIZE_OPTIONS` no la contempla y materializar el universo contradice ADR-064 §8, que sigue vigente.

---

## Opciones

| # | Opción | Resumen | Veredicto |
| --- | --- | --- | --- |
| A | Mantener ADR-064 sin cambios | Se rechaza la instrucción del CTO | Descartada — la instrucción es del CTO y la §9 del propio ADR-064 la contempla |
| B | Migrar todo a `page`/`offset`, retirando el cursor | Un solo modo, simple de razonar | Descartada — destruye las 4 olas cerradas hoy y deja sin salida a `audit_logs` y `stock_movements`, los dos recursos ISP que superan el millón de filas por tenant |
| C | Mantener keyset y que el frontend simule páginas | Sin cambio de contrato | **Técnicamente imposible.** Un cursor keyset codifica la posición del último registro leído, no un ordinal: pintar «página 7» exigiría 6 peticiones secuenciales encadenadas, «ir a la última» sería imposible, y un deep-link `?page=7` costaría 7 round-trips antes del primer pixel |
| D | **Contrato híbrido con envelope único y modo discriminado** | `page` aditivo sobre el keyset existente; el servidor declara el modo y la capacidad de salto arbitrario | **Recomendada** |

---

## Decisión

**Opción D.** La paginación numerada es el **default de las tablas operativas** de `apps/portal` y `apps/web`, con el modo de acceso **declarado por el servidor en el contrato**, no decidido en el código de cada pantalla.

### Norma

**1 · Default.** Toda tabla operativa —listado de dominio con datos remotos bajo `PortalPanel` + `portalDataTableShellClassName`— pagina en servidor con **navegación numerada**: `Anterior · 1 … N · Siguiente` + selector de tamaño de página. Tamaño por defecto **20**, opciones `[10, 20, 50]`.

*(Supersede ADR-064 §2.)*

**2 · Degradación declarada por el servidor.** El envelope expone `meta.capabilities.randomAccess`. Los recursos append-only de alto volumen —`audit_logs`, `stock_movements` y los que el análisis de rendimiento añada— lo declaran `false`, y su tabla **cae automáticamente a «Cargar más»** con el primitive de ADR-064.

Esto no es una lista de excepciones negociada módulo a módulo, que se desactualiza: es un dato que viaja con la respuesta y al que el primitive reacciona. La degradación queda **explícita y auditable**.

**3 · Criterio de adopción medible.** Un recurso declara `randomAccess: false` cuando (a) no puede exponer `total` fiable, o (b) el p95 de una página profunda supera **1,5 s** medido por AI-SR-FULL. No se asume: se mide.

**4 · Conteo — un solo lugar por tabla.** En modo paginado el conteo vive **en el pie**, con la gramática `Mostrando {desde}-{hasta} de {total} {recurso}`. `PortalResultsStrip` **cede el conteo** en esas tablas. En modo «Cargar más» el strip lo conserva exactamente como norma ADR-064 §3.

Se preserva el principio de ADR-064 —**un solo conteo visible por tabla**— enmendando su ubicación.

*(Supersede ADR-064 §3.)*

**5 · Footer.** En modo paginado el pie contiene conteo + selector de tamaño + navegación. Sigue **prohibido** todo ornamento: «Fin de resultados», filas de relleno, badges decorativos. Si `totalPages <= 1`, el nodo de navegación **no se renderiza**; si no hay resultados, no hay pie.

*(Supersede ADR-064 §5.)*

**6 · Primitive hermano, no una variante.** Nacen `PortalTablePager` y `PortalPageSizeSelect`. `PortalTablePagination` **no se modifica** y conserva sus 28 consumidores. Razones de contrato, no de estilo:

- Datos incompatibles: uno habla cursor (`hasMore`, `onLoadMore`), el otro offset (`page`, `pageCount`, `onPageChange`).
- Ciclo de vida opuesto: el load-more **desaparece** al agotarse el listado; el pager es estado persistente de navegación.
- Accesibilidad distinta: `<nav aria-label>` con `aria-current="page"` frente a un botón suelto.

**Invariante:** una tabla monta `PortalTablePagination` **o** `PortalTablePager`, nunca ambos. Hallazgo P1 en review.

*(Confirma y concreta ADR-064 §9.)*

**7 · Lo que NO se toma del demo TailAdmin.** Tres rechazos por norma propia:

- **Números con borde.** Un cuadro con borde `gray-200` sobre blanco da ~1.3:1 y **falla WCAG 1.4.11** como único identificador del control. Los números son *ghost*: sin borde, `gray-700` sobre blanco (10.3:1).
- **Targets de 40 px.** El mínimo iWana es 44×44 (`h-11 min-w-11`).
- **Opciones 5/8/10.** Se usan `[10, 20, 50]`, dentro del rango de ADR-064 §2.

**8 · El lima queda fuera del pager por completo** — ni relleno, ni borde, ni subrayado del número activo. No es un problema de contraste (`iwana-secondary-700` sobre blanco da 4.76:1 y pasa AA), sino de rol: Firma §3 asigna al lima **avance, éxito y acción**, y «la página en la que estás» es **posición, no progreso**. Un `4` en lima leería como «página completada». Página activa = `bg-iwana-primary text-white`, familia de `portalTabActiveClassName`.

**9 · Estado en URL — condición de entrada para ambas variantes.** `page`, `pageSize`, `sort`, filtros y búsqueda viven en la URL. Cambiar de página empuja entrada de historial (`push`); cambiar filtro, búsqueda u orden **reemplaza** (`replace`) y vuelve a página 1.

Hoy **cero superficies** guardan la página en la URL, y en `apps/web` la posición vive en memoria: recargar o pulsar Atrás devuelve a la página 1 en silencio. Sin esta cláusula la migración no paga su coste.

**10 · Contrato de API único para todo el Modulith.** En `@iwana/shared`, con `page` y `cursor` **mutuamente excluyentes** (400 si llegan ambos):

```ts
export interface ListMeta {
  nextCursor: string | null;   // se conserva en los 35 endpoints
  total: number;
  totalIsEstimate: boolean;    // true en recursos de alto volumen
  page: number | null;         // null en modo cursor
  limit: number;
  totalPages: number | null;
  hasMore: boolean;
  mode: 'page' | 'cursor';
  capabilities: {
    randomAccess: boolean;
    /** Campos lógicos ordenables por el cliente. Vacío = tabla sin orden por columna. */
    sortableFields: string[];
  };
  /** Orden efectivamente aplicado; null = orden por defecto del recurso. */
  sort: { by: string; dir: 'asc' | 'desc' } | null;
}
export interface ListResponse<T> { data: T[]; meta: ListMeta; }
```

Es **superconjunto exacto** de lo que ya devuelven commercial e inventory (`{nextCursor, total}`) y del único envelope numerado existente (`visit-requests.service.ts:185-190`, que ya emite `totalPages`). «Mostrando X a Y de Z» **se deriva en el frontend** — no se añade campo, para que servidor y cliente no puedan discrepar.

Query params uniformes: `limit` (default 20, tope 100), `page` (≥1), `cursor` (opaco base64url), `sortBy` + `sortDir` (§Decisión 17). **`offset` crudo no se expone.**

**17 · Contrato de orden: `sortBy` + `sortDir` con lista blanca por recurso.** Sustituye al preset enum. `sortBy` es un **nombre lógico de campo**, nunca un nombre de columna de base de datos, y se valida contra la lista blanca del recurso; `sortDir` es `asc` | `desc`. La lista blanca no es opcional: aceptar un identificador arbitrario sería inyección de identificador y coste de plan impredecible. Valor fuera de la lista → 400.

Los tres presets de `CATALOG_SORT_VALUES` se conservan durante el dual-emit y se deprecan en el mismo sprint que los campos planos del envelope.

**18 · La lista blanca la declara el servidor y la acota el índice.** `meta.capabilities.sortableFields` dice qué se puede ordenar; la interfaz **no adivina** ni lo codifica por módulo: pinta el control solo donde el contrato lo autoriza.

**Contrato de nombres (fijado 2026-07-24, gate Ola 1):** `sortableFields` publica **nombres lógicos** (`createdAt`, `displayName`, …), nunca rutas SQL ni identificadores con prefijo de alias. `applySort` resuelve el prefijo con `qb.alias` al emitir el `ORDER BY` (`${qb.alias}.${campo}` o el mapeo explícito del recurso si el campo no es columna directa del root). El nombre lógico es lo que viaja en `meta.sort.by`, en la URL y en OpenAPI. Con `innerJoin` (p. ej. parties) un `ORDER BY` sin prefijo es ambiguo; el helper no debe emitir el nombre crudo. `buildPageMeta` se alimenta del **retorno** de `applySort` (orden efectivamente aplicado), no de la entrada del cliente — de lo contrario `ListMeta.sort` miente.

**Máximo 3-5 columnas ordenables por tabla.** Una columna solo se publica en `sortableFields` si tiene índice de soporte y su p95 de página profunda ordenada se mantiene bajo 1,5 s. Se excluyen por defecto las columnas calculadas, las derivadas de JSON y las que exigen un `JOIN` adicional. Copiar «todas las columnas» del demo multiplicaría la migración de índices por el número de columnas y pondría en producción órdenes que nadie usa.

**19 · Orden por columna solo donde `randomAccess: true`.** En modo cursor cada ordenación exige su propio codificador keyset — hoy hay cuatro tipos de cursor para cuatro órdenes. Ofrecer orden por columna sobre feeds multiplicaría esa familia sin beneficio: un feed cronológico se lee por fecha descendente, que ya es su orden natural. Los recursos con `randomAccess: false` devuelven `sortableFields: []`.

**20 · Ciclo de tres estados y desempate obligatorio.** El control recorre `ascendente → descendente → sin orden`, y el tercer estado devuelve el **orden por defecto del recurso**. No es adorno: en listados cuyo orden por defecto es significativo —prioridad, SLA, rango de categoría— no poder volver a él es perder información.

Todo orden aplicado lleva **`id` como desempate** (§Decisión 12). Con orden por columna esto pasa de buena práctica a condición de publicación: sin él, ordenar por una columna con muchos empates produce filas repetidas entre páginas y filas que no aparecen nunca, y el operador puede provocarlo a voluntad.

`sortBy` y `sortDir` viven en la URL (§Decisión 9) y cambiar el orden **vuelve a página 1** (§Decisión 9, regla de reset).

**21 · El orden no vive en el encabezado en mobile.** Bajo `sm` los encabezados quedan dentro del contenedor con desplazamiento horizontal, y pulsar un control de 16 px dentro de una tabla que se desplaza es una trampa táctil. El orden se expone como control en la **barra de filtros**, fuera del shell. Esto **reutiliza** el `<Select>` que ya existe en `AdditionalProductsPanel.tsx:619` en vez de retirarlo: deja de ser el camino de Comercial y pasa a ser la variante mobile del contrato único, alimentada por `sortableFields`.

**22-bis · Régimen de adopción del orden por columna (enmienda v1.2, 2026-07-25).**

El gate de cierre encontró que las cuatro listas blancas están vacías (`const SORTABLE_FIELDS: string[] = []`), que `PortalDataTableSortableHead` solo se adoptó en el piloto, y que la medición de p95 que §18 exige **sigue pendiente**. La lectura correcta de ese hallazgo no es que la implementación incumpla: es que §18 condiciona la publicación a una medición que no existe, de modo que **no publicar era la única conducta conforme**. Lo que faltaba era decir eso con claridad y fijar cómo se sale del estado inicial.

1. **`sortableFields: []` es un estado conforme, no deuda.** Significa «este recurso aún no tiene medición ni índice que sostengan un orden». Un recurso puede permanecer así indefinidamente sin incumplir esta decisión. El orden por columna es una **capacidad del contrato de adopción por recurso**, no una función que toda tabla deba exhibir.

2. **Prohibido publicar sin medir.** Ninguna columna entra en `sortableFields` sin índice de soporte y p95 de página profunda ordenada bajo 1,5 s (§18, sin cambio). Poblar listas «para que la función se vea» es incumplimiento, no avance.

3. **Honestidad del contrato.** Un endpoint con `sortableFields` vacío **no anuncia `sortBy` ni `sortDir` en OpenAPI**. Anunciar un parámetro que el servidor ignora y devolver siempre `meta.sort: null` es un contrato falso: se corrige retirando el anuncio, no poblando la lista.

4. **El primitive permanece.** `PortalDataTableSortableHead` está construido, es correcto y es fail-closed: `apply-sort.ts` valida contra la lista blanca antes de construir el identificador, por lo que con listas vacías la superficie de inyección es nula. No se retira ni se marca como muerto; espera contrato que lo habilite.

5. **Salida del estado inicial.** Cuando AI-PLAT-OPS entregue la medición de p95, se publica un **primer tramo de hasta 3 columnas** en los directorios de mayor valor operativo, empezando por los cuatro recursos que ya declaran la constante (tickets de assurance, tareas, partes, suscriptores). Ese tramo lo autoriza AI-EM-ARCH con la tabla de medición a la vista, recurso por recurso. Sin medición no hay tramo.

6. **Lo que esta cláusula no autoriza.** Que el orden quede inerte de forma indefinida **por omisión**. La medición de p95 es entregable con dueño (AI-PLAT-OPS) y su ausencia se reporta como deuda en cada informe de sprint hasta que exista. Lo que se retira es la expectativa de adopción universal sin fecha; no la obligación de medir.

> **Nota de trazabilidad.** Esta enmienda no revierte la v1.1: el orden por columna sigue siendo parte del alcance del programa y del contrato. Lo que cambia es el régimen: de «default universal» a «capacidad de adopción medida por recurso». La cláusula existe porque declarar cumplido un objetivo con cero adopción, o poblar listas sin medición para aparentar cumplimiento, son las dos formas de mentir sobre este entregable.

**22 · Accesibilidad del orden, resuelta en el primitive.** `aria-sort="ascending" | "descending" | "none"` en el `<th>`; el control es un `<button>` **dentro** del `<th>`, cuyo nombre accesible enuncia la **acción siguiente**, no el estado actual; el cambio se anuncia una sola vez por la misma región `aria-live` del pager. Como `aria-sort` no existe hoy en el repo, se construye una vez en `PortalDataTableSortableHead` y no se replica en catorce pantallas.

**11 · Cota obligatoria de `page`.** `page * limit <= 10_000` en los 35 endpoints; fuera de rango → 400. Cierra DEF-2.

**12 · Orden con desempate único obligatorio.** Todo listado paginado ordena por su campo de negocio **más `id`** como desempate. Cierra DEF-1. Es la condición técnica que hace viable la decisión.

**13 · Coherencia de datos tras mutación.** Crear, editar o borrar desde la tabla **recarga la página actual desde servidor**; prohibido mutar el array en cliente. Si la página queda vacía por el borrado, se retrocede una página automáticamente.

**14 · Página fuera de rango.** Se sirve la última página válida, se corrige la URL con `replace` y se informa una sola vez. Nunca 404, nunca tabla vacía con la navegación pintada como si todo estuviera bien.

**15 · Alcance multi-tenant del conteo.** El `total` refleja el alcance del operador. QA verifica con **dos usuarios de alcance distinto** que el pie no revela el total global del tenant. El `total` de `platform-audit.service.ts:74-95` es global de la plataforma **por diseño** y no debe llegar nunca a `apps/portal` — al unificar el envelope se verifica explícitamente que no se cruzan las audiencias (ADR-061).

**16 · Migración por módulo completo.** Ningún módulo queda mitad numerado y mitad «Cargar más». **Big-bang prohibido**: congelar a la vez 35 endpoints, 32 superficies, 22 archivos de spec y 4 apps produciría una rama de meses sin merge y con rollback nulo.

### Anatomía canónica

```text
PageHeader?                                    (ruta + CTA principal de página)
└── PortalPanel                                (header: eyebrow / título / acciones de dominio)
      ├── filtros / chips                       (SIEMPRE fuera del shell)
      ├── PortalResultsStrip                    (modo cursor: conteo · modo paginado: filtros/acciones)
      ├── control de orden (solo bajo `sm`, junto a los filtros — §Decisión 21)
      └── portalDataTableShellClassName
            ├── <table>
            │     ├── <thead> → PortalDataTableHead            columna no ordenable
            │     │            PortalDataTableSortableHead    solo si está en sortableFields
            │     │                                            aria-sort + ciclo asc → desc → sin orden
            │     └── <tbody> …
            └── pie — EXACTAMENTE UNO, nunca los dos:
                  ├── PortalTablePagination      randomAccess:false · cursor
                  │     └── «Cargar más»          (nodo omitido si !hasMore)
                  └── PortalTablePager           DEFAULT · offset
                        ├── «Mostrando 21–40 de 128 usuarios» + «Filas por página»
                        └── nav: Anterior · 1 … 3 … 12 · Siguiente
                              (nav omitida si totalPages <= 1)
```

### Excepciones (documentar en el módulo)

| Excepción | Condición |
| --- | --- |
| Preview / resumen embebido | ≤ 10 filas fijas, sin pretensión de directorio |
| Matrices / settings de cardinalidad fija | `access-control/profiles` y `/permissions` (seed) — confirmada legítima |
| Tablas de un solo registro / detalle | No aplican |
| Recursos con `randomAccess: false` | Conservan «Cargar más» de ADR-064 — no es excepción, es el contrato |
| Pickers y selectores en modal | Nunca paginación visible; se resuelven con búsqueda tipo-ahead. Su soft-cap silencioso actual es **deuda P1 independiente** |

---

## Consecuencias

### Positivas

- Un solo envelope para los 35 endpoints; se retiran las **tres utilidades de paginación duplicadas** (380 líneas con el mismo `encodePayload`/`decodePayload`) y se cierran las 6 formas de respuesta conviviendo.
- Se cierran cuatro defectos preexistentes, dos de ellos de **correctitud** (DEF-1, DEF-3) y uno de **seguridad** (DEF-2), que existían al margen de esta decisión.
- El operador recupera la posición: deep-link, botón Atrás y enlace compartible por ticket.
- `nextCursor` se conserva en los 35 endpoints: las olas 1-4 de ADR-064 **no se tiran**.

### Negativas / deuda

- **Costo real: 5-7 semanas-persona de backend y ~79 días-persona de frontend** (9-16 semanas de calendario). El grueso no es la paginación: es la normalización de envelopes, los índices que no existen y los defectos preexistentes.
- Dos modos conviviendo (`page` + `cursor`) → matriz de tests doble por endpoint. Mitigado con helper único: el modo es un parámetro, no una rama de servicio.
- `total` estimado en `audit_logs` y `stock_movements` → el conteo aproxima. Mitigado con `totalIsEstimate` explícito y prefijo «~» en la interfaz.
- ~14 índices nuevos por tenant por la paginación, **más uno por cada columna ordenable publicada** (§Decisión 18): coste de escritura e inflado de disco por tenant. Es la razón del tope de 3-5 columnas y de que la lista blanca se cierre con medición, no con ambición.
- Añadir orden por columna a 34 endpoints que hoy no aceptan `sort` amplía la Ola 1 y la Ola 2 sobre la estimación de la v1.0.
- **Bloqueo operativo abierto:** `packages/database/src/migrations/tenant/runner.ts:225` envuelve cada migración en una transacción, y `CREATE INDEX CONCURRENTLY` no puede ejecutarse dentro de una. Requiere decisión de plataforma con AI-PLAT-OPS — posiblemente ADR hermano.
- Ventana de dual-emit con campos duplicados en 35 respuestas.

### Fuera de alcance

- Implementación inmediata de todos los módulos (va por plan de adopción).
- TanStack Table, densidad configurable, vistas guardadas y virtualización — siguen en Firma §2.3 como dirección. **Esta decisión no los cancela ni los pospone.**
- ~~Orden por clic en encabezado de columna~~ → **incorporado al alcance en v1.1** (§Decisión 17-22).
- Orden por múltiples columnas a la vez (`sortBy` compuesto): una sola columna por vez en esta decisión.
- Remediación de los pickers con soft-cap silencioso: deuda P1 independiente.

---

## Registro de posiciones del Design + Engineering Layer

| Agente | Veredicto | Posición registrada | Resolución EM-ARCH |
| --- | --- | --- | --- |
| **AI-PROD-UX** | GO-CON-ENMIENDAS (13, 12 bloqueantes) | **E1: no universal.** Numerar un feed que crece por la cabeza promete una estabilidad que el dato no tiene. Regla propuesta: si el `ORDER BY` por defecto es cronológico descendente → feed → «Cargar más» | **Acogida en sustancia, reformulada en forma.** El fondo técnico es correcto y coincide con AI-SR-FULL, pero se implementa como `capabilities.randomAccess` declarado por el servidor (§Decisión 2) en vez de como lista de excepciones por módulo: así el default sigue siendo numerado —instrucción del CTO— y la degradación es auditable en vez de negociada |
| | | **E2: el estado en URL es el valor real**, no los números | **Acogida íntegra** → §Decisión 9 |
| | | **E3: el conteo se muda al pie** en directorios | **Acogida** → §Decisión 4 |
| | | E4-E13: selector fuera del header, mobile sin números, foco en el control pulsado, no vaciar la tabla al cargar, copy congelado, desempate estable, migración por módulo | **Acogidas** → §Decisión 4-16 y spec UX |
| **AI-DS-OWNER** | GO-CON-ENMIENDAS (10) | **Primitive hermano, no `variant`** | **Acogida** → §Decisión 6 |
| | | **El conteo debe seguir siendo exclusivo del strip**; el pie solo lleva «Página 3 de 12» | **[DESEMPATE] No acogida.** Prevalece la instrucción del CTO, reforzada por E3 de PROD-UX, que llega a la misma conclusión de forma independiente. Se preserva el principio que DS defiende —un solo conteo visible por tabla— enmendando su ubicación. Registro en §Decisión 4 |
| | | Números ghost, ring obligatorio en dark, lima fuera, targets 44 px, opciones `[10,20,50]` | **Acogidas** → §Decisión 7-8 y spec DS |
| **AI-FE-PLATFORM** | GO-CON-ENMIENDAS (4) | **Big-bang NO-GO**; empezar por las 14 superficies ya offset | **Acogida** → §Decisión 16 y plan de adopción |
| | | **DEF-4 bloqueante**: 6 tablas mentirían al usuario | **Acogida como bloqueante de fase** |
| **AI-SR-FULL** | GO-CON-ENMIENDAS (7, todas bloqueantes) | Opción C imposible; recomienda híbrido | **Acogida** → Opción D |
| | | DEF-1, DEF-2, DEF-3 y assurance en memoria deben cerrarse antes o durante | **Acogidas** → §Decisión 11-12 y Fase 1 |
| | | Decidir `CREATE INDEX` bloqueante vs. modificar `runner.ts` con AI-PLAT-OPS | **Escalada** → §Consecuencias |

---

## Criterio de aceptación del ADR

- [x] El CTO aprueba — **2026-07-24**, sobre la v1.1 (paginación numerada + orden por columna en una sola decisión).
- [x] Estado → **Aprobado**; ADR-064 marcado superado en §§2/3/5/9 con aviso de vigencia parcial.
- [x] `component-recipes.md` §2, reglas duras de `iwana-identity-ui-review`, Firma §2.3 y `portal.instructions.md` citan este ADR.
- [ ] Ninguna tabla operativa se mergea sin cumplir la anatomía canónica y el desempate único de orden — **gate permanente**, verificado por review y por AI-SR-QA.

## Escalaciones

**Cerrada — aprobación del ADR.** Resuelta por el CTO el 2026-07-24. La Ola 1 queda desbloqueada.

**Cerrada en decisión (ADR-066) — ejecución runner hecha; índices pendientes.** `CREATE INDEX CONCURRENTLY` exige `transactional = false` (ADR-066). La migración de índices de la Ola 2 es **`089_pagination_ordering_indexes.ts`** (087 = `document_number_hash` schema; 088 = backfill de hashes).

**Abierta — clasificación de `TasksTable`.** Feed o directorio según el orden por defecto que fije el PRD del módulo.

**Abierta, independiente de este ADR — DEF-2.** La cota de `page` remedia un vector de agotamiento del pool explotable hoy; debe cerrarse aunque el programa se detuviera.
