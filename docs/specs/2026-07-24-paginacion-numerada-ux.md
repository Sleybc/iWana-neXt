# Spec UX — Paginación numerada de tablas operativas

**Versión:** 1.0
**Estado:** **Vigente** — [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) aprobado por el CTO el 2026-07-24
**Fecha:** 2026-07-24
**Autor:** AI-PROD-UX (consulta) · consolidada por AI-EM-ARCH
**Skills:** `ui-ux-pro-max`, `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns`
**Sustituye:** criterios CA-PAG-01…10 de la spec de ADR-064
**Cubre:** paginación (CA-PAG v2) **y orden por columna** (CA-ORD, añadido con la enmienda v1.1 de ADR-065)
**Relaciona:** [contrato DS](2026-07-24-paginacion-numerada-ds-contrato.md), [Firma iWana §2.3](2026-07-12-firma-iwana-diseno-visual-design.md)

---

## 1. Qué problema resuelve

El defecto operativo real no es «Cargar más» frente a números: es que **la posición del operador no es reconstruible**. Hoy `UsersClient.tsx` serializa filtros a la URL (`syncQueryToUrl` → `router.replace`) pero **no la página**: el operador pulsa «Cargar más» cuatro veces, entra a un registro, vuelve con Atrás y aterriza en las primeras 20 filas. Se repite decenas de veces al día.

Los números de página no arreglan eso por sí solos — lo arregla poner `page` en la URL. **La cláusula del estado en URL es la que aporta el valor; los números son la consecuencia legible de esa posición.** Si se adoptan números sin estado en URL, se gasta la migración y no se resuelve el dolor.

Donde los números sí ganan por sí mismos es en el **barrido exhaustivo con marca de posición**: conciliación de cartera, revisión de catálogo antes de publicar, auditoría de padrón, conteo físico contra sistema. Ahí «voy por la 7 de 40» permite parar y retomar mañana, repartir el trabajo entre dos operadores y pegar un enlace en un ticket. «Cargar más» no puede expresar nada de eso.

## 2. Clasificación de listados

> **Si el orden por defecto es cronológico descendente y el conjunto crece por la cabeza → feed.
> En cualquier otro caso (orden por código, nombre, SKU, estado) → directorio.**

Cualquier discusión módulo por módulo se resuelve mirando el `ORDER BY` por defecto. No hay zona gris negociable.

En ADR-065 esta clasificación **no se aplica como lista de excepciones** sino a través de `meta.capabilities.randomAccess`: el servidor declara si el recurso admite salto arbitrario, y la interfaz reacciona. La regla de arriba es el criterio con el que backend fija ese flag.

| Clase | Control | Conteo |
| --- | --- | --- |
| Directorio (`randomAccess: true`) | `PortalTablePager` — Anterior · 1…N · Siguiente + selector de tamaño | En el pie |
| Feed / cola (`randomAccess: false`) | `PortalTablePagination` — «Cargar más» | En `PortalResultsStrip` |

Candidatos a `randomAccess: false` según el barrido: kárdex de movimientos, auditoría (plataforma y tenant), timeline de expediente, notificaciones, bandeja de visitas pendientes (es una **cola que se vacía**, no un padrón), bajas y salidas de existencias, alertas de vida útil. La matriz de ubicaciones queda fuera por otra razón: paginar filas rompe la lectura cruzada.

**Pendiente de PRD:** `TasksTable` (operaciones) es híbrido. Si el orden por defecto es fecha de creación → feed; si es código de OT o estado → directorio. Lo resuelve el PRD del módulo, no esta spec.

## 3. Copy congelado (es-CO, sentence case)

| Situación | Texto exacto |
| --- | --- |
| Selector, etiqueta | `Filas por página` |
| Selector, opciones | `10` · `20` · `50` (default **20**, sin sufijo) |
| Conteo normal | `Mostrando 21–40 de 128 usuarios` |
| Última página parcial | `Mostrando 121–128 de 128 usuarios` |
| Página única, varios resultados | `128 usuarios` (sin rango — `1-128 de 128` es ruido) |
| Un solo resultado | `1 usuario` |
| Cero resultados | **sin pie** — lo asume el empty state |
| Total desconocido | `Mostrando 41–60` (sin «de N») |
| Total estimado | `Mostrando 41–60 de más de 1.000 usuarios` |
| Navegación | `Anterior` · `Siguiente` |
| Indicador mobile | `Página 3 de 7` |
| Elipsis | `…` (`aria-hidden`, no focusable, no clicable) |
| `aria-label` por número | `Página 3` (+ `aria-current="page"` en la activa) |
| `aria-label` de la región | `Paginación de usuarios` |
| Anuncio a lector de pantalla | `Página 3 de 7. Mostrando 41–60 de 128 usuarios.` |
| Página fuera de rango | `Esa página ya no existe. Mostrando la última página disponible.` |

Separador de rango: **raya corta** `–` (U+2013), no guion ni «a» — `21–40`. Separador de miles: **punto** (`1.000`).

> **Corrección de la spec (2026-07-26, AI-EM-ARCH).** La v1.0 de este documento fijaba **guion** para el rango, mientras `formatPagerCount` (`portal-ui.tsx:616-631`) emite U+2013 desde su implementación. La contradicción produjo dos specs E2E que nacían rojas (BL-3 del re-gate). Se resuelve **alineando la spec al código, no al revés**: la raya corta es el signo tipográfico para intervalos numéricos, el primitive ya lo emitía en todas sus ramas y las specs de aceptación ya lo asertan, de modo que cambiar el código habría generado churn sin mejorar el resultado. Lo que no se admite es que ambos artefactos sigan discrepando.

**Contrato de vocabulario:** cada módulo suministra el sustantivo del recurso en singular y plural, en minúscula — `{ singular: 'usuario', plural: 'usuarios' }`. Un solo string no basta: el caso `1 usuario` es frecuente tras filtrar. Formas cortas aprobadas cuando el nombre largo no cabe en 375 px: `movimientos` (no «movimientos de existencias»), `activos`, `productos`.

**Prohibido:** «entradas», «entries», «ítems», «registros encontrados», «resultados totales», «Showing», `Página 3/7`, `Mostrando 1 a 20`, mayúsculas de título (`Filas Por Página`) y cualquier enum crudo.

## 4. Criterios de aceptación CA-PAG v2

Cada uno es observable sin leer código.

### Comunes a ambas variantes

| ID | Criterio | Sustituye |
| --- | --- | --- |
| **v2-01** | La primera pintura muestra como máximo el tamaño de página vigente (default 20) | v1-01 |
| **v2-02** | Ninguna tabla operativa materializa el universo: la petición lleva `limit` | v1-02 |
| **v2-03** | Filtros, chips y búsqueda están **fuera** del borde del shell | v1-06 |
| **v2-04** | El empty de «sin resultados de filtro» es distinto del de «primera vez» y ofrece «Limpiar filtros» | v1-08 |
| **v2-05** | Todo control del pie es alcanzable y operable por teclado, en orden visual, con foco visible | v1-09 |
| **v2-06** | Todo target ≥44×44 px, incluidos los números. Ninguna acción solo visible en hover | v1-10 |
| **v2-07** | Al cambiar de página no hay salto de layout: la altura del shell no colapsa entre estados | nuevo |
| **v2-08** | El conteo visible aparece **una sola vez** por tabla — auditable buscando el total en el DOM | v1-05 |
| **v2-09** | El pie no contiene ornamento: sin «Fin de resultados», sin filas de relleno, sin badge decorativo | v1-04 |

### Variante feed (`randomAccess: false`)

| ID | Criterio |
| --- | --- |
| **v2-10** | Si `hasMore`, existe el pie con la acción única; si no, el nodo del pie no se renderiza |
| **v2-11** | «Cargar más» concatena; no reemplaza ni pierde filtros |
| **v2-12** | Cambiar filtro reinicia la lista desde la primera página |
| **v2-13** | El conteo vive solo en `PortalResultsStrip`, con la gramática de ADR-064 §3 |

### Variante directorio (`randomAccess: true`)

| ID | Criterio |
| --- | --- |
| **v2-20** | `page`, `size`, `sort`, filtros y búsqueda están en la URL. Copiar la URL en otra pestaña reproduce la vista **idéntica**, incluida la página |
| **v2-21** | Cambiar de página empuja historial (`push`): **Atrás vuelve a la página anterior de la tabla**. Cambiar filtro, búsqueda o tamaño **reemplaza** (`replace`): la búsqueda con debounce no puede generar 12 entradas |
| **v2-22** | Cambiar el tamaño de página **vuelve a la página 1** y conserva filtros, búsqueda y orden |
| **v2-23** | Cambiar filtro, búsqueda u orden **vuelve a la página 1**. Nunca se conserva `page=7` sobre un conjunto nuevo |
| **v2-24** | Tras cambiar de página, la **primera fila queda visible en viewport** (scroll al inicio de la tabla, no al top de la página) |
| **v2-25** | Tras pulsar `Siguiente`/`Anterior`/número, **el foco permanece en el control pulsado** si sigue habilitado. Si queda deshabilitado, pasa al hermano habilitado. **Nunca al `<body>`** |
| **v2-26** | Una región `aria-live="polite" aria-atomic="true"` anuncia el cambio **una sola vez**: `Página 3 de 7. Mostrando 41–60 de 128 usuarios.` |
| **v2-27** | Durante la carga, la tabla anterior **permanece visible atenuada** con `aria-busy="true"` y los controles deshabilitados. El skeleton se usa **solo en la primera carga** |
| **v2-28** | Página única: sin navegación, solo la línea de conteo. El selector sobrevive solo si `total >` la opción mínima |
| **v2-29** | Cero resultados: sin pie, sin selector, sin navegación |
| **v2-30** | Última página parcial: se pintan solo las filas reales; no se rellena |
| **v2-31** | `page` fuera de rango: se sirve la última válida, se corrige la URL con `replace` y se avisa una sola vez. Nunca 404 |
| **v2-32** | `page` no numérica, cero o negativa: página 1, sin error visible, URL corregida en silencio |
| **v2-33** | Tras crear, editar o borrar, se **recarga la página actual desde servidor**. Si quedó vacía, se retrocede una página |
| **v2-34** | Todos los estados cumplen AA en claro y oscuro, **incluido el deshabilitado** (≥3:1), sin depender solo de opacidad |
| **v2-35** | Dos operadores con alcance distinto ven totales distintos. El conteo **nunca revela el total global del tenant** |
| **v2-36** | Con selección múltiple: la selección **no cruza páginas en silencio** — o se limpia, o se muestra cuántos hay fuera de la vista |

## 4-bis. Criterios de aceptación CA-ORD (orden por columna)

Aplican solo a tablas con `capabilities.randomAccess: true` y `sortableFields` no vacío.

| ID | Criterio |
| --- | --- |
| **CA-ORD-01** | Solo las columnas presentes en `meta.capabilities.sortableFields` muestran control de orden. La interfaz **no adivina** ni codifica la lista por módulo |
| **CA-ORD-02** | El ciclo es `ascendente → descendente → sin orden`, y el tercer paso restituye el **orden por defecto del recurso** — verificable comparando con la primera carga sin `sortBy` en la URL |
| **CA-ORD-03** | Cambiar el orden **vuelve a página 1**; nunca se conserva `page=7` sobre un orden nuevo |
| **CA-ORD-04** | `sortBy` y `sortDir` viven en la URL con `replace`; copiar la URL reproduce la vista ordenada idéntica |
| **CA-ORD-05** | El orden sobrevive al botón Atrás y al deep-link, y **no genera una entrada de historial por clic** |
| **CA-ORD-06** | Cambiar el orden conserva filtros, búsqueda y tamaño de página |
| **CA-ORD-07** | `aria-sort` en el `<th>` refleja el estado: `ascending`, `descending` o `none`. Exactamente **un** `<th>` con `aria-sort` distinto de `none` por tabla |
| **CA-ORD-08** | El control es un `<button>` dentro del `<th>`, alcanzable por teclado, con foco visible y target ≥44×44 px. Tras pulsar, **el foco permanece en el encabezado pulsado** |
| **CA-ORD-09** | El nombre accesible enuncia la **acción siguiente**, no el estado actual (`Ordenar por nombre, descendente`), y el cambio se anuncia una sola vez por la región `aria-live` del pager |
| **CA-ORD-10** | El estado de orden **no se comunica solo por color ni solo por el ícono**: la columna activa se distingue también por peso o texto accesible |
| **CA-ORD-11** | Durante la carga de un orden nuevo, la tabla anterior permanece visible atenuada con `aria-busy`; el control de orden queda deshabilitado y **no se desmonta** |
| **CA-ORD-12** | Ordenar por una columna con muchos valores empatados **no repite ni omite filas** entre páginas — el caso que exige el desempate por `id` |
| **CA-ORD-13** | Bajo `sm` el orden **no vive en el encabezado**: se expone en la barra de filtros, fuera del shell |
| **CA-ORD-14** | Ordenar no altera el alcance: dos operadores con visibilidad distinta ordenan sus propios conjuntos y el total del pie sigue siendo el suyo |

### Copy del orden

| Situación | Texto exacto |
| --- | --- |
| Nombre accesible, columna sin orden | `Ordenar por nombre, ascendente` |
| Nombre accesible, en ascendente | `Ordenar por nombre, descendente` |
| Nombre accesible, en descendente | `Quitar orden por nombre` |
| Control mobile, etiqueta | `Ordenar por` |
| Control mobile, opción de retorno | `Orden por defecto` |
| Anuncio a lector de pantalla | `Ordenado por nombre, ascendente. Página 1 de 7.` |

**Prohibido:** «Sort», «Ordenamiento», «Asc»/«Desc» como texto visible, nombres de columna de base de datos (`created_at`) y cualquier enum crudo. El nombre de la columna en el copy es el **rótulo visible** de esa columna, no su campo lógico.

## 5. Comportamiento en 375 px

| Elemento | Comportamiento |
| --- | --- |
| **Números** | **Se eliminan.** Bajo `sm` el pie colapsa a `Anterior` (icono, `aria-label`) + `Página 3 de 7` + `Siguiente` (icono). Tres números de 44 px compiten por el ancho y solo permiten saltos ±1, que las flechas ya cubren |
| **Elipsis** | No existe en mobile. En `≥sm`, ventana de **7 slots**: primera, `…`, actual−1, actual, actual+1, `…`, última |
| **Selector de tamaño** | **Fuera del pie** bajo `sm`, junto a los filtros. 20 filas ya son mucho scroll en mobile; ofrecer 50 en el pie es ofrecer empeorar. La preferencia elegida en escritorio se respeta vía URL, **no se resetea** |
| **Conteo** | Se conserva completo. Si el sustantivo es largo, forma corta aprobada |
| **Layout** | Dos filas: conteo arriba a la izquierda; controles abajo con `justify-between` a ancho completo (flechas en los extremos, indicador al centro → los pulgares alcanzan ambas) |
| **Scroll horizontal** | **El pie no puede vivir dentro del contenedor con `overflow-x`.** Si el operador desplaza para ver una columna, la navegación debe seguir en su sitio |
| **Targets** | 44×44 reales, con ≥8 px entre `Anterior` y `Siguiente` |
| **Orden** | **Fuera del encabezado.** Los encabezados quedan dentro del contenedor con desplazamiento horizontal, y pulsar un control de 16 px dentro de una tabla que se desplaza es una trampa táctil. El orden se expone como control en la **barra de filtros**, con las opciones derivadas de `sortableFields` más «Orden por defecto». Reutiliza el patrón del `<Select>` que ya existe en Comercial |

## 6. Casos límite de operación ISP

**Total desconocido.** No se inventa el número: `Mostrando 41–60`, sin «de N». La navegación degrada a saltos previo/siguiente, sin números ni «última página» — **no** cambia de control, porque mutar el control según el estado del servidor es peor que perder los números. Con estimación: `de más de 1.000 usuarios` (`totalIsEstimate`).

**Totales muy grandes.** Nunca más de 7 botones; primera y última siempre accesibles. **Sin campo «ir a la página»** en la primera versión: es chrome sin evidencia de uso. Señal de producto: si un operador necesita llegar a la página 300, el problema no es la paginación, es que le falta un filtro.

**Última página parcial.** Solo filas reales; sin relleno ni filas fantasma.

**Elemento borrado por otro operador.** Es el defecto estructural del offset y el más grave para el ISP, porque golpea justo el caso que justifica los números: si alguien borra un registro de la página 1 mientras vas a la 2, la fila 21 pasa a ser la 20 y **te saltas un registro sin enterarte**. En conciliación o auditoría es un error silencioso de resultado. Mitigación: desempate estable obligatorio, recarga desde servidor tras cada mutación, retroceso automático si la página queda vacía.

**Página que ya no existe.** Última válida + `replace` + `PortalAlert` descartable una sola vez. Nunca pantalla de error, nunca tabla vacía con la navegación pintada como si todo estuviera bien.

## 7. Riesgos registrados

| # | Riesgo | Mitigación |
| --- | --- | --- |
| **R1** | **Tratar el síntoma y no la causa.** La carga cognitiva de un operador con 100k suscriptores no baja paginando mejor: baja con búsqueda buena, filtros persistidos, vistas guardadas y acciones en lote | Registro explícito: esto **no cancela ni pospone** filtros en URL, vistas guardadas ni bulk actions de Firma §2.3 |
| **R2** | **Dos gramáticas conviviendo** durante la migración destruye la percepción de sistema | Migración por módulo completo (ADR-065 §16) |
| **R3** | **Retroceso a «TailAdmin repintado».** `PortalPanel` ya tiene header con eyebrow, título y acciones de negocio; meter ahí una preferencia de visualización colisiona con esa jerarquía | El selector va al pie, no al header |
| **R4** | **Ganancia neta de chrome.** En Comercial hay cuatro tablas en tabs; multiplicado es ruido | El strip cede el conteo en modo paginado → saldo neto ≈ 0 |
| **R5** | **Foco perdido**: pulsas «Siguiente», el DOM se reconstruye y el foco cae al `<body>` | Resuelto **en el primitive** (v2-25), no en cada pantalla |
| **R6** | **Pickers con soft-cap silencioso** (`limit: 100` sin aviso ni avance) | **Deuda P1 independiente** — ninguna variante de paginación los arregla; necesitan búsqueda tipo-ahead |
