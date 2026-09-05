# SPEC — MOD12 Salidas · Captura de línea, seriales múltiples y coherencia del maestro — Fase S2

**Versión:** 1.0
**Estado:** Aprobado — G1 GO con ajustes incorporados (review cruzado AI-SR-FULL + AI-PROD-UX, 2026-09-05; ver §11)
**Fecha:** 2026-09-05
**Módulo:** MOD12 Inventario / SCM — Existencias y Catálogo maestro
**Autor:** AI-EM-ARCH (modos Product Architect + Architect + Orchestrator)
**Superficies:** `/dashboard/inventory?tab=issues` → crear salida · maestro de productos (`InventoryCatalogDrawer`)
**Sucede a:** [SPEC Fase S1 v1.0](2026-09-05-mod12-salidas-picking-existencias-seriales-design.md) — entregada en `50afe28c` y `827d9407`
**PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS v1.0](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md) *(Aprobado)* · [PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS v1.0](../prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md)
**ADRs:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md) *(Aprobado)* · [ADR-085](../adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md) *(Aprobado)* · [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) *(Aprobado — paginación numerada)*
**Prompts:** [Maestro](../prompts/PROMPT-MOD12-SALIDAS-S2-MAESTRO-v1.0.md) · [BE](../prompts/PROMPT-MOD12-SALIDAS-S2-BE-v1.0.md) · [FE](../prompts/PROMPT-MOD12-SALIDAS-S2-FE-v1.0.md)
**Plan:** [plan de orquestación](../plans/2026-09-05-mod12-salidas-captura-linea-seriales-multiples.md)
**Requiere ADR:** No para esta fase. Sí **deja abierta** una decisión de modelo (`itemKind` vs `trackingMode`, §9) que merece ADR propio.
**Requiere CTO:** No — decisiones tomadas por el CTO el 2026-09-05 (§3).

---

## 1. Problema

Tras la Fase S1 el picking funciona: la bodega precarga material, el disponible sale por condición y el lote se muestra con su número real. Quedan tres cosas.

### 1.1 El serial no aparece — y la pantalla de salidas no tiene la culpa

El producto `CFO-SER-ROGPN-TPL-XC220` ("Onu Tp Link") se creó eligiendo **Tipo de producto = "Con serial"**, pero quedó con **Control de material = "Consumible"**. Evidencia directa en la fila del catálogo de productos: columna *Tipo* → "Con serial"; columna *Control de material* → "Consumible".

Son dos campos independientes con autoridad muy distinta:

| Campo en el formulario | Columna | Enum | Qué gobierna realmente |
|---|---|---|---|
| **Tipo de producto** → "Con serial" | `item_kind` | `InventoryItemKind.SERIALIZED` | Solo el segmento `SER` del SKU compuesto (`packages/shared/src/inventory/inventory-item-sku.ts:15-20`) |
| **Control de material** → "Consumible" | `tracking_mode` | `InventoryTrackingMode.CONSUMABLE` | **Todo el comportamiento**: recepción, salida, ajustes, conteo y el selector de serial |

`refineInventoryItemMaster` (`apps/api/src/modules/inventory/dto/index.ts:432-444`) valida únicamente `trackingMode → assetControlled`. **Nunca cruza `itemKind` con `trackingMode`.** El formulario tampoco: `handleTrackingModeChange` (`InventoryCatalogDrawer.tsx:575-582`) ya aplica guía proactiva forzando `assetControlled`, pero el campo *Tipo de producto* se escribe con un `updateForm('itemKind', …)` plano (`:757-764`) sin guía equivalente.

Consecuencia en cadena: el ítem entró por lote sin que la recepción exigiera seriales —correcto para un consumible—, y en salidas `isSerializedTrackingMode(line.trackingMode)` (`StockIssueDraftLinesTable.tsx:196`) devuelve `false`, así que se pinta la rama de lote. **El sistema es coherente consigo mismo; lo que falla es que dejó guardar un producto que se contradice y muestra "Con serial" al operador.**

### 1.2 La captura de línea no corresponde al trabajo de bodega

Hoy el producto entra al borrador con un checkbox y toda la decisión (condición, lote, serial, cantidad) se toma con tres controles inline en la tabla. El operador pidió decidir **lote, seriales y cantidad al momento de agregar**, poder **modificar** la línea después, y que **Condición** deje de ser una columna: nuevo o de retoma se elige junto con el producto.

Además, el modelo actual admite **un serial por línea** con cantidad forzada a 1 (`StockIssueDraftLinesTable.tsx:405`): despachar tres equipos exige tres líneas.

### 1.3 Defectos colaterales

- **Paginación inoperante.** `handleLoadMore` (`StockIssueComposer.tsx:469-480`) solo dispara con `nextCursor`, pero el endpoint opera por `page` y `buildPageMeta` devuelve siempre `nextCursor: null` (`apps/api/src/common/pagination/build-page-meta.ts:26`); el servicio responde 400 si recibe `cursor` (`stock-issue-picking.service.ts:96-100`). Con más de 25 ítems, el resto es inalcanzable.
- **Columna de captura estrangulada.** `xl:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]` (`StockIssueComposer.tsx:1328`) parte la descripción del panel en cuatro líneas. Entre 768 px y 1280 px la grilla `xl:` no aplica pero `isDesktopLayout` (corte en 768, `:277`) ya es `true`: la franja de tablet usa el layout de escritorio colapsado a una columna.

## 2. Objetivo

Que un producto marcado como "Con serial" **sea** serializado de punta a punta; que la línea de salida se configure en un paso dedicado con lote, seriales múltiples y cantidad; y que el borrador sea una lista revisable con acción de modificar.

## 3. Decisiones (CTO, 2026-09-05)

| # | Decisión | Consecuencia |
|---|---|---|
| **D1** | El maestro **impide** la combinación contradictoria y el catálogo existente se corrige. | Validación cruzada en backend + guía proactiva en el formulario + diagnóstico de datos. |
| **D2** | El backend acepta **`serializedAssetIds[]` por línea**. | Una línea con N seriales y cantidad N. Cambia el contrato de `POST/PATCH /inventory/issues` y el modelo de persistencia. |
| **D3** | La configuración vive en un **panel lateral**. | `OperationalSidePeek` de `@iwana/ui`; es el patrón del repo para "fila → editor" y lo que manda la receta §9 de `component-recipes.md` para edición multi-campo. |
| **D4** | **Condición** deja de ser columna editable. | Se elige en el panel y se muestra como dato en la fila. No desaparece del payload: sigue siendo parte de la tupla de reserva. |

## 4. Diseño — Track A · Coherencia del maestro

1. **Validación cruzada** en `refineInventoryItemMaster` (`dto/index.ts:432-444`), en creación y edición: `itemKind = SERIALIZED` exige `trackingMode ∈ {SERIALIZED, FIXED_ASSET}`; un `trackingMode` serializado exige `itemKind = SERIALIZED`. El mensaje nombra los campos como los ve el operador ("Tipo de producto", "Control de material"), no los enums.
2. **Guía proactiva en el formulario.** `InventoryCatalogDrawer` gana un `handleItemKindChange` simétrico al `handleTrackingModeChange` que ya existe (`:575-582`): elegir "Con serial" ajusta *Control de material* en el mismo cambio y lo explica en el `helperText`. La combinación inválida deja de ser guardable.
3. **Bloqueo de cambio con saldo.** `update()` (`inventory-item.service.ts:899-981`) hoy permite mover `trackingMode` sin mirar saldo ni seriales — la otra vía hacia el mismo estado inconsistente. Pasa a rechazarse cuando el ítem tiene saldo o activos, con mensaje que dirige a regularizar con salidas o ajustes (la recepción no vacía saldo; corrección del copy acordada en G1).
4. **Diagnóstico de datos.** Consulta que liste los ítems con la contradicción, para corregirlos antes de activar la regla. En esta instancia el catálogo reporta **un** producto.

> Sin el Track A nada cambia para este producto: la pantalla de salidas seguirá, correctamente, sin ofrecer seriales.

## 5. Diseño — Track B · Seriales múltiples

1. **Contrato.** `StockIssueLineSchema` (`dto/index.ts:1280+`) acepta `serializedAssetIds: string[]`. `serializedAssetId` singular se sigue aceptando y se normaliza a un arreglo de un elemento: no se rompen clientes ni el flujo de despacho ya probado en S1.
2. **Persistencia.** Tabla hija `stock_issue_line_serials` (`id`, `tenant_id`, `line_id` → `stock_issue_lines`, `issue_id` → `stock_issues`, `issue_status` espejo del estado de la cabecera, `serialized_asset_id`, `created_at`), con índice por `line_id` e índice único parcial por (`tenant_id`, `serialized_asset_id`) con predicado `WHERE issue_status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')`. El predicado vive en la columna espejo de la propia hija porque PostgreSQL no admite predicados que referencien otras tablas (ajuste G1 de AI-SR-FULL); `issue_status` se sincroniza en las transiciones de estado de la salida (despacho, cancelación) dentro de la misma transacción. Migración tenant **126** (la última existente es `125_add_supplier_quote_shipping_arrangement`). `StockIssueLine.serializedAssetId` (`packages/database/src/entities/stock-issue-line.entity.ts:34-35`) se conserva durante la transición y se alimenta con el primer serial del grupo para no romper lecturas existentes.
3. **Reglas.** Para ítems serializados, `requestedQty` = `serializedAssetIds.length`. Cada serial mantiene las validaciones de S1 (pertenencia al ítem, bodega origen, estado disponible, sin repetir entre líneas ni entre salidas activas). La reserva y la liberación siguen operando por tupla (ítem, lote, condición), sumando la cantidad del grupo. Las ramas que hoy deciden cantidad por la presencia de `serializedAssetId` (reserva `:180`, liberación `:219`, integridad `:275-279`, despacho `:736-747`) pasan a decidir por el tamaño del grupo; el singular de transición no participa en la aritmética de cantidades (ajuste G1).
4. **Despacho.** `dispatch` recorre los seriales del grupo; la verificación de "cantidad 1 por serial" (`stock-issue.service.ts:269-279` integridad, `:736-740` despacho — cita corregida en G1) se traslada al elemento, no a la línea. El grupo explota en N inputs de ledger (uno por serial, cantidad 1) y los eventos de dominio se emiten por serial, preservando la granularidad del kardex y del `serializedAssetId` en los eventos (ajuste G1).
5. **Lectura.** El detalle devuelve la línea con su arreglo de seriales, para que la edición del borrador reconstruya el grupo sin heurística de reagrupación.

**Alternativa descartada:** persistir N filas de `StockIssueLine` y reagruparlas en cada lectura. Evita la migración, pero obliga a adivinar qué filas formaban un grupo al editar, y esa heurística se rompe en cuanto dos grupos comparten ítem, lote y condición.

## 6. Diseño — Track C · Captura en panel lateral

### 6.1 `StockIssueLineSidePeek`

Sobre `OperationalSidePeek` (`packages/ui/src/components/OperationalSidePeek.tsx:23`; props `open`, `onOpenChange`, `title`, `description`, `eyebrow`, `size`, `busy`, `footer`, `onBeforeClose`). Contenido:

- Cabecera: producto, SKU, unidad.
- **Condición** — solo las que tienen saldo (`listAvailableConditionsForDraftLine`, `stock-issue-line-utils.ts:172-185`). El vocabulario visible se alinea con AI-PROD-UX: hoy `REFURBISHED` se etiqueta "Reacondicionado" (`inventory-labels.ts:108`) y el operador dice "retoma". **Cambiar esa etiqueta es competencia de `system-vocabulary-review`, no de esta fase**; queda como consulta, no como cambio silencioso.
- **Lote** — opciones de `line.lots` filtradas por condición, con la preselección de lote único que ya existe (`stock-issue-line-utils.ts:79-127`).
- **Seriales** — multiselección acotada a ítem + bodega, sobre `SearchableMultiPicker` (`apps/portal/src/components/shared/SearchablePicker.tsx:737`), con los filtros que ya usa `InventoryAssetPicker` (`status: AVAILABLE,AVAILABLE_REFURBISHED`, `excludeIds`). Visible solo si el ítem es serializado.
- **Cantidad** — editable para consumibles; para serializados es el número de seriales elegidos, en modo lectura y explicado.
- Disponible en origen contextual y aviso cuando la cantidad lo excede.
- Pie: "Agregar al borrador" / "Guardar cambios" + Cancelar.

### 6.2 Cómo se abre

- **Clic en el producto** de la lista → abre el panel configurado. Es la vía principal.
- **El checkbox y "Agregar al borrador" se conservan** para la vía rápida por lotes y, sobre todo, para el escaneo de código de barras que auto-marca con una sola coincidencia (`StockIssueComposer.tsx:703-720`; cita corregida en G1). Esa vía agrega con los valores por defecto y deja la línea lista para Modificar. Romper el escaneo sería un retroceso operativo, no una simplificación. El clic de apertura va sobre el **nombre** del producto (botón con target ≥ `min-h-11`), no sobre la fila entera: la fila ya tiene el checkbox de la vía rápida y colisionaría (condición de diseño G1 de AI-PROD-UX).

### 6.3 Tabla del borrador

Columnas: **Producto · Detalle · Cantidad · Unidad · Acciones**. Se retiran los tres controles inline (condición `:315-328`, lote, `InventoryAssetPicker` `:338-354`). "Detalle" muestra condición · lote · seriales como dato, con badge de conteo cuando hay varios. Acciones por fila: **Modificar** (reabre el panel) y Quitar.

Se conservan los class-tokens de tabla operativa que manda la receta §2 (`portalDataTableShellClassName`, `portalDataTableHeadRowClassName`, `portalDataTableCellClassName`, `portalTableRowHoverClassName`) y las cifras en `tabular-nums`.

### 6.4 Layout y paginación

- Reparto de la grilla que no estrangule la captura, y corte en `lg` en vez de `xl` para que la franja 768–1280 px no quede en una sola columna con el layout de escritorio ya activo.
- Sustituir "Cargar más" por el pie de paginación por página que el endpoint implementa, leyendo `meta.capabilities` en vez de decidir el modo en el cliente (ADR-065). Montar el pie equivocado es hallazgo P1 de la disciplina de identidad.

## 7. Criterios de aceptación

| ID | Criterio |
|---|---|
| **CA-S2-01** | Guardar un producto con *Tipo de producto* = "Con serial" y *Control de material* = "Consumible" se rechaza, en el formulario y en la API, con mensaje que nombra ambos campos. |
| **CA-S2-02** | Elegir "Con serial" en el formulario ajusta *Control de material* en el mismo cambio y lo explica. |
| **CA-S2-03** | Cambiar el control de material de un ítem **con saldo o activos** se rechaza con mensaje accionable. |
| **CA-S2-04** | Corregido el producto y recibido con seriales, la salida ofrece **selección múltiple de seriales** acotada a ítem y bodega. |
| **CA-S2-05** | Una línea con N seriales se envía como **una** línea de cantidad N; `POST /inventory/issues` la acepta y reserva N. |
| **CA-S2-06** | Un serial de otro ítem, de otra bodega, no disponible o repetido responde 400 en español. |
| **CA-S2-07** | Clic en el producto abre el panel lateral con condición, lote, seriales y cantidad; el escaneo de código de barras sigue agregando por la vía rápida. |
| **CA-S2-08** | Cada fila del borrador tiene **Modificar**, que reabre el panel con los valores actuales. |
| **CA-S2-09** | La tabla del borrador no tiene columna Condición editable; la condición se lee en el detalle de la fila. |
| **CA-S2-10** | Con más de 25 ítems disponibles en la bodega, la segunda página es alcanzable desde la UI. |
| **CA-S2-11** | `audit-ui.mjs` corre limpio sobre los archivos tocados, o sus hallazgos quedan justificados. |

## 8. Impacto

- **Multi-tenant:** la tabla nueva lleva `tenant_id` y vive en el schema del tenant, como el resto del módulo. La migración 126 se aplica por tenant.
- **Seguridad / RBAC:** sin permisos nuevos.
- **Escala:** una línea con N seriales sustituye N líneas; reduce filas de `stock_issue_lines` y viajes de validación. La tabla hija se consulta por `line_id` indexado.
- **Regulación:** sin impacto directo; la trazabilidad por serial refuerza el soporte probatorio de comodato y activos en sitio de cliente.
- **PII:** ninguna.
- **Compatibilidad:** `serializedAssetId` singular sigue aceptándose; ningún cliente existente se rompe en esta fase.

## 9. Deuda declarada

| Severidad | Ítem |
|---|---|
| **Alta** | `itemKind` y `trackingMode` se solapan conceptualmente y ambos se muestran al operador como campos editables. Unificarlos o derivar uno del otro requiere **ADR propio**; esta fase solo impide la combinación inválida. |
| Media | Recepciones (`GoodsReceiptPanel.tsx:520-531`) y traslados siguen capturando lote y serial como texto libre, inconsistente con el picker de salidas. |
| Media | `StockIssueLine.serializedAssetId` queda como campo de transición junto a la tabla hija; su retiro necesita una fase de limpieza. |
| Baja | `useMinWidth` duplicado en `StockIssueComposer.tsx:188` y `PurchaseRequestComposer.tsx:83`. |
| Baja | La etiqueta de `REFURBISHED` ("Reacondicionado") no coincide con el término que usa la operación ("retoma"); pendiente de `system-vocabulary-review`. |

## 10. Riesgo principal

La migración 126 y el cambio de forma de la línea tocan reserva, despacho y kardex. Debe revisarla AI-DATA-ENG antes de escribirla, y la compatibilidad con el campo singular es la red de seguridad durante la transición.

---

## 11. Registro G1 — review cruzado (2026-09-05)

**Veredicto: GO CON AJUSTES**, todos incorporados en esta versión. Productor: AI-EM-ARCH. Revisores: AI-SR-FULL (factibilidad) y AI-PROD-UX (viabilidad UX + copy). El gate no se autofirma (protocolo §3).

| # | Ajuste | Origen | Dónde quedó |
|---|---|---|---|
| 1 | Tabla hija lleva `issue_id` + `issue_status` espejada; el índice único parcial usa predicado sobre la columna propia (PostgreSQL no admite predicados inter-tabla) | AI-SR-FULL (hallazgo bloqueante de diseño) | §5.2 |
| 2 | La aritmética de cantidades (reserva, liberación, integridad, despacho) keyea en el tamaño del grupo, no en la presencia del singular | AI-SR-FULL (hallazgo bloqueante cuantitativo) | §5.3 |
| 3 | Despacho explota el grupo en N inputs de ledger y eventos por serial | AI-SR-FULL | §5.4 |
| 4 | `safeParse` merged de `update()` debe incluir `itemKind` para que A1 aplique en edición | AI-SR-FULL | Prompt Maestro §A1 |
| 5 | Citas obsoletas corregidas (`:571-575` → `:269-279`/`:736-740`; escaneo `:374-385` → `:703-720`) | Ambos revisores | §5, §6.2, prompts |
| 6 | Guía proactiva del maestro en ambas direcciones (elegir "Control de material" serializado también ajusta `itemKind`) | AI-PROD-UX | Prompt Maestro §A2 |
| 7 | El clic de apertura del panel va sobre el nombre del producto (botón ≥ `min-h-11`), no sobre la fila | AI-PROD-UX | §6.2, Prompt FE §C2 |
| 8 | Copy exacto de los 4 mensajes, aprobado contra `inventory-labels.ts`; dirección de regularización de A3 corregida a "salidas o ajustes" (decisión AI-EM-ARCH sobre observación de AI-PROD-UX; registrar en el informe de fase) | AI-PROD-UX + AI-EM-ARCH | Prompt Maestro, Prompt FE |
