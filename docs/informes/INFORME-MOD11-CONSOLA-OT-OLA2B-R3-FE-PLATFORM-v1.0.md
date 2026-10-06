# Informe R3 — Consumo y custodia bajo demanda de la consola de OT (Ola 2b)

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Agente:** AI-FE-PLATFORM (`fe-platform`)
- **Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2B-R3-FE-PLATFORM-v1.0.md`
- **Contratos consumidos:** UX `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.1 (§3, §4, §4.1, §5, §6, §8, §9) · contrato de componente v1.0 (§3, §5) · API `execution-orders.ts` v1.4 y `execution-orders-completion.ts` v1 · informe B0 §5 y §6.
- **Sin commit, sin ramas.** No se tocó `apps/api` ni `apps/worker`, ni archivo alguno de B0, R2, R4 o E4-portal.

## 1. Dictamen

**GO.** CA-10 y CA-11 se cumplen y están cubiertos por pruebas que fallan si la política regresa. No hay P1 ni `[BLOQUEO]`. Hay **una decisión de interpretación para ratificar** (§6.1) y **dos `[CONSULTA]` a B0** (§7), ninguna bloquea.

## 2. Qué cambió

| Archivo | Cambio |
| --- | --- |
| `use-execution-order-custody.ts` | Reescrito. La custodia deja de cargarse al abrir la OT; solo se consulta con la hoja «Registrar equipo instalado» abierta. Recorre todas las páginas, filtra por categoría, resuelve el responsable y descarta respuestas obsoletas |
| `ExecutionOrderMaterialAction.tsx` | Destino fijado por el requisito, custodia de origen preseleccionada, selector solo con lo compatible, vacío con el copy de UX §5, reintento propio, concordancia singular/plural, destino en el historial |
| `use-execution-order-custody.spec.ts` (nuevo) | 19 pruebas de la política contra los endpoints de inventario simulados |
| `ExecutionOrderMaterialAction.spec.tsx` (nuevo) | 29 pruebas del acto y del historial a través del drawer real |
| `ExecutionOrderMaterialConsole.spec.tsx` (nuevo) | 19 pruebas de punta a punta con `ExecutionOrdersClient` |
| `e2e/tests/portal-operations-consola-ot-r3.spec.ts` (nuevo) | 4 pruebas en navegador, API simulada |
| `ExecutionOrdersClient.spec.tsx` | Se **movieron** a `ExecutionOrderMaterialConsole.spec.tsx` los 4 casos de «custodia del ejecutor» (14 → 10; los 4 equivalentes están en el nuevo archivo) |
| `ExecutionOrderDrawer.spec.tsx` | Tres aserciones de copy en los casos de custodia (vacío y no disponible); ningún caso borrado |

El contrato de slots de B0 no cambió: el slot sigue leyendo todo de `context` y el adaptador sigue llamando a las cinco funciones del slot de custodia. `useExecutionOrderCustody` devuelve un objeto referencialmente estable (verificado con prueba).

## 3. Política de custodia

**Cuándo.** `openAction(descriptor)` es el único disparador. Con `kind: 'consumption'` carga; con cualquier otro descriptor o con `null` cancela lo que esté en vuelo. Abrir la OT, el preinicio, la lectura, otras acciones, inicio, cierre y la simple carga **no consultan nada**: `loadOnOpen` devuelve una función vacía si no hay un consumo abierto.

**Refresco.** Si el consumo sigue abierto y la OT se vuelve a leer, `loadOnOpen` recarga y devuelve la función que aplica el resultado en un único lote, de modo que hoy funciona con el refresco completo de B0 y seguirá funcionando con el de R4. Con la hoja cerrada, el refresco no consulta custodia (prueba en `use-execution-order-custody.spec.ts` y `ExecutionOrderMaterialConsole.spec.tsx`).

**Responsable.** `GET /inventory/custody?responsibleRefId=<assignee.id>`: el id del técnico o cuadrilla de la OT, que el backend resuelve a su ubicación móvil. Responsable no es ubicación de stock: ya no se llama a `listLocations`. `technicianCustodyId` del payload sigue siendo el id del responsable.

**Qué se ofrece.** Solo ítems **ACTIVE** cuyo `categoryCode` es el `itemCategory` del requisito **y** que están en la custodia del responsable:

1. `listCategories` resuelve el código a `categoryId` (recorre sus páginas por cursor).
2. `listItems({ status: ACTIVE, categoryId, limit: 100 })` recorre todas las páginas por cursor y vuelve a comprobar categoría y estado.
3. `getExecutorCustody` recorre todas las páginas (`limit: 100`, el máximo del contrato).
4. Se conservan los equipos y materiales cuyo ítem es compatible; las opciones del selector salen de ahí.

**Páginas.** Una página sin coincidencias nunca declara el vacío si quedan páginas: el recorrido continúa. La cota de seguridad (20 páginas de custodia, 50 de catálogo) **no trunca en silencio**: si corta la custodia, la meta queda con `hasMore` y «Cargar más» continúa el recorrido; si corta el catálogo, la selección queda «no disponible» en vez de ofrecer una lista incompleta. Los totales que se muestran son los de lo compatible, no los de la custodia completa.

**Estados.** Cargando (esqueleto, selector deshabilitado, sin vacío definitivo), disponible, vacío (copy de UX §5), no disponible (alerta + «Reintentar», que reabre el mismo acto y recarga solo la custodia, sin releer la OT), y sin conexión (no se lanzan peticiones; la hoja avisa y bloquea el formulario).

**Obsolescencia.** Cada apertura, cancelación, reintento o cierre invalida la carga anterior; el recorrido se detiene en la siguiente página. Cubierto: cerrar la hoja, cerrar el drawer, reintentar, abrir otra OT con la custodia en vuelo (a nivel de hook y de consola).

## 4. Consumo

- **Payload sin cambios:** `itemId`, `technicianCustodyId`, `quantity`, `action`, `finalDisposition` y `serialNumber` opcional. El `requirementKey` no existe en el comando de la API: se conserva en el descriptor de la hoja.
- **`finalDisposition` del requisito.** Cuando el snapshot lo declara (`INSTALLED_AT_CUSTOMER` en el requisito de equipos), «Destino» queda fijo, deshabilitado y con «Lo define el requisito.»; sin declaración, el usuario lo elige. Antes se podía elegir un destino que no satisfacía el requisito.
- **Custodia de origen** preseleccionada cuando hay una sola (el responsable de la OT).
- Un ítem que deja de estar en las opciones (lista recargada) no se envía.
- Tras un éxito el formulario se limpia y la hoja **sigue abierta** (se pueden registrar varios equipos); un fallo conserva la captura.
- **Historial** bajo su requisito, separado de la captura, ahora con el destino («Instalar · Cantidad: 1 · Instalado en cliente»). La custodia disponible vive solo dentro del acto: se probó que no aparece en el historial.

## 5. Gate (encargo §4)

| Gate | Resultado |
| --- | --- |
| CA-10: negativa en preinicio y solo lectura | Cumple. Preinicio (CREATED, ASSIGNED, EN_ROUTE) y solo lectura (BLOCKED, COMPLETED, CANCELLED, y los terminales por drawer) no montan acto ni consultan, aunque llegue `REGISTER_ITEM_USAGE`; sin ese permiso en progreso tampoco |
| CA-11: consulta al abrir, categoría con varias páginas, histórico, payload, error/reintento, cambio de OT y offline | Cumple, con pruebas en tres niveles (hook, drawer, consola) y en navegador |
| `pnpm --filter portal typecheck` | Verde |
| `eslint src/components/operations` | Sin hallazgos |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations` | «sin hallazgos» |
| Jest `components/operations --no-cache` (sin turbo) | **44 suites, 745 tests, 0 fallidos, 0 omitidos** |
| Playwright `portal-operations-consola-ot-r3` + `…-b0` (dev server real `127.0.0.1:3002`, API simulada) | 6 de 6 |

**Conteo.** El baseline de B0 era 507 en 35 suites; ninguna prueba se borró. Mis aportes: 67 pruebas nuevas (19 + 29 + 19), 4 movidas de `ExecutionOrdersClient.spec.tsx` a `ExecutionOrderMaterialConsole.spec.tsx` con equivalente en cada una. El resto de la diferencia hasta 745 son suites de R2, R4 y E4-portal. Jest no imprime `Cached: 0` (es un campo de turbo); se corrió con `--no-cache` directo, sin turbo, de modo que el conteo es de ejecución real.

**Pruebas con dientes.** Por mutación: quitar el filtro de categoría hace caer 7 pruebas (hook y consola); hacer que `isCurrent` ignore la secuencia hace caer 4.

**Fallos ajenos durante el trabajo.** A mitad de la sesión el `typecheck` y Jest fallaron por `use-execution-order-console.spec.ts`, `ExecutionOrderDrawer.spec.tsx` (casos de evidencia), `ExecutionOrderMomentContainer.spec.tsx` y `use-execution-order-evidence.spec.ts`, todos de R2 en edición. Ninguno tocaba mis archivos; repetidos más tarde, quedaron en verde.

## 6. Evidencia en navegador

Playwright (chromium) contra el dev server real del portal, con la API simulada por `page.route` (sesión sintética de las fixtures del repo, host local). Capturas en `docs/quality/mod11-ola2b/` (solo se reescriben con `R3_EVIDENCIA=1`):

- `r3-navegador-material-cerrado.png`: OT en progreso, historial del requisito visible, **cero peticiones a `/inventory/*`**.
- `r3-navegador-material-abierto.png`: acto abierto; custodia con el equipo de la **segunda página** (la primera solo traía herramientas), destino fijo «Instalado en cliente», custodia de origen preseleccionada.
- `r3-navegador-material-selector.png`: el selector ofrece solo los dos ítems CPE.
- `r3-navegador-material-error.png`: «Custodia no disponible» con la orden operativa; «Reintentar» recupera sin releer la OT.
- `r3-navegador-material-vacio-movil.png`: copy de UX §5 y selector deshabilitado a 390 px.

Aserciones de red del navegador: dos páginas de custodia con `responsibleRefId=tech-001`, `categoryId=cat-cpe`, ninguna llamada a `/inventory/locations`; en preinicio, ninguna llamada a inventario.

### 6.1 Decisión de interpretación para ratificar

«Asignación compatible» se implementó como **ítems de la categoría que están en la custodia del responsable de la OT** (UX §5: «No hay equipos de esta categoría en tu custodia»). Si se quisiera ofrecer también ítems ACTIVE de la categoría que no están en custodia, basta con no filtrar por custodia en `custodyItemOptions`, pero contradice el copy de UX. La otra lectura posible, que «compatible» se refiera solo a que `technicianCustodyId` coincida con el responsable de la OT, también se cumple.

## 7. Lo que no pude verificar y observaciones

**No verificado.**

- Contra el **backend real** con sesión: no hay credenciales en las semillas del repo (misma limitación que B0). El contrato se verificó con el controlador y el servicio (`ExecutorCustodyService`, `inventoryItemService.list` con `categoryId`), no con una llamada real.
- Custodia de **cuadrilla** (`CREW`) de punta a punta: el backend resuelve `MOBILE_CREW` por `responsibleRefId` y el tipo viaja en la opción de custodia, pero solo se probó con técnico.
- Rendimiento con catálogos o custodias muy grandes: el recorrido eager es correcto pero hace una petición por página.
- Lector de pantalla real: solo roles, nombres accesibles y estados en jsdom y en el navegador.

**Consultas a B0 (resueltas en §9; no se tocaron en este bloque).**

1. `RequirementActionSheet.tsx`: Escape con la lista del selector abierta **cierra la hoja entera** (el `onKeyDown` de la hoja recibe el evento por el árbol de React desde el portal del listbox). Debería ignorar el evento si `event.defaultPrevented` o si el objetivo está dentro de un listbox. Se observó en el navegador; afecta a todos los actos con `Select`.
2. `ExecutionOrderMomentContainer.tsx`: el efecto que limpia `selectedAction` al cambiar `order.id` o `order.status` no llama a `onOpenRequirementAction(null)`, así que el adaptador (y por tanto `activeConsumptionRequirement` de R4 y el `active` de la custodia) puede quedar con un consumo «abierto» que ya no existe. R3 lo mitiga comparando el id de la OT al releer, pero con un cambio de estado en la misma OT se haría una recarga de custodia innecesaria.

**Contexto para R4.** `refreshOpenCustody()` → `openAction(descriptor)` recarga solo la custodia. Con el refresco completo de B0, `loadOnOpen` ya la recarga si el consumo sigue abierto; si R4 pasa a refresco selectivo debe llamar `refreshOpenCustody()` solo en la mutación `'consumption'`.

## 8. Deuda y cambios de comportamiento

| Severidad | Observación | Dueño sugerido |
| --- | --- | --- |
| Media | El historial de consumos se repite bajo cada requisito MATERIAL: `ExecutionOrderItemUsage` no trae `requirementKey` y el comando de registro tampoco, así que no se puede filtrar por requisito sin ampliar el contrato | sr-backend / contrato |
| Baja | `collectionCountLabel` (B0) no concuerda en singular; en el slot se resolvió localmente. Conviene moverlo al helper | B0 |
| Baja | `Select` de `@iwana/ui` no tiene estado de solo lectura; el destino fijo usa `disabled` (mismo criterio que el tipo de actividad de B0) | ds-owner |
| Baja | Con `finalDisposition` fijado por el requisito, un destino distinto (por ejemplo devolver a bodega) no se puede registrar desde ese requisito; correcto para satisfacerlo, pero hoy no hay acto de devolución | prod-ux |

**Cambios de comportamiento respecto de B0:**

1. La custodia y el inventario ya no se cargan al abrir la OT (era el objetivo).
2. Tamaño de página de custodia de 25 a 100.
3. Ya no se llama a `GET /inventory/locations` en la consola; se usa `GET /inventory/categories` (mismo permiso `INVENTORY_STOCK_READ`).
4. Copy: vacío de custodia según UX §5 (sustituye «El ejecutor no tiene equipos ni materiales en custodia») y botón «Reintentar» de la custodia (sustituye «Actualizar detalle» dentro de esa alerta).
5. «Destino» deja de ser elegible cuando el requisito lo declara.

**`[BLOQUEO]`:** ninguno.

## 9. Correcciones posteriores (2026-10-06)

Las dos consultas de shell de §7 ya están resueltas por B0: Escape en un selector abierto cierra primero solo el selector, y cambiar OT/estado notifica `onOpenRequirementAction(null)` para limpiar el consumo activo.

La separación del historial continúa abierta: `ExecutionOrderItemUsage` no incluye `requirementKey`. El selector conserva la categoría y custodia aprobadas en UX §5/§6, pero órdenes con varios requisitos MATERIAL no permiten atribuir el historial con exactitud. Hace falta persistir y devolver la clave, además de decidir dónde mostrar los registros históricos cuya procedencia no se guardó.
