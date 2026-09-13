# UX spec — MOD11 Operaciones: bandejas de tareas y órdenes de ejecución

**Versión:** 1.0
**Fecha:** 2026-09-13
**Autor:** AI-PROD-UX (track UX, F4 — ola 1 del plan)
**Estado:** Borrador para **G2** (etapa 2 del protocolo; aprueba AI-EM-ARCH)
**Encargo que ejecuta:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA1-PROD-UX-v1.0.md` (§3, puntos 1–7)
**Especifica (no modifica) la spec aprobada:** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO**, 2026-09-13) — §§2, 4.1–4.10, 6
**Plan que gobierna:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (**Aprobado**)
**ADRs citados por la spec de diseño (Aprobados):** ADR-046, ADR-047, ADR-065, ADR-067, ADR-068
**Fuera de alcance de esta spec:** tokens y API de componente (AI-DS-OWNER, F3), implementación (AI-FE-PLATFORM, F2/F5), contratos de API (AI-SR-FULL, F0/F1).

**Skills aplicadas antes de especificar:** `iwana-identity-ui-review` (modo diseño), `system-vocabulary-review`, `senior-ui-systems-designer` (apoyo), `ui-ux-pro-max` (subordinada a las anteriores y a los tokens reales; su catálogo no fundamenta ninguna decisión de esta spec).

---

## 1. Objetivo y alcance

Definir la experiencia de las dos bandejas del módulo Operaciones tras la separación en sub-rutas: estructura de pantalla, flujos de usuario, estados, responsive, copy visible y criterios de accesibilidad de flujo (WCAG 2.2 AA). Esta spec congela temprano el flujo y el copy para desbloquear F2 (rutas y split), F3 (contrato de componente) y F5 (cableado), conforme al modelo de contratos del protocolo §3bis.

Cubre los siete puntos del encargo:

1. Etiquetas y orden de pestañas (§4.2).
2. Veredicto CTA vs pestaña para "Crear tarea" (§4.3).
3. Continuidad del contexto del despachador (§5).
4. Estados vacíos con acción de ambas bandejas (§6).
5. Copy de filtros nuevos y columna "Vence" (§7).
6. Flujo de llegada por deep link y cierre del detalle (§8).
7. Criterios de accesibilidad de flujo WCAG 2.2 AA (§11).

## 2. Usuarios y tareas dominantes

| Usuario | Alcance que ve (scoping del contrato, spec de diseño §4.7.2) | Tarea dominante |
| --- | --- | --- |
| Despachador / monitoreo operativo / soporte | Todas las tareas y órdenes del tenant | Responder "¿qué hay pendiente hoy?", derivar y dar seguimiento |
| Técnico de campo / contratista | Solo lo asignado a él o a su cuadrilla | Ejecutar su trabajo y reportar |

Frecuencias que ordenan la jerarquía de cada pantalla: el **seguimiento** (abrir bandeja, filtrar, abrir detalle) ocurre varias veces al día; el **alta de tarea** es puntual y casi siempre nace con contexto (ticket de mesa de ayuda o derivación). Toda decisión de esta spec pondera contra la tarea de seguimiento.

## 3. Decisiones (resumen ejecutivo)

| # | Decisión | Sentido |
| --- | --- | --- |
| D1 | Etiquetas de pestañas "Tareas" y "Órdenes de ejecución", en ese orden | **Ratifica** la spec de diseño §4.3 |
| D2 | "Crear tarea" es CTA del encabezado de página, no tercera pestaña | **Ratifica** el supuesto de la spec §4.3, con justificación propia (§4.3) |
| D3 | Los tres mecanismos de continuidad de §4.4 son válidos; se añade una mejora al mecanismo 3 (preservación del estado de la bandeja en el alta, §5.4) | **Valida y mejora** |
| D4 | Siete estados vacíos/de error definidos, todos con acción visible (§6) | Nuevo (corrige el vacío sin acción actual de la bandeja de tareas) |
| D5 | Copy de filtros "Estado", "Tipo", "Responsable", "Ticket" y columna "Vence" (§7), sobre los mapas de etiquetas canónicos existentes | Nuevo |
| D6 | Al cerrar el detalle llegado por deep link, el usuario queda en la bandeja con estado preservado y foco gestionado; nunca en un callejón sin salida (§8) | Nuevo |
| D7 | Once criterios de accesibilidad de flujo WCAG 2.2 AA verificables (§11) | Nuevo (frontera PROD-UX; contraste y estados de componente son de DS-OWNER) |
| D8 | La bandeja de órdenes v1 no expone búsqueda de texto libre; la trazabilidad cruzada (ticket, tarea, visita) se resuelve por deep link y enlaces desde el detalle (§4.5) | Nuevo, con rationale (§13.3) |

## 4. Estructura de pantalla

### 4.1 Marco continuo del módulo

Las tres rutas (`/dashboard/operations/tasks`, `/dashboard/operations/tasks/new`, `/dashboard/operations/execution-orders`) comparten un marco idéntico y persistente:

```text
Encabezado de página:  "Operaciones"                          [Crear tarea]  ← CTA, solo con permiso
Pestañas de módulo:    [ Tareas ]  [ Órdenes de ejecución ]    ← enlaces reales de ruta
Contenido:             bandeja o formulario de la sub-ruta
```

Requisitos de flujo al marco:

- El encabezado y la pestaña de módulo **nunca se desmontan** al cambiar de sub-ruta (mecanismo 1 de la spec de diseño §4.4; se valida en §5.1).
- La pestaña activa se marca con `aria-current="page"`; la navegación lleva el rótulo accesible "Secciones de Operaciones".
- Las pestañas son enlaces reales: abren en pestaña nueva, se comparten y el botón Atrás del navegador funciona sobre ellas.

### 4.2 Etiquetas y orden de pestañas — D1, ratifica encargo punto 1

| Orden | Etiqueta visible | Ruta | Gate |
| --- | --- | --- | --- |
| 1 | **Tareas** | `/dashboard/operations/tasks` | permiso de lectura de tareas |
| 2 | **Órdenes de ejecución** | `/dashboard/operations/execution-orders` | permiso de lectura de órdenes |

Ratificación de las etiquetas propuestas por la spec de diseño:

- Español, sentence case, plurales coherentes con el contenido (bandejas, no acciones). Ninguna sigla ("OT") ni enum crudo queda visible: el producto dice "orden de ejecución".
- "Órdenes de ejecución" es el nombre de producto del recurso y coincide con el vocabulario que el módulo ya usa en el detalle; no se abrevia a "Órdenes" para no colisionar con otros listados del portal.

Ratificación del orden:

1. **Cobertura de roles.** La bandeja de tareas sirve a todos los perfiles con acceso al módulo, incluidas las operaciones internas y de backoffice que no derivan en orden de ejecución. Es el destino por defecto menos sorpresivo para el landing del módulo (la primera pestaña permitida).
2. **El activo central no necesita encabezar el menú para tener puerta de entrada.** La puerta de la orden de ejecución es su propia pestaña, siempre visible; el acceso directo del despachador a "¿qué órdenes tengo hoy?" queda resuelto por la bandeja, su orden por defecto (ventana planificada más reciente primero) y los deep links. Reordenar no agregaría nada y rompería la correspondencia con el nombre del módulo (ejecución operativa de tareas).
3. **Estabilidad de expectativas.** El fallback por rol del inicio del portal y las notificaciones existentes ya dirigen a "Operaciones" con destinos por permiso; el orden ratificado los respeta.

Caso límite: un usuario con permiso solo de órdenes ve una única pestaña ("Órdenes de ejecución"); un usuario sin permiso de creación no ve el CTA. Un control que no aplica **no se pinta** (spec de diseño §4.3); no se pinta deshabilitado.

### 4.3 "Crear tarea": veredicto CTA vs pestaña — D2, encargo punto 2

**Veredicto: CTA del encabezado de página. Ratifica el supuesto de la spec de diseño §4.3. No existe tercera pestaña.**

Especificación del CTA:

- Texto visible: **"Crear tarea"**. Ubicación: a la derecha del encabezado de página, en el primer viewport de ambas pestañas.
- Visible solo con el permiso de creación de tareas (el mismo que hoy protege el panel de alta). Sin permiso no se pinta; nunca se pinta deshabilitado sin explicación.
- Destino: `/dashboard/operations/tasks/new`, construido como enlace con el estado de la bandeja de origen (§5.4).
- Es un control de acción permanente y visible: **nunca** tras hover, nunca dentro de un menú colapsado por defecto.

Justificación:

1. **Gramática de navegación.** Las pestañas de módulo son vistas hermanas donde el usuario *permanece*; crear es una acción con inicio y fin que termina en una redirección (§5.4). Convertirla en pestaña produce una pestaña sin estado propio que desaparece al guardar: la navegación queda coja y el `aria-current` pierde significado.
2. **Jerarquía de frecuencia.** La tarea dominante de la pantalla es el seguimiento (§2). Darle a la creación el mismo peso visual que las dos bandejas invierte esa jerarquía de forma permanente, a cambio de una acción puntual.
3. **Consistencia con el patrón del portal.** Los encabezados de sección del portal ya reservan su zona derecha para acciones (`PortalSectionHeader` con acciones; receta de panel del catálogo de identidad). El precedente `/dashboard/scheduling` usa pestañas solo para vistas; las acciones viven fuera de la pista.
4. **Accesibilidad semántica.** Un lector de pantalla que recorre la lista de pestañas espera destinos de contenido. Un CTA es un enlace con nombre de acción, palabra natural ("Crear tarea") que se anuncia como lo que es.
5. **Responsive.** Una tercera pestaña roba ancho a la pista de pestañas en móvil; el CTA vive en el encabezado y conserva su objetivo táctil completo.
6. **Descubribilidad intacta.** El riesgo de una CTA frente a una pestaña era la visibilidad: queda descartado porque el CTA está en el primer viewport, con objetivo ≥44 px, y el acceso desde mesa de ayuda sigue funcionando por deep link a `/tasks/new` con o sin CTA.

### 4.4 Bandeja de tareas (`/dashboard/operations/tasks`)

Tarea principal: escanear pendientes, abrir una tarea, filtrar por lo que el despachador tiene a mano.

Anatomía (de arriba hacia abajo):

```text
Toolbar de filtros:  Estado · Tipo · Responsable · Ticket        ← todos visibles, en una fila ≥lg
Tabla operativa:     Número · Título · Tipo · Estado · Prioridad · Destinatario · Vence
Pie:                 exactamente uno, según meta.capabilities (contrato de componente F3)
Detalle:             side peek abierto por ?taskId= (misma gramática que la orden de ejecución)
```

Decisiones de contenido:

- **Columna "Vence" sustituye a "Creada"** en la vista por defecto (spec de diseño §4.10 ofrecía "sustituye o acompaña"; se decide sustituir). La fecha de creación es metadata del detalle, no un dato de escaneo; el vencimiento es el que ordena el trabajo. La gramática de la celda está en §7.4.
- Filtro "Ticket" nuevo junto a los de tipo y responsable; copy y comportamiento en §7.
- El detalle de tarea se abre por `?taskId=` en la URL (spec de diseño §4.6); la fila activa conserva su resaltado y el foco vuelve a ella al cerrar (§11, criterio 3).
- Orden por defecto: el que declare el contrato v1 de tareas. Requisito de UX registrado en §13.4: que priorice lo pendiente de vencer.

### 4.5 Bandeja de órdenes de ejecución (`/dashboard/operations/execution-orders`)

Tarea principal: responder "¿qué órdenes tengo hoy?", encontrar la orden de un cliente o técnico y abrirla sin salir del módulo (CA-01 de la spec de diseño).

Anatomía:

```text
Toolbar de filtros:  Estado · Resultado · Tipo de trabajo · Asignado a · Sede · Ventana planificada (desde–hasta)
Tabla operativa:     Número · Estado · Resultado · Tipo de trabajo · Asignado a · Cliente · Municipio · Ventana
Pie:                 exactamente uno, según meta.capabilities
Detalle:             side peek (consola de orden) abierto por ?executionOrderId=
```

Decisiones de contenido:

- Los filtros visibles se limitan a los seis anteriores: son los que el despachador usa en el seguimiento diario. Los parámetros de trazabilidad cruzada del contrato (ticket, tarea, visita) **no se exponen como filtros de texto en v1**: se consumen por deep link y por enlaces desde los detalles de mesa de ayuda y programación (D8; rationale y consecuencia en §13.3).
- Sin búsqueda de texto libre en v1: no hay un criterio único de búsqueda (número visible vs identificador interno) sin inventar comportamiento de contrato; el vacío correspondiente queda cubierto por la variante de filtros (§6) y el deep link inexistente por la alerta de error con acción (§6, E6–E7).
- Columna "Cliente": la etiqueta de visualización del cliente del contrato (proyección mínima, ADR-067); sin dirección ni contacto en la bandeja. Ejemplo de celda con marcador de posición, sin datos reales: `{etiqueta del cliente}`.
- Columna "Ventana": fecha y hora de inicio planificadas (formato es-CO); es el dato que ordena el orden por defecto.
- Número de orden en tipografía de datos técnicos (mono/tabular), como ya hace la columna "Número" de tareas.
- Los encabezados no son ordenables en v1 (`meta.capabilities.sortableFields` vacío por ADR-065 §22-bis; spec de diseño §4.7.1): encabezados simples, sin controles de orden ni `aria-sort`, hasta que exista el tramo autorizado. La UX no solicita activar orden en esta ola.

### 4.6 Alta de tarea (`/dashboard/operations/tasks/new`)

Tarea principal: registrar una tarea con el mínimo de pasos, sin perder la bandeja de origen.

- Título de página: **"Nueva tarea"** (el encabezado del módulo y las pestañas permanecen; el usuario no pierde el marco).
- Formulario agrupado por decisión de negocio (destinatario → qué y cuándo → responsable), con labels asociados y validación al salir del campo; error junto al campo, en español claro (§11, criterio 10).
- Pie de creación fijo (patrón de pie fijo de modo creación del catálogo de identidad) con dos acciones visibles: **"Crear tarea"** (primaria, con estado de envío) y **"Cancelar"** (secundaria).
- Llegada con contexto: desde mesa de ayuda con `?ticketId=…&fromAssurance=1` el formulario preselecciona el origen del ticket y lo muestra como contexto legible ("Derivada del ticket {referencia}"); no se vuelve a preguntar lo que el sistema ya sabe.
- Salidas: éxito → redirección con el detalle abierto (§5.4); cancelar → retorno a la bandeja con su estado preservado (§5.4). Ninguna de las dos deja una alerta de éxito huérfana.

## 5. Continuidad del contexto del despachador — D3, encargo punto 3

La objeción real contra las sub-rutas es fragmentar el contexto. Los tres mecanismos de la spec de diseño §4.4 son correctos y se **validan**; se especifica su comportamiento exacto y se añade una mejora al tercero.

### 5.1 Mecanismo 1 — Marco continuo: **validado**

El encabezado de página y la navegación de pestañas viven en el layout del módulo y no se vuelven a montar al cambiar de sub-ruta. Requisito de flujo que añade esta spec: ninguna transición entre pestañas muestra un esqueleto del marco (solo del contenido); el usuario nunca pierde de vista en qué módulo está.

### 5.2 Mecanismo 2 — Estado en la URL: **validado**

El estado completo de cada bandeja vive en la URL, de modo que Atrás restaura filtros, página, orden y detalle abierto (CA-04 de la spec de diseño). Mapa de parámetros por bandeja:

| Bandeja | Parámetros en URL |
| --- | --- |
| Tareas | `status`, `type`, `responsibleRefId`, `ticketId`, `page`, límite de página, `taskId` (detalle abierto) |
| Órdenes de ejecución | `status`, `result`, `workType`, `assigneeId`, `organizationSiteId`, `windowFrom`, `windowTo`, `page`, límite de página, `executionOrderId` (detalle abierto) |

Reglas de escritura (receta de tabla operativa del catálogo de identidad, conforme a la spec de diseño §4.10):

- Cambiar **página** hace push (Atrás vuelve a la página anterior).
- Cambiar **filtro** o límite hace replace y regresa a la página 1.
- Abrir/cerrar **detalle** modifica solo su parámetro, preservando el resto (merge de parámetros, no reemplazo de URL).

### 5.3 Mecanismo 3 — Redirección post-alta con detalle abierto: **validado**

El alta exitosa lleva a la bandeja de tareas con el detalle de la tarea recién creada abierto (`/tasks?taskId=<nuevo>`), en lugar de una alerta de éxito en una pantalla que el usuario ya abandonó. El detalle abierto **es** la confirmación: no se añade alerta adicional.

### 5.4 Mejora al mecanismo 3 — Preservación del estado de la bandeja en el alta (nuevo, M3.1)

La redirección validada en §5.3 tiene un costo residual: un despachador que creó la tarea desde la bandeja filtrada (por ejemplo, estado "Abierta", página 3) pierde ese estado al aterrizar en la bandeja limpia. Comportamiento especificado:

1. Al entrar a la creación desde el CTA, el enlace incorpora el estado vigente de la bandeja como parámetro `returnTo` (la URL de retorno codificada).
2. **Éxito** → redirección a `returnTo` con el parámetro `taskId` del nuevo registro añadido por merge: la bandeja se restaura con sus filtros y página, y el detalle se abre encima.
3. **Cancelar** → retorno a `returnTo` sin parámetro de detalle.
4. Llegada directa por deep link (mesa de ayuda) sin `returnTo` → éxito lleva a `/tasks?taskId=<nuevo>` (no hay estado previo que preservar; comportamiento de la spec de diseño §4.4).

Es un patrón de parámetro de URL con los helpers existentes de merge de parámetros; no altera alcance, rutas ni contratos. Queda registrado para el costo de implementación en F5 (§13.5).

## 6. Estados vacíos y de error con acción — D4, encargo punto 4

Regla de la casa (catálogo de identidad, receta de estados vacíos): **un vacío sin acción es un defecto**. Se distinguen dos gramáticas: *primera vez* (explica qué aparecerá aquí y ofrece el camino para llenarlo) y *sin resultados* (mensaje corto + limpiar filtros). El estado actual de la bandeja de tareas — un párrafo "No hay tareas operativas para los filtros actuales." sin acción (`TasksTable.tsx:54-60`) — queda corregido por esta spec.

Todos los vacíos usan la primitive de estado vacío del portal con acción (`PortalEmptyState` con `title`, `description`, `action`). La ilustración ligera es opcional y decisión de DS-OWNER (el tinte suave de acento está permitido solo en la variante de primera vez).

### 6.1 Bandeja de tareas

| # | Caso | Título | Descripción | Acción visible |
| --- | --- | --- | --- | --- |
| E1 | Primera vez: el alcance del usuario no tiene ninguna tarea | "Aún no hay tareas aquí" | Con permiso de creación: "Las tareas que crees o te asignen aparecerán en esta bandeja." Sin permiso: "Cuando te asignen una tarea, la verás aquí." | Con permiso: **"Crear tarea"** (mismo CTA del encabezado). Sin permiso: **"Actualizar"** |
| E2 | Filtros sin resultados | "No hay tareas con estos filtros" | "Prueba con otros filtros o límpialos para ver todas las tareas." | **"Limpiar filtros"** (restaura la bandeja a su estado por defecto, con replace de URL) |
| E3 | Búsqueda por ticket sin resultados | "No hay tareas para ese ticket" | "Revisa el número del ticket o limpia los filtros para ver todas las tareas." | **"Limpiar filtros"** |

### 6.2 Bandeja de órdenes de ejecución

| # | Caso | Título | Descripción | Acción visible |
| --- | --- | --- | --- | --- |
| E4 | Primera vez: el alcance del usuario no tiene ninguna orden | "Todavía no hay órdenes de ejecución" | Para despachador: "Las órdenes nacen de las visitas programadas. Cuando Programación agende una visita, su orden aparecerá aquí." Para técnico: "Cuando te asignen una orden de ejecución, la verás aquí." | Despachador: **"Ir a Programación"** (enlace al módulo de programación). Técnico: **"Actualizar"** |
| E5 | Filtros sin resultados (incluye los filtros traídos por deep link que no arrojan datos) | "No hay órdenes con estos filtros" | "Prueba con otros filtros o límpialos para ver todas las órdenes." | **"Limpiar filtros"** |

### 6.3 Deep link a detalle inexistente o sin acceso

Comparten una sola redacción genérica: **no confirma la existencia del recurso** a un actor sin acceso (scoping del contrato, spec de diseño §4.7.2). Se muestran como alerta de error con acción (`PortalAlert`), no como estado vacío de bandeja.

| # | Caso | Título | Descripción | Acción visible |
| --- | --- | --- | --- | --- |
| E6 | Deep link a orden de ejecución inexistente o sin acceso | "No pudimos abrir esta orden de ejecución" | "El enlace puede estar desactualizado o el elemento puede no estar disponible para ti." | **"Ver todas las órdenes de ejecución"** (limpia los parámetros del enlace y muestra la bandeja por defecto) |
| E7 | Deep link a tarea inexistente o sin acceso | "No pudimos abrir esta tarea" | "El enlace puede estar desactualizado o el elemento puede no estar disponible para ti." | **"Ver todas las tareas"** (idem) |

Regla transversal: si el fallo es de red y no del recurso, el mensaje es de reintento ("No pudimos cargar la información." + **"Reintentar"**), no de recurso inexistente.

## 7. Copy de filtros nuevos y columna "Vence" — D5, encargo punto 5

Fuente única de las etiquetas de valores: los mapas de etiquetas existentes del módulo (`operations-labels.ts`). Ninguna pantalla escribe sus propias traducciones de valores: si un label cambia, se cambia en el mapa y se actualizan los tests que lo esperan (regla de corregir desde la fuente, según la skill de vocabulario). Los valores de los selectores se listan con su etiqueta canónica, nunca el valor crudo del enum.

### 7.1 Filtros de la bandeja de tareas

| Filtro | Control | Etiqueta | Opción vacía (sin filtro) | Notas |
| --- | --- | --- | --- | --- |
| Estado | Selector | "Estado" | "Todos los estados" | Valores con etiquetas del mapa de estados de tarea: Abierta, Lista, Programada, En progreso, Pendiente externo, Pendiente interno, Bloqueada, Resuelta, Cancelada |
| Tipo | Selector | "Tipo" | "Todos los tipos" | Valores del mapa de tipos: Soporte al cliente, Operación interna, Instalación, Visita de campo, Backoffice, Cobranza, Revisión |
| Responsable | Buscador con sugerencias | "Responsable" | "Todos" | Escribe para buscar; opciones con nombre del usuario interno. Incluye acción visible "Quitar responsable" cuando hay uno aplicado. La degradación para roles sin acceso al buscador se declara de forma visible (punto abierto del plan, no se hereda la degradación silenciosa) |
| Ticket | Campo de texto | "Ticket" | Placeholder: "Número de ticket" | Texto de ayuda: "Muestra las tareas derivadas de un ticket de mesa de ayuda." Filtro exacto, se aplica al confirmar; la acción de limpiar filtros lo vacía |

### 7.2 Filtros de la bandeja de órdenes de ejecución

| Filtro | Control | Etiqueta | Opción vacía (sin filtro) | Valores (mapas canónicos) |
| --- | --- | --- | --- | --- |
| Estado | Selector | "Estado" | "Todos los estados" | Creada, Asignada, En ruta, En progreso, Bloqueada, Ejecutada, Completada con observaciones, No ejecutada, Cancelada |
| Resultado | Selector | "Resultado" | "Todos los resultados" | Ejecutada, Ejecutada con observaciones, No ejecutada, Requiere seguimiento, Cancelada |
| Tipo de trabajo | Selector | "Tipo de trabajo" | "Todos los tipos" | Instalación, Soporte, Visita técnica, Mantenimiento, Retiro |
| Asignado a | Buscador con sugerencias | "Asignado a" | "Todos" | Técnicos y cuadrillas; ayuda: "Busca por técnico o cuadrilla" |
| Sede | Selector | "Sede" | "Todas las sedes" | Sedes del tenant |
| Ventana planificada | Rango de fechas | "Ventana planificada" | Sin rango | Campos "Desde" y "Hasta"; ayuda: "Filtra por la fecha de inicio planificada" |

### 7.3 Etiquetas de la columna "Vence" (bandeja de tareas)

Encabezado de columna: **"Vence"**. La celda comunica el plazo en lenguaje de despacho, no una fecha cruda:

| Situación | Texto de la celda | Tratamiento |
| --- | --- | --- |
| Vencida (fecha límite pasada y tarea sin resolver) | "Vencida · 12 sep" | Texto "Vencida" + icono, en la escala semántica de error. **Nunca solo color** (§11, criterio 6) y nunca el acento lima (el lima significa avance, no urgencia) |
| Vence hoy | "Hoy · 3:45 p.m." | Escala semántica de atención |
| Vence mañana | "Mañana · 9:00 a.m." | Tono neutro |
| Fecha futura | "24 sep" | Tono neutro |
| Sin fecha límite | "Sin fecha" | Tono neutro, discreto |
| Tarea resuelta o cancelada | La fecha, sin énfasis ("12 sep") | Sin señal de vencimiento: ya no ordena trabajo |

Horas en formato es-CO; la fecha completa con año va en el texto accesible de la celda cuando el año no es el actual. El cálculo de "vencida" es del lado del render respecto de la fecha límite declarada en el registro; no depende del estado de sincronización.

## 8. Flujo de llegada por deep link y cierre del detalle — D6, encargo punto 6

### 8.1 Llegada

1. El usuario abre un enlace con `?executionOrderId=X` a la raíz del módulo (notificación, correo, historial).
2. La raíz redirige en servidor (307, nunca 308) a `/dashboard/operations/execution-orders?executionOrderId=X` con el resto de parámetros intactos (spec de diseño §4.2).
3. La bandeja carga su estado por defecto (o el de los filtros incluidos en el enlace, si los trae) y el detalle se abre en side peek encima. El foco se mueve dentro del detalle; el título del detalle enuncia la orden concreta ("Orden de ejecución {número}"), de modo que quien llega con lector de pantalla sabe dónde está sin recorrer la bandeja (§11, criterio 8).

### 8.2 Cierre del detalle — qué ve el usuario

**El usuario queda en la bandeja, nunca en un callejón sin salida.** Al cerrar (botón "Cerrar", tecla Escape o capa exterior):

1. Se retira **solo** el parámetro `executionOrderId` por merge; filtros, página, orden y límite se conservan (spec de diseño §4.6; CA-06).
2. Lo que se ve detrás es la bandeja en su estado vigente:
   - Si la orden cerrada está en la página actual, la fila conserva el foco (continuidad para teclado y lector de pantalla).
   - Si no está en la vista actual (p. ej. el enlace apuntaba a una orden antigua), el foco va al encabezado de la región de resultados y el pie orienta con el conteo ("Mostrando 1–20 de N órdenes de ejecución"). No se fuerza ningún filtro automático para "atrapar" la fila: inventar un filtro que el usuario no pidió fragmenta más el contexto de lo que lo repara.
3. Orientación de primera llegada: quien entra por deep link sin filtros ve la bandeja por defecto (órdenes por ventana planificada más reciente), que es justamente la respuesta a "¿qué órdenes tengo hoy?" — el propósito del módulo. Los filtros del enlace (si el emisor los incluyó) se preservan al cerrar.
4. Casos con salida garantizada: bandeja vacía por filtros del enlace → estado E5 con "Limpiar filtros"; recurso inexistente o sin acceso → alerta E6 con "Ver todas las órdenes de ejecución". **Ningún camino de llegada termina en una pantalla sin acción.**

La misma gramática aplica al detalle de tarea (`?taskId=`): cierre por merge, foco a la fila o a la región de resultados, y alerta E7 como salida de error.

## 9. Flujos de usuario extremo a extremo

**F1 — "¿Qué órdenes tengo hoy?" (seguimiento, despachador).** Inicio → Operaciones → redirección a la primera pestaña permitida → si aterriza en Tareas, cambia a "Órdenes de ejecución" → la bandeja muestra las órdenes por ventana más reciente → filtra por estado o técnico → abre el detalle → cierra → sigue en la bandeja donde estaba (§8.2).

**F2 — Derivar una tarea desde mesa de ayuda.** Ticket en mesa de ayuda → acción "crear tarea" con `?ticketId=…&fromAssurance=1` → redirección a la creación con el origen preseleccionado → completa destinatario, qué y cuándo, responsable → "Crear tarea" → aterriza en Tareas con el detalle de la nueva tarea abierto (§5.3–§5.4) → la cierra y sigue donde estaba.

**F3 — Alta manual desde el módulo.** Bandeja de tareas (posiblemente filtrada) → CTA "Crear tarea" (el enlace lleva el estado de la bandeja) → "Nueva tarea" → guardar o cancelar → regreso a la bandeja con su estado intacto (§5.4).

**F4 — Deep link desde Programación.** Detalle de visita en Programación → enlace con `?executionOrderId=X` → raíz redirige en servidor → bandeja de órdenes con el detalle abierto (§8.1) → cierra → bandeja por defecto o con los filtros del enlace (§8.2).

**F5 — Técnico de campo.** Notificación de asignación → deep link → ve solo su orden (scoping del contrato) → ejecuta en el detalle → cierra → su bandeja, que lista únicamente lo suyo. Si el enlace está vencido o el recurso no le pertenece → alerta genérica E6/E7 sin revelar existencia.

## 10. Responsive

| Breakpoint | Comportamiento |
| --- | --- |
| Escritorio (≥lg) | Toolbar de filtros en una fila; tabla completa; detalle en side peek con ancho de lectura; CTA "Crear tarea" en el encabezado |
| Tablet (md) | Los filtros pasan a una segunda fila (siguen **visibles**, nunca colapsados por defecto); la tabla se desplaza dentro de su contenedor, sin desplazar el layout de la página; side peek puede expandirse a página completa para el detalle |
| Móvil (sm) | Detalle a página completa con "Cerrar" visible arriba; pista de pestañas con desplazamiento horizontal propio; CTA del encabezado visible con objetivo táctil completo. Columnas por prioridad — Tareas: Título, Vence, Estado (Número, Tipo, Prioridad, Destinatario quedan en el detalle). Órdenes: Número, Estado, Ventana, Asignado a (Resultado, Tipo de trabajo, Cliente y Municipio quedan en el detalle). La acción de abrir fila nunca depende del hover |

Regla transversal: el desplazamiento horizontal ocurre **dentro** del contenedor de la tabla, nunca en el layout; ninguna acción frecuente se esconde tras hover ni en menús.

## 11. Criterios de accesibilidad de flujo (WCAG 2.2 AA) — D7, encargo punto 7

Frontera (protocolo §2, nota \*\*): PROD-UX define los de **flujo**; DS-OWNER garantiza contraste y estados en el contrato de componente; FE-PLATFORM los implementa; SR-QA verifica. Contraste de texto, tokens y estados visuales de componente quedan fuera de esta lista a propósito.

1. **Teclado completo y en orden de lectura.** Toda la tarea de seguimiento (pestañas → CTA → filtros → tabla → pie → detalle) se recorre con teclado, sin trampas de foco (WCAG 2.1.1, 2.4.3).
2. **Foco visible y no tapado.** Cada control muestra su foco al recibirlo (clase de foco interactivo del sistema) y el side peek nunca lo oculta mientras un control es alcanzable (2.4.7, 2.4.11).
3. **El detalle es un diálogo: entrar y salir con foco.** Al abrirse, el foco entra al detalle; "Cerrar" y Escape lo retiran; al cerrarse el foco retorna al disparador (la fila) o, en llegada por deep link, al encabezado de la región de resultados (§8.2) (2.1.2, 2.4.3).
4. **Pestañas navegables y anunciadas.** Enlaces reales con `aria-current="page"` en la activa y navegación con rótulo "Secciones de Operaciones"; la pestaña activa no se comunica solo con color (1.3.1, 1.4.1, 4.1.2).
5. **Navegación consistente.** Encabezado, pestañas y CTA ocupan la misma posición y orden en las tres rutas del módulo (3.2.3).
6. **El vencimiento no depende del color.** "Vencida" se comunica con texto + icono + fecha; el estado de una fila nunca se transmite solo por tinte (1.4.1).
7. **Cambios de página y filtro anunciados.** Tras paginar o filtrar, el conteo del pie refleja el resultado y se percibe sin recargar la página; el foco tras paginar aterriza al inicio de la tabla (4.1.3, 2.4.3).
8. **Llegada por deep link con contexto.** Tras la redirección en servidor, el foco aterriza en el detalle abierto (o en el encabezado de la bandeja si no hay detalle); nunca queda suelto sin ancla. El título del detalle enuncia el recurso concreto (2.4.3, 4.1.2).
9. **Objetivos táctiles.** Pestañas, CTA, controles de filtro, botones de pie y "Cerrar" del detalle con objetivo ≥44 px; las filas abren con clic y también con teclado (Enter sobre la fila o su enlace de título) (2.5.8; objetivo del repo: 44 px).
10. **Formulario de alta accesible.** Labels asociados a cada campo; validación al salir del campo con error junto al campo en español claro; al enviar con errores, el foco va al primer campo inválido con su error anunciado; el botón de envío comunica su estado de envío y no permite doble envío (3.3.1, 3.3.3, 4.1.3).
11. **Movimiento contenido.** Las transiciones de apertura/cierre de detalle usan solo transformación/opacidad en 150–300 ms y respetan la preferencia de movimiento reducido del sistema (criterio de motion del catálogo de identidad; referencia WCAG 2.3.3).

## 12. Criterios de aceptación UX (verificables, para F6)

| # | Criterio |
| --- | --- |
| CA-U1 | Las pestañas visibles son exactamente "Tareas" y "Órdenes de ejecución", en ese orden, con `aria-current="page"` en la activa; no existe tercera pestaña de creación |
| CA-U2 | "Crear tarea" aparece como CTA del encabezado en ambas pestañas solo con permiso de creación; sin permiso no se pinta; nunca está tras hover ni colapsado |
| CA-U3 | Los tres mecanismos de continuidad operan: marco persistente entre rutas; Atrás restaura filtros, página, orden y detalle; el alta aterriza en la bandeja con el detalle de la nueva tarea abierto y, cuando hubo bandeja de origen, con su estado restaurado (§5.4) |
| CA-U4 | Los siete estados de §6 se observan con su acción operativa; el vacío antiguo sin acción ya no existe en ninguna ruta |
| CA-U5 | El copy de filtros y la columna "Vence" coinciden con §7; ningún valor crudo de enum ni clave técnica en mayúsculas es visible al usuario; los valores provienen de los mapas canónicos del módulo |
| CA-U6 | La celda de "Vence" distingue vencida / hoy / mañana / futura / sin fecha / terminada según §7.3; "vencida" es legible sin color |
| CA-U7 | El deep link de orden abre el detalle sobre la bandeja; al cerrar, filtros y página se conservan, el foco retorna a la fila o a la región de resultados, y ningún camino termina sin acción |
| CA-U8 | Los once criterios de §11 se observan en los flujos F1–F5 con evidencia de teclado y lector de pantalla |

## 13. Decisiones registradas, supuestos y puntos abiertos

### 13.1 Discrepancias con la spec aprobada

**Ninguna de alcance.** Esta spec ratifica la separación en sub-rutas, las etiquetas, el orden y el supuesto CTA. No se solicita reabrir ninguna decisión del CTO.

### 13.2 Mejoras propuestas dentro del flujo (no cambian alcance)

- **M3.1 (§5.4):** preservación del estado de la bandeja de origen en el alta mediante parámetro de retorno. Refina el mecanismo 3; no agrega rutas ni contratos.
- **D8 (§4.5):** sin búsqueda de texto libre en la bandeja de órdenes v1. La spec aprobada no define una; este silencio se hace explícito aquí para que F5 no la invente. Si Producto la exige después, requiere decisión de alcance vía AI-EM-ARCH.

### 13.3 Rationale de D8

El contrato expone parámetros de trazabilidad cruzada (ticket, tarea, visita), pero un filtro visible necesita decirle al usuario *qué* debe pegar (¿número visible o identificador interno?) y hoy no hay criterio único de resolución sin ampliar contrato. En v1 esa trazabilidad ya funciona por donde el usuario realmente la ejerce: deep links y enlaces desde los detalles de mesa de ayuda y programación. Un filtro que devuelve vacío por un formato equivocado es peor que su ausencia (produce el estado E5 confuso a propósito).

### 13.4 Punto abierto — orden por defecto de la bandeja de tareas

Requisito UX: que el orden por defecto priorice lo pendiente de vencer (vencidas primero, luego por fecha límite ascendente entre tareas activas). El contrato de tareas v1 ya acepta orden; el default compuesto debe confirmarlo AI-SR-FULL en F5 (factibilidad del orden por defecto del listado). Mientras tanto rige el default actual del contrato. No bloquea esta spec.

### 13.5 Punto abierto — costo de M3.1 y del filtro "Ticket"

Para AI-FE-PLATFORM, costo estimado de bajo a medio con helpers existentes; y para F5, verificar el formato que el filtro "Ticket" debe aceptar (número visible del ticket frente a identificador interno del contrato). Si solo el identificador interno produce resultados, el copy de ayuda de §7.1 debe ajustarse o el filtro requerirá resolución número→identificador, lo que subiría por el conducto del plan §11.2 (cambio de contrato → AI-EM-ARCH), nunca se resolvería en el frontend.

### 13.6 Marcadores

Ninguno emitido al cierre de esta spec. Los puntos abiertos de §13.4–§13.5 son asíncronos y tienen dueño y conducto definidos; ninguno impide cerrar G2.

## 14. Trazabilidad

| Punto del encargo §3 | Sección | Estado |
| --- | --- | --- |
| 1. Etiquetas y orden de pestañas | §4.2 | Ratificado |
| 2. Veredicto CTA vs pestaña | §4.3 | Emitido: CTA |
| 3. Continuidad del despachador | §5 | Validado + mejora M3.1 |
| 4. Estados vacíos con acción | §6 | Siete estados, todos con acción |
| 5. Copy de filtros y "Vence" | §7 | Definido sobre mapas canónicos |
| 6. Deep link y cierre del drawer | §8 | Definido, sin callejones sin salida |
| 7. Accesibilidad de flujo | §11 | Once criterios WCAG 2.2 AA |

Handoff H5 (plan §6) cubierto: etiquetas, copy de vacíos y veredicto CTA vs pestaña quedan en este artefacto, en `docs/specs/`, listos para consumirse por F2 (etiquetas y rutas), F3 (contrato de componente: grammática de vacíos y pie) y F5 (filtros, columna "Vence", redirección post-alta).
