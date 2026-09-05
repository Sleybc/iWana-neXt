# PROMPT DE EJECUCIÓN — MOD12 Salidas · Picking y seriales (Backend) — Fase S1

**Versión:** 1.0
**Fecha:** 2026-09-05
**Módulo:** MOD12 Inventario / SCM — Existencias
**Fase:** S1 (track BE)
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Agente destinatario:** **AI-SR-FULL** (Principal Backend Engineer)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*

---

## 0. Contratos congelados

| Contrato | Ruta y versión | Estado |
|---|---|---|
| **Contrato de API tipado** | `packages/shared/src/contracts/inventory/stock-issue-picking.ts` — definido en [SPEC Fase S1 §5.1](../specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md) v1.0 | **CONGELADO** — lo produce este track en su primer commit y no cambia después sin re-sync coordinado por AI-EM-ARCH |
| Contrato de componente | No aplica a este track | — |

**Regla de paralelismo:** AI-FE-PLATFORM trabaja en simultáneo contra este contrato. Cualquier desviación (campo renombrado, tipo cambiado, cantidad numérica en vez de `string`) es un evento de re-sync: se emite `[BLOQUEO]` a AI-EM-ARCH **antes** de aplicarla. No se parchea en silencio.

## 1. Objetivo exacto de la fase

- **Resultado esperado:** el backend puede responder, en una sola consulta paginada, qué material hay disponible en una bodega de origen con su cantidad por condición, sus lotes y si tiene seriales; y rechaza toda salida de un ítem serializado que no identifique el activo concreto.
- **Lo que sí entra:** B1 (endpoint `pickable-items`), B2 (status múltiple en `GET /inventory/assets`), B3 (validación de integridad de serial en `create`/`update` de salidas), el contrato compartido y sus tests.
- **Lo que no entra:** frontend, recepciones, traslados, cambios de esquema o migraciones, endpoint de lotes, valoración/costeo, y cualquier reforma de `GET /inventory/balances`.

## 2. Artefactos de entrada obligatorios

- **Spec de la fase:** [`docs/specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md`](../specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md) v1.0 — §5.1 y §5.2 son normativos para este track.
- **PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS v1.0](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md) *(Aprobado)*.
- **ADRs:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md) *(Aprobado)*, [ADR-085](../adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md) *(Aprobado)*, [ADR-055](../adrs/ADR-055-Reservas-Efectivas-Disponible-Comprometido.md).
- **Gobernanza:** `AGENTS.md`, `.github/instructions/*.instructions.md` aplicables a `apps/api/**`, `.agents/skills/INDEX.md`.
- **Artefactos faltantes detectados:** no existe OpenAPI de inventario en `apps/api/openapi/` (solo `tasks-execution-orders.v1.json`); el contrato de inventario se documenta vía decoradores Swagger + `inventory.swagger.spec.ts`. **Seguir ese patrón, no crear un JSON nuevo.**

## 3. Instrucciones

### B0 · Contrato compartido (primero, habilita el track FE)

Crear `packages/shared/src/contracts/inventory/stock-issue-picking.ts` con las tres interfaces de §5.1 del spec, reexportarlo desde `contracts/inventory/index.ts` y commitear **antes** de seguir, para que AI-FE-PLATFORM pueda derivar sus mocks del tipo real y no de tipos paralelos.

### B1 · `GET /api/v1/inventory/issues/pickable-items`

1. Handler en `InventoryController` (`apps/api/src/modules/inventory/inventory.controller.ts`), colocado junto a `listIssues` (`:551`); mismos guards y permiso `inventory.stock.read`; decoradores Swagger completos como los endpoints vecinos.
2. Query schema zod en `apps/api/src/modules/inventory/dto/index.ts`, siguiendo el patrón de `ListStockBalancesQuerySchema` (`:1160`) y reutilizando `inventoryHybridPaginationZod`: `sourceLocationId` (uuid, requerido), `q?` (máx 200), `scope?: 'with-stock' | 'catalog'` (default `'with-stock'`), `cursor?`, `limit?` (default 25, máx 100).
3. Lógica en un servicio nuevo `StockIssuePickingService` (`services/stock-issue-picking.service.ts`), registrado en `InventoryModule`. **Una sola** consulta agregada: `stock_balances` ⨝ `inventory_items` ⨝ `inventory_categories` ⨝ `stock_lots`, agrupada por ítem y condición. `scope=catalog` invierte el join (LEFT desde `inventory_items`) y devuelve `totalAvailable: '0'` para lo que no tiene saldo.
4. Disponible = `quantityOnHand − quantityReserved` reutilizando `computeAvailable` (`services/stock-balance.service.ts:61-63`) al mapear. **No** reimplementar la resta como regla nueva.
5. `q` filtra server-side por `sku/name/brand/model/barcode`, reutilizando `escapePickerLikePattern` / `normalizePickerQuery` de `inventory-item.service.ts:721-728`.
6. `availableSerialCount`: subconsulta a `serialized_assets` por `inventory_item_id + current_location_id + current_status IN (AVAILABLE, AVAILABLE_REFURBISHED)`.
7. Orden canónico: `totalAvailable DESC, name ASC`. Paginación por cursor coherente con ese orden.
8. Todo bajo `runInTenantSchema` y con `tenant_id` en **cada** tabla del join.

### B2 · Status múltiple en `GET /inventory/assets`

`ListSerializedAssetsQuerySchema` (`dto/index.ts:1015-1021`) pasa a aceptar lista separada por comas (`status=AVAILABLE,AVAILABLE_REFURBISHED`), **manteniendo compatible el valor único**. Ajustar `SerializedAssetService.list` (`services/serialized-asset.service.ts:150`) a `IN (...)`. No se crea endpoint nuevo.

### B3 · Integridad de la salida (bloqueante)

En `StockIssueService.create` (`services/stock-issue.service.ts:301`) y en el camino de `update` que reemplaza líneas, **dentro de la transacción existente**:

1. Cargar los `InventoryItem` de las líneas en **un** `findBy({ id: In(ids) })`. Prohibido un query por línea.
2. `trackingMode ∈ {SERIALIZED, FIXED_ASSET}` → `serializedAssetId` obligatorio. `BadRequestException` en español: `"El ítem {sku} exige seleccionar el activo serializado que sale."`
3. Con `serializedAssetId` presente, validar: existe en el tenant; `inventoryItemId === line.itemId`; `currentLocationId === sourceLocationId`; `currentStatus ∈ {AVAILABLE, AVAILABLE_REFURBISHED}`. Un mensaje distinto y accionable por cada fallo.
4. `requestedQty` debe ser 1 cuando hay serial — hoy solo se valida en `dispatch` (`:571-575`); adelantarlo a la creación **sin** eliminar la verificación de despacho.
5. Rechazar seriales repetidos entre líneas del mismo issue y seriales ya comprometidos por otra salida en estado no terminal.

**Antes de dar por buena la fase:** inventariar specs, factories y seeds que hoy crean salidas serializadas sin serial y **corregirlos**. Relajar la validación para que un test pase es defecto bloqueante.

## 4. Restricciones no negociables

- Modulith: sin acceso directo a tablas de otro módulo, sin imports circulares. Todo dentro de `modules/inventory`.
- Multi-tenant por schema con tenant desde JWT verificado; `runInTenantSchema` en toda consulta nueva.
- Cantidades como `string` decimal en el contrato de salida — no `number`.
- Sin migraciones ni cambios de esquema en esta fase. Si aparece la necesidad, es `[BLOQUEO]`.
- Sin PII ni credenciales en fixtures.
- Versiones de stack: las del baseline; no fijarlas en este track.
- Mensajes de error de cara al usuario **en español**.

## 5. Entregables técnicos obligatorios

- `packages/shared/src/contracts/inventory/stock-issue-picking.ts` + reexport.
- Endpoint B1 con su DTO, servicio y decoradores Swagger.
- B2 aplicado en schema + servicio.
- B3 aplicado en `create` y `update`.
- Tests: unitarios del servicio de picking, HTTP spec del endpoint, spec de aislamiento multi-tenant, y los cinco rechazos de B3.
- Actualización de `inventory.swagger.spec.ts` con el endpoint nuevo.

## 6. Entregables documentales obligatorios

- Informe de fase en `docs/informes/` (sección BE), con conteo real de tests.
- Evidencia de calidad en `docs/quality/`.
- Desvíos y supuestos documentados como tales.
- Si aparece bloqueo técnico: decisión stop/go escrita, con `[BLOQUEO]` dirigido a AI-EM-ARCH.

## 7. Criterios de aceptación

- **CA-S1-01 (parcial BE):** `GET /inventory/issues/pickable-items?sourceLocationId=…` sin `q` devuelve los ítems con disponible > 0 de esa bodega, con `meta.total` correcto.
- **CA-S1-02 (BE):** cada fila trae `sku`, `name`, `categoryName`, `unitOfMeasure`, `trackingMode` y `totalAvailable` reales.
- **CA-S1-03:** `availability[]` desglosa `NEW`, `REFURBISHED` y `DAMAGED` con saldo propio.
- **CA-S1-06:** `POST /inventory/issues` responde 400 en español ante: línea serializada sin `serializedAssetId`; serial de otro ítem; serial en otra bodega; serial no disponible; serial duplicado entre líneas.
- **CA-S1-07 (BE):** `lots[]` trae `lotNumber` y `expiryDate` reales, no el UUID.
- **CA-S1-08:** un tenant no ve material de otro a través del endpoint nuevo (spec de aislamiento).

## 8. Criterio de stop/go

**Detenerse inmediatamente y emitir `[BLOQUEO]` a AI-EM-ARCH si:**

- El agregado por ítem × condición × lote exige una migración o un índice nuevo para rendir.
- Corregir los fixtures de B3 obliga a cambiar el comportamiento de un flujo cerrado (órdenes de ejecución, custodia de ejecutor, comodato).
- El contrato de §5.1 resulta insuficiente para lo que el frontend necesita — se versiona y se notifica, nunca se altera en silencio.

**GO cuando:** las suites de `apps/api` relativas a inventario pasan con **conteo real reportado** (no un verde cacheado de `turbo`, ni `--passWithNoTests`), `pnpm lint` y `pnpm typecheck` están limpios en `api` y `shared`, y los seis criterios de §7 están evidenciados.
