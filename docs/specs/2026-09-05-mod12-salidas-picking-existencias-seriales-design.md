# SPEC — MOD12 Existencias · Salidas: picking con existencias reales y seriales — Fase S1

**Versión:** 1.0
**Estado:** Diseño propuesto — G1 pendiente de review cruzado (AI-SR-FULL factibilidad + AI-PROD-UX viabilidad UX)
**Fecha:** 2026-09-05
**Módulo:** MOD12 Inventario / SCM — Existencias
**Autor:** AI-EM-ARCH (modos Product Architect + Architect + Orchestrator)
**Superficie:** `/dashboard/inventory?tab=issues` → Crear salida
**PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS v1.0](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md) *(Aprobado)*
**ADRs:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md) *(Aprobado)* · [ADR-085](../adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md) *(Aprobado)* · [ADR-055](../adrs/ADR-055-Reservas-Efectivas-Disponible-Comprometido.md) *(reservas efectivas: base del disponible)*
**PRD/HLD SCM:** [PRD-MOD12-INVENTARIO-SCM](../prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md) *(v1.1 en revisión — se cita el baseline v1.0 aprobado)* · [HLD-MOD12-INVENTARIO-SCM](../hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md) *(v1.1 en revisión — ídem)*
**Prompts:** [BE](../prompts/PROMPT-MOD12-SALIDAS-PICKING-BE-v1.0.md) · [FE](../prompts/PROMPT-MOD12-SALIDAS-PICKING-FE-v1.0.md)
**Plan:** [plan de orquestación](../plans/2026-09-05-mod12-salidas-picking-existencias-seriales.md)
**Requiere ADR:** No — no cambia boundary ni stack. Sí **endurece** la validación de `POST /inventory/issues`; queda registrado aquí y en el informe de fase.
**Requiere CTO:** No — las tres decisiones de producto fueron tomadas por el CTO el 2026-09-05 (§4).

---

## 1. Problema

Al crear una salida de inventario el operador **no ve material**:

1. La pestaña **"Con material"** marca `(0)` aunque la bodega tenga existencias.
2. La pestaña **"Catálogo"** solo devuelve resultados tras escribir 2 caracteres, y los devuelve **sin cantidad disponible, sin categoría y sin unidad reales**.
3. Al pasar la línea al borrador, la columna **"Lote / serial" queda en `—`**: un equipo serializado (p. ej. `CFO-SER-ROGPN-TPL-XC220`, Router Onu Gpon) puede despacharse **sin que nadie elija el serial concreto**.

El punto 3 no es un defecto de UX sino de **integridad de inventario**: se compromete stock serializado sin trazabilidad del activo, contra el ciclo de vida que ADR-048 declara para el bounded context.

## 2. Causa raíz (verificada en código)

| # | Causa | Evidencia |
|---|---|---|
| **C1** | "Con material" se calcula **en cliente** sobre `knownItems`, que arranca vacío: `InventoryClient` no pasa `items` a `StockIssuesWorkspace` (`apps/portal/src/components/inventory/InventoryClient.tsx:2888-2900`) y el único relleno es un **N+1 acotado a 40 ids** (`StockIssueComposer.tsx:445-463`). `buildStockIssueSuggestions` itera `input.items`, **no** los balances (`stock-issue-suggestions.ts:38-48`) → sin ítems, el contador es `(0)`. |
| **C2** | El catálogo usa el picker genérico `GET /inventory/items/search`, cuyo contrato es `{id,label,sublabel}` (`apps/api/src/modules/inventory/services/inventory-item.service.ts:741-748`). Por eso la tabla **hardcodea** `categoryName: '—'` y `unitLabel: 'unidad'` (`StockIssueComposer.tsx:246-260`), no filtra por bodega y exige `q.length >= 2` (`:387-394`). El disponible se cruza en cliente contra balances truncados a 100 y **filtrando solo condición `NEW`** (`stock-issue-balance-utils.ts:97-103`). |
| **C3** | El selector de serial depende de `serialized = isSerializedInventoryItem(itemsById.get(line.itemId))` (`StockIssueDraftLinesTable.tsx:139`). Un ítem agregado desde "Catálogo" **nunca** está en `knownItems` → `serialized = false` → rama `—` (`:269-271`). El backend no cubre el hueco: `StockIssueService.create` (`stock-issue.service.ts:301-372`) **jamás consulta `trackingMode`** ni valida pertenencia/ubicación del activo; la única regla de serial vive en `dispatch` (`:571-575`). |

## 3. Objetivo

Elegida la bodega de origen, el operador ve de inmediato el material con su **cantidad disponible por condición**; puede buscar en todo el catálogo con **datos reales** (categoría, unidad, disponible); y un ítem serializado **no puede salir sin serial**, ni desde la UI ni por API.

## 4. Decisiones de producto (CTO, 2026-09-05)

| # | Decisión | Consecuencia de diseño |
|---|---|---|
| **D1** | "Con material" **precarga solo lo que tiene existencias** en la bodega de origen, paginado desde el servidor. | El conteo del tab usa `meta.total`, no el largo del array. El catálogo completo sigue accesible por la segunda pestaña. |
| **D2** | La exigencia de serial es **bloqueante en backend y UI**. | `POST`/`PATCH /inventory/issues` rechazan una línea de ítem `SERIALIZED`/`FIXED_ASSET` sin `serializedAssetId`. Cerrar el hueco solo en la UI dejaría expuesto a cualquier otro cliente de la API. |
| **D3** | `REFURBISHED` y `DAMAGED` **son despachables**, con la condición visible por línea. | El disponible se expone **agrupado por condición**; desaparece el filtro silencioso a `NEW` del cliente, que hoy oculta existencias reales y explica parte del `0`. |

## 5. Diseño

### 5.1 Contrato congelado (§3.5 del perfil AI-EM-ARCH)

Nuevo archivo `packages/shared/src/contracts/inventory/stock-issue-picking.ts`, reexportado desde `contracts/inventory/index.ts` junto a `executor-custody.ts`:

```ts
export interface StockIssuePickableAvailability {
  condition: StockBalanceCondition;          // NEW | REFURBISHED | DAMAGED
  quantityOnHand: string;
  quantityReserved: string;
  available: string;
}

export interface StockIssuePickableLot {
  lotId: string;
  lotNumber: string;
  expiryDate: string | null;
  condition: StockBalanceCondition;
  available: string;
}

export interface StockIssuePickableItem {
  itemId: string;
  sku: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  unitOfMeasure: string;                     // código canónico ADR-085
  trackingMode: InventoryTrackingMode;
  assetControlled: boolean;
  availability: StockIssuePickableAvailability[];
  totalAvailable: string;
  lots: StockIssuePickableLot[];
  availableSerialCount: number;
}
```

Cantidades como **`string` decimal**, coherente con `StockBalanceRecord` (`contracts/inventory/executor-custody.ts:45`) y con `numeric(12,2)` de `packages/database/src/entities/stock-balance.entity.ts:53-57`. Un cambio de este contrato es el **único** evento que fuerza re-sync de los dos tracks.

### 5.2 Backend

**B1 — `GET /api/v1/inventory/issues/pickable-items`** (nuevo, en `InventoryController` junto a `listIssues`, `inventory.controller.ts:551`; permiso `inventory.stock.read`).

- Query zod en `modules/inventory/dto/index.ts`, reutilizando `inventoryHybridPaginationZod` igual que `ListStockBalancesQuerySchema` (`:1160`): `sourceLocationId` (uuid, requerido), `q?` (máx 200), `scope?: 'with-stock' | 'catalog'` (default `with-stock`), `cursor?`, `limit?` (default 25, máx 100).
- Una **sola** consulta agregada: `stock_balances` ⨝ `inventory_items` ⨝ `inventory_categories` ⨝ `stock_lots`, agrupada por ítem y condición. `scope=catalog` invierte el join (LEFT desde `inventory_items`) y devuelve `totalAvailable: '0'` para lo que no tiene saldo.
- Disponible = `quantityOnHand − quantityReserved`, reutilizando `computeAvailable` (`services/stock-balance.service.ts:61-63`). No duplicar la resta en SQL ad hoc si puede aplicarse el helper al mapear.
- `q` filtra server-side por `sku/name/brand/model/barcode` con el mismo `escapePickerLikePattern` de `searchForPicker` (`inventory-item.service.ts:721-728`).
- `availableSerialCount`: subconsulta a `serialized_assets` por `inventory_item_id + current_location_id + current_status IN (AVAILABLE, AVAILABLE_REFURBISHED)`.
- Orden canónico servidor: `totalAvailable DESC, name ASC`.
- Aislamiento por `runInTenantSchema` + `tenant_id` en cada tabla, como el resto del servicio.

**B2 — Seriales: reutilizar, no crear.** `GET /inventory/assets` (`inventory.controller.ts:389`) ya filtra `itemId + locationId + status`. Único cambio: `ListSerializedAssetsQuerySchema.status` (`dto/index.ts:1015-1021`) pasa a aceptar **lista separada por comas** (`AVAILABLE,AVAILABLE_REFURBISHED`), manteniendo compatible el valor único. **No** se crea endpoint de seriales ni de lotes.

**B3 — Integridad de la salida (D2).** En `StockIssueService.create` (`:301`) y en el `update` que reemplaza líneas:

1. Cargar los `InventoryItem` de las líneas en **un** `findBy({ id: In(ids) })` dentro de la transacción.
2. `trackingMode ∈ {SERIALIZED, FIXED_ASSET}` → `serializedAssetId` obligatorio. Mensaje en español: "El ítem {sku} exige seleccionar el activo serializado que sale."
3. Con `serializedAssetId`: el activo existe en el tenant, `inventoryItemId === line.itemId`, `currentLocationId === sourceLocationId`, `currentStatus ∈ {AVAILABLE, AVAILABLE_REFURBISHED}`.
4. `requestedQty` debe ser 1 — hoy solo se valida en `dispatch` (`:571-575`); se adelanta a la creación.
5. Ningún serial repetido entre líneas del mismo issue, ni comprometido por otra salida no terminal.

### 5.3 Frontend

Archivo eje: `apps/portal/src/components/inventory/StockIssueComposer.tsx`.

**F1 — Sustituir la carga actual.** Se retira el efecto `listBalances(100) + listAssets(100) + N+1 getItem(40)` (`:426-475`) y el cálculo cliente `buildStockIssueSuggestions` (`:221-231`); el efecto sobre `sourceLocationId` pasa a llamar al endpoint B1. El buscador usa el mismo endpoint con `q` + debounce 300 y `scope` según la pestaña; **se elimina el mínimo de 2 caracteres** cuando ya hay bodega de origen. `catalogRows` (`:246-260`) deja de hardcodear categoría y unidad. Los empty states (`:749-795`) pasan a "Selecciona la bodega de origen" / "Sin material en esta bodega".

**F2 — Línea de borrador.** La línea del draft guarda `trackingMode`, `unitOfMeasure`, `lots[]` y `availability[]` al agregarse (`stock-issue-draft.ts:79-115`); el flag `serialized` sale de ahí y **no** de `knownItems` — es la corrección directa de C3. El serial se elige con un picker server-side por ítem+bodega reutilizando `InventoryAssetPicker.tsx` (extendido con `itemId`/`locationId`); el lote muestra `lotNumber` real y vencimiento en vez de `lotId.slice(0,8)` (`stock-issue-line-utils.ts:181-183`); la condición es un selector limitado a las que tienen `available > 0` (D3). `handleSubmit` (`:585-624`) bloquea el envío si falta el serial de una línea serializada o si su cantidad ≠ 1.

**F3 — Limpieza.** `StockIssueFormDrawer.tsx` está muerto (solo lo referencia su propio spec): se elimina junto a él. Se retira el prop `issueItemFrequency` si el orden pasa al servidor.

**Restricción de UI:** sin tokens ni componentes nuevos. Se reutilizan `PortalSectionHeader`, `PurchaseSelectionBar`, `CreateModeSummaryFooter`, `SearchablePicker`, `InventoryAssetPicker`. Cualquier estado visual inexistente va por el carril rápido de AI-DS-OWNER.

## 6. Criterios de aceptación

| ID | Criterio |
|---|---|
| **CA-S1-01** | Elegida la bodega de origen y **sin escribir nada**, la pestaña "Con material" lista los ítems con disponible > 0 y su cantidad; el contador refleja `meta.total` del servidor. |
| **CA-S1-02** | La tabla de resultados muestra **categoría, unidad y disponible reales**; ningún valor hardcodeado. |
| **CA-S1-03** | El disponible se presenta por **condición**; existencias `REFURBISHED`/`DAMAGED` dejan de estar ocultas. |
| **CA-S1-04** | Un ítem serializado agregado **desde la pestaña Catálogo** muestra el selector de serial en la columna "Lote / serial". |
| **CA-S1-05** | "Crear salida" queda bloqueado mientras una línea serializada no tenga serial, con mensaje explícito. |
| **CA-S1-06** | `POST /api/v1/inventory/issues` responde **400 en español** ante línea serializada sin `serializedAssetId`, serial de otro ítem, serial en otra bodega, serial no disponible o serial duplicado entre líneas. |
| **CA-S1-07** | Las líneas con lote muestran `lotNumber` legible y vencimiento; el disponible de la línea se recalcula por tupla (ítem, lote, condición). |
| **CA-S1-08** | Aislamiento multi-tenant verificado sobre el endpoint nuevo: un tenant no ve material de otro. |

## 7. Impacto

- **Multi-tenant:** el endpoint nuevo opera bajo `runInTenantSchema` con `tenant_id` en todas las tablas del join; sin acceso cruzado. Test de aislamiento obligatorio (CA-S1-08).
- **Seguridad / RBAC:** sin permisos nuevos; se reutiliza `inventory.stock.read` (lectura) y `inventory.stock.manage` (creación).
- **Escala:** se elimina un N+1 de hasta 40 llamadas por selección de bodega y una descarga de 100 balances + 100 activos por render; queda **una** consulta paginada. Es una mejora neta a escala de miles de tenants. Los índices parciales por tupla de `stock_balances` (`stock-balance.entity.ts:11-26`) cubren el filtro por bodega; verificar el plan de ejecución antes de cerrar G6.
- **Regulación:** sin impacto directo. La trazabilidad de serial refuerza el soporte probatorio de comodato y activos en sitio de cliente, sin introducir tratamiento de PII nuevo.
- **PII:** ninguna. El endpoint no expone datos de suscriptor.

## 8. Alternativas descartadas

| Alternativa | Motivo del descarte |
|---|---|
| Extender `GET /inventory/items/search` con `locationId` y campos de stock | Su `PickerSearchResponseDto` (`{id,label,sublabel}`) es un contrato **genérico** compartido por todos los pickers del producto; enriquecerlo para un caso lo contamina para el resto. |
| Extender `GET /inventory/balances` con `include=item` | Resuelve la cantidad pero no la búsqueda server-side por SKU/nombre ni el acceso al catálogo sin saldo; deja la mitad del defecto abierta. |
| Precargar el catálogo completo en el cliente y cruzarlo con balances | Es la arquitectura que ya falló (C1/C2): no escala, y el truncamiento silencioso a 40/100 es precisamente el origen del `(0)`. |
| Exigir el serial solo en la UI | Deja el hueco de integridad abierto para cualquier otro cliente de la API. Descartado por D2. |

## 9. Deuda declarada

| Severidad | Ítem |
|---|---|
| Baja | El boost por frecuencia de uso del ítem se pierde al mover el ordenamiento al servidor; recuperarlo exige persistir la frecuencia en backend. |
| Baja | `GET /inventory/balances` sigue devolviendo entidades crudas sin `available` calculado; esta fase no lo cambia, solo deja de depender de él en salidas. |
| Media | Recepciones (`GoodsReceiptPanel.tsx:509-536`) y traslados (`StockTransferDialog.tsx:111`) siguen capturando lote y serial como **texto libre**. La asimetría con salidas queda abierta para una fase posterior. |

## 10. Riesgo principal

El endurecimiento B3 puede romper specs o seeds que hoy crean salidas serializadas sin serial. Deben **inventariarse y corregirse en la misma fase**; silenciar la validación para que un test pase es defecto bloqueante y motivo de stop.
