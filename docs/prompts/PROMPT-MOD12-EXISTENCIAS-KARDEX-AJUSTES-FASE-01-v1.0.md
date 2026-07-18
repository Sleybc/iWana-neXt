# PROMPT - MOD12 Existencias — Kardex, ajustes y vista Existencias — Fase 01

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Convencion documental general: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`

## Modulo

- Nombre: Inventario / SCM — submódulo Existencias (stock)
- Codigo: MOD12
- Fase: 01 (Kardex, ajustes y vista Existencias)
- Version: 1.0
- Fecha: 2026-07-18
- Generado por: AI-EM-ARCH (Engineering Manager)
- Destinatario: Sr. Dev Fullstack (AI-SR-FULL backend + AI-FE-PLATFORM portal)
- Nombre de archivo destino: `PROMPT-MOD12-EXISTENCIAS-KARDEX-AJUSTES-FASE-01-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** el tenant puede consultar su kardex de movimientos de stock, registrar ajustes manuales de inventario con razón tipificada, y operar una nueva pestaña "Existencias" en `/dashboard/inventory` con tres subvistas (Por producto / Por bodega / Kardex); la pestaña "Bodegas" queda reducida a gestión de bodegas.
- **Lo que sí entra:** `GET /inventory/movements` (+ `GET /inventory/movements/:id`), `POST /inventory/adjustments`, enum compartido `StockAdjustmentReason`, pestaña `stock` en el portal con sus componentes, reubicación de `StockLocationsMatrix`, redirect de compatibilidad de deep-links, tests y Swagger.
- **Lo que no entra:** conteos físicos, reservas, costeo/valoración, reorden automático (Fases 2-4 del PRD); ajustes sobre ítems serializados; migraciones de base de datos (no se requieren — decisión D1 del PRD); cambios en el flujo de compras.

## 2. Artefactos de entrada obligatorios

- PRD del modulo: `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` (contrato de API congelado en su sección 7; decisiones D1-D6 en anexo B)
- PRD padre: `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md`
- HLD del modulo: `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md` (no hay HLD nuevo: la fase no crea boundary ni entidad)
- ADRs aplicables: ADR-048 (bounded context Inventario/SCM), ADR-016 (regla de completitud)
- Prompt arquitectonico origen: este documento
- Skills del repo a aplicar: `nestjs-expert`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `tailwind-patterns`, `system-vocabulary-review`, `testing-patterns`, `openapi-spec-generation`
- Artefactos faltantes detectados: ninguno

## 3. Instrucciones para Sr. Dev Fullstack

> **Precaución transversal:** hay trabajo de Compras Fase 07 sin commitear que comparte archivos con esta fase (`apps/api/src/modules/inventory/dto/index.ts`, `inventory.module.ts`, `apps/api/src/modules/inventory/tests/inventory.controller.http.spec.ts`, `apps/portal/src/components/inventory/InventoryClient.tsx` y su spec). En esos archivos **solo se permite append** (nuevos exports, nuevos describes, una línea de provider); toda la lógica nueva vive en archivos nuevos; la integración en `InventoryClient.tsx` se hace al final.

### 3.1 Backend (orden de implementación)

1. **Enum compartido** — nuevo `packages/shared/src/enums/inventory/stock-adjustment-reason.enum.ts`:
   `CYCLE_COUNT`, `DAMAGE`, `INITIAL_LOAD`, `CORRECTION`, `LOSS`, `FOUND`, `OTHER`. Exportar en el barrel `packages/shared/src/enums/inventory/index.ts`. Compilar `@iwana/shared` antes de usar en el API.
2. **DTOs** — append al final de `apps/api/src/modules/inventory/dto/index.ts` reutilizando los helpers existentes `optionalUuidLike()` y `optionalTrimmedString()`:
   - `ListStockMovementsQuerySchema`: `itemId?`, `locationId?` (uuid), `origin?` (`z.nativeEnum(StockMovementOrigin)`), `dateFrom?`/`dateTo?` (`z.coerce.date()`), `search?` (trim, máx. 40, busca por `movementNumber`), `page`/`limit` con el patrón `z.preprocess` vigente (default 1/20, `limit` ≤ 100). Clase `ListStockMovementsQueryDto` con `@ApiPropertyOptional` + `@Allow`.
   - `CreateStockAdjustmentSchema`: `itemId` (uuid), `locationId` (uuid), `lotId?`, `condition?` (`StockBalanceCondition`), `quantityDelta` (number, refine ≠ 0 con mensaje "La cantidad del ajuste no puede ser cero."), `reason` (`z.nativeEnum(StockAdjustmentReason)`), `notes?` (máx. 4000), `idempotencyKey` (trim, min 8, máx. 160, **requerido** — decisión D6). Clase `CreateStockAdjustmentDto`.
3. **Servicio de consulta del kardex** — nuevo `apps/api/src/modules/inventory/services/stock-movement-query.service.ts` (`StockMovementQueryService`, patrón de `StockBalanceService`: `@InjectDataSource`, `TenantContext.getOrThrow()`, `runInTenantSchema`):
   - `list(query)` → `{ data: StockMovementKardexRecord[]; total; page; limit }`. QueryBuilder sobre `StockMovement` filtrando `tenant_id`; `itemId`/`locationId` vía `EXISTS` (subquery a `stock_movement_lines`); `origin` exacto; `dateFrom`/`dateTo` sobre `created_at`; `search` → `movement_number ILIKE :search%`; orden `created_at DESC, movement_number DESC`; `getCount()` + `skip/take`. Segunda query `manager.find(StockMovementLine, { movementId: In(ids) })` y enriquecimiento en memoria con `InventoryItem` (name, sku), `StockLocation` (name, code) y `StockLot` (lotNumber) cargados por `In(...)`. Si `origin === ADJUSTMENT`, mapear `adjustmentReason = originRefId as StockAdjustmentReason`.
   - `getById(id)` → cabecera + líneas enriquecidas; `NotFoundException` si no existe.
   - Shape de respuesta: interfaces `StockMovementKardexRecord` / `StockMovementKardexLine` exactamente como el contrato de la sección 7 del PRD (cantidades `numeric` como string; el portal formatea con `formatInventoryQuantity`).
4. **Ajustes** — añadir `recordAdjustment(input: CreateStockAdjustmentInput, actor: JwtPayload)` a `apps/api/src/modules/inventory/services/stock-ledger.service.ts`, siguiendo el patrón exacto de `recordSale` (~línea 662):
   - Transacción propia (`runInTenantSchema` + `withTransaction`); validar que el ítem existe y que `trackingMode !== InventoryTrackingMode.SERIALIZED` (400 con mensaje en español dirigiendo a retorno/baja — decisión D3); validar la bodega (reusar el `findLocation` privado).
   - Llamar `recordMovementWithManager` con: `origin: StockMovementOrigin.ADJUSTMENT`, `originContext: 'inventory.adjustment'`, `originRefId: input.reason`, `idempotencyKey: input.idempotencyKey`, `notes: input.notes`, una línea `{ itemId, locationId, lotId, condition, quantity: input.quantityDelta }` (delta con signo). El saldo no negativo y el replay idempotente ya los maneja la infraestructura existente (decisiones D4/D6).
5. **Controller** — append en `apps/api/src/modules/inventory/inventory.controller.ts` (declarar `GET 'movements'` **antes** de `GET 'movements/:id'`; no colisiona con los `POST /movements/*` existentes):
   - `GET /inventory/movements` — `@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)`, `@ApiOperation({ summary: 'Consultar kardex de movimientos de stock' })`.
   - `GET /inventory/movements/:id` — mismos roles, `ParseUUIDPipe`, summary 'Obtener detalle de movimiento de stock'.
   - `POST /inventory/adjustments` — **solo `UserRole.ADMIN`** (decisión D2), summary 'Registrar ajuste manual de inventario', `@CurrentUser()` como actor.
6. **Módulo** — registrar `StockMovementQueryService` en providers de `apps/api/src/modules/inventory/inventory.module.ts` (una línea, sin reordenar).

### 3.2 Frontend portal (orden de implementación)

1. **API client** — `apps/portal/src/lib/api-client.ts`: tipos `StockMovementKardexLineRecord`, `StockMovementKardexRecord`, `PaginatedStockMovements`, `ListStockMovementsParams`, `CreateStockAdjustmentDto`; métodos `inventoryApi.listMovements(params?, tenantSlug?)`, `getMovement(id, tenantSlug?)`, `createAdjustment(dto, tenantSlug?)` (devuelve el tipo existente `StockMovementResultRecord`).
2. **Labels** — `apps/portal/src/components/inventory/inventory-labels.ts`: `STOCK_ADJUSTMENT_REASON_LABELS` (Conteo físico / Daño o deterioro / Carga inicial / Corrección de registro / Pérdida o faltante / Sobrante encontrado / Otro) + getter. Reusar `STOCK_MOVEMENT_ORIGIN_LABELS` existente para el origen.
3. **Helpers puros** (con spec cada uno):
   - `stock-overview.ts` — agrega `balances` por ítem (`onHand`, `reserved`, `available = onHand − reserved`), cruza con `minimumStock`/`reorderPoint`/`targetStock` y deriva estado `out | below-minimum | below-reorder | ok` (labels: Agotado / Bajo mínimo / Bajo punto de reorden / En nivel). Patrón de `stock-issue-balance-utils.ts`.
   - `stock-kardex-filters.ts` — `EMPTY_STOCK_KARDEX_FILTERS`, `hasActiveStockKardexFilters`, `buildListMovementsParams`. Patrón de `location-matrix-filters.ts`.
4. **Componentes hoja** (en `apps/portal/src/components/inventory/`, reutilizando `PortalPanel`, `PortalSearchField`, `PortalEmptyState`, `PortalAlert`, `PortalSkeletonBlock`, clases `portalDataTable*`, `formatInventoryQuantity`, `formatInventoryDate`, `mapInventoryError`):
   - `StockByProductTable.tsx` — tabla agregada por producto: SKU, nombre, existencia, reservado, disponible, mínimo/reorden, badge de estado; filtros (búsqueda, solo bajo mínimo, bodega); acciones "Ver detalle" y "Ajustar" (si `canAdjust`).
   - `StockItemDetailDrawer.tsx` — drawer (patrón `InventoryCatalogDrawer`): cabecera del ítem; saldos por bodega × lote × condición desde los `balances` ya cargados; sección "Kardex del producto" con fetch propio `inventoryApi.listMovements({ itemId, limit: 10 })` y paginación simple; botón "Ajustar".
   - `StockAdjustmentDialog.tsx` (+spec) — patrón `StockTransferDialog`: producto (preseleccionado o selector de no serializados), bodega, condición, dirección Entrada/Salida + cantidad > 0 → `quantityDelta` con signo, razón, nota; `idempotencyKey = crypto.randomUUID()` generado al abrir; submit → `inventoryApi.createAdjustment`; errores vía `mapInventoryError`; éxito → callback `onAdjustmentRegistered(movementNumber)`.
   - `StockKardexPanel.tsx` (+spec) — lista con estado de fetch propio (no entra a `loadData`): filtros (origen con labels, bodega, producto, rango de fechas, búsqueda por número), paginación de servidor, filas expandibles con las líneas enriquecidas.
   - `StockLocationsPanel.tsx` — tabla de gestión de bodegas para la pestaña Bodegas sin la matriz: nombre, código, tipo, estado, responsable, capacidad/ocupación (agregando `balances` por bodega), acciones Editar / Crear bodega.
   - `StockWorkspace.tsx` — contenedor de la pestaña `stock` con subvistas anidadas patrón Catálogo ("Por producto" / "Por bodega" / "Kardex"); "Por bodega" reutiliza `StockLocationsMatrix` tal cual; recibe por props `items`, `balances`, `locations`, `userLabelById`, `custodyFilter`, `canAdjust` y callbacks.
5. **Integración final** (archivos compartidos con Fase 07 — cambios mínimos):
   - `inventory-tab-params.ts` (+spec): añadir `'stock'` al union `InventoryTab` y a `INVENTORY_TABS` (tras `catalog`, grupo Operación).
   - `InventoryClient.tsx`: (a) el union local `InventoryTab` (~línea 120) += `'stock'`; (b) `TabsTrigger` "Existencias" en el grupo Operación tras Catálogo; (c) `TabsContent value="stock"` → `StockWorkspace` con los datos ya cargados por `loadData()` (`balances`, `items`, `locations` — sin endpoint extra) y `onAdjustmentRegistered` → `movementNotice` + `loadData(true)`; (d) `TabsContent value="locations"`: sustituir `StockLocationsMatrix` por `StockLocationsPanel`, título "Bodegas", conservando `StockLocationFormDialog` y el deep-link `?action=create`; (e) `handleLocationCustodyFilterChange` apunta a `tab=stock`; (f) redirect de compatibilidad `tab=locations&custody=mobile` → `tab=stock&custody=mobile` (patrón del efecto `commercialRef`, ~línea 462).
   - `canAdjust`: derivar del rol de sesión si hay helper disponible en el portal; si no, mostrar la acción y confiar en el 403 mapeado por `mapInventoryError`.

### 3.3 Migraciones y base de datos

No aplica: esta fase no crea ni altera tablas (decisión D1 del PRD). Cualquier necesidad de DDL detectada durante la ejecución es un stop/go (sección 8).

### 3.4 Contratos, validaciones y seguridad

- Contrato de API congelado en la sección 7 del PRD; no modificarlo sin re-sync vía AI-EM-ARCH.
- RBAC según decisión D2. Tenant siempre desde JWT; transacciones con los helpers vigentes del módulo.

### 3.5 Documentar decisiones y desvíos

Todo desvío del contrato o de las decisiones D1-D6 se registra en el informe de fase y se consulta a AI-EM-ARCH antes de implementar (`[CONSULTA]` del protocolo §6.2).

## 4. Restricciones no negociables

- No romper boundaries del modulith; sin acceso directo a tablas de otro módulo; sin imports circulares.
- No usar credenciales ni datos reales; sin PII en código, tests o logs.
- No omitir pruebas ni documentación; sin `any` explícito ni promesas flotantes.
- Texto visible en español, sentence case, sin enums crudos.
- Solo appends en los archivos compartidos con Compras Fase 07 (ver precaución en sección 3); no revertir ni reformatear cambios ajenos del working tree.
- pnpm (nunca npm/yarn).

## 5. Entregables tecnicos obligatorios

- Código backend: enum compartido, DTOs, `StockMovementQueryService`, `recordAdjustment`, controller y module.
- Código frontend: api-client, labels, helpers, seis componentes nuevos, integración de pestañas.
- Migraciones: no aplica.
- Tests:
  - API — nuevo `tests/stock-movement-query.service.spec.ts` (filtros, paginación, enriquecimiento, `adjustmentReason`, 404); casos nuevos en `tests/stock-ledger.service.spec.ts` (delta ±, rechazo de serializado, línea/contexto/`originRefId` correctos, replay idempotente); describes append en `tests/inventory.controller.http.spec.ts` (GET 200 con query parseada, `:id` valida UUID, POST: ADMIN 201, NOC/SUPPORT 403, body inválido 400); mock de `StockMovementQueryService` + asserts de los 3 paths en `inventory.swagger.spec.ts`.
  - Portal — actualizar `inventory-tab-params.spec.ts` e `InventoryClient.spec.tsx` (pestaña nueva, redirect de custodia, Bodegas sin matriz); nuevos specs de `stock-overview`, `stock-kardex-filters`, `StockAdjustmentDialog`, `StockKardexPanel` y smoke de `StockWorkspace`.
- OpenAPI/Swagger actualizado (los 3 endpoints visibles en `/api/v1/docs`).

## 6. Entregables documentales obligatorios

- Informe de fase: `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-v1.0.md` con evidencia de criterios y gates.
- Actualización del informe vivo: `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md` (estado de la fase).
- Actualización de PRD solo si un desvío aprobado cambia el contrato.
- Decisión stop/go documentada si aparece bloqueo técnico.

## 7. Criterios de aceptacion

- CA-01: una recepción de OC o compra de mostrador aparece en el kardex con número de movimiento y líneas enriquecidas.
- CA-02: un ajuste de salida reduce el on-hand en "Por producto"; un ajuste que dejaría saldo negativo responde 400 en español.
- CA-03: un ajuste sobre ítem serializado responde 400 dirigiendo a retorno/baja.
- CA-04: replay con el mismo `idempotencyKey` no duplica el movimiento.
- CA-05: NOC/SUPPORT consultan kardex; 403 al ajustar.
- CA-06: pestaña Existencias con tres subvistas; matriz fuera de Bodegas; deep-link `tab=locations&custody=mobile` redirige conservando el filtro.
- CA-07: Swagger documenta los 3 endpoints; lint, typecheck y suites de inventario (API y portal) en verde.

Gates de verificación que corre el ejecutor:

1. `pnpm --filter @iwana/api test -- src/modules/inventory` (o specs individuales: `cd apps/api && npx jest src/modules/inventory/tests/stock-movement-query.service.spec.ts`).
2. `pnpm --filter @iwana/portal test` (specs de inventario).
3. `pnpm lint && pnpm typecheck`.
4. E2E manual con `pnpm dev`: recepción → visible en kardex; ajuste de salida baja el on-hand; ajuste a negativo → 400; deep-link viejo redirige.
5. `/api/v1/docs` muestra los 3 endpoints nuevos.

## 8. Criterio de stop/go

- Detenerse inmediatamente si: (a) se detecta necesidad de migración/DDL; (b) el contrato de la sección 7 del PRD resulta inviable; (c) un cambio requerido en archivos de Fase 07 excede un append; (d) aparece una violación de boundary o un riesgo de seguridad.
- Documentar causa en: informe de fase (sección de bloqueos).
- Escalar a: AI-EM-ARCH (formato `[BLOQUEO]` del perfil; SEC-ENG si es de seguridad).
- Recomendacion esperada: opciones (máx. 3) con costo y recomendación única.

## 9. Criterio de salida de la fase

- Backend validado: 3 endpoints operativos con RBAC y tenant isolation verificados en tests HTTP.
- Frontend validado: pestaña Existencias funcional con las tres subvistas y ajustes; Bodegas reducida; deep-links compatibles.
- Base de datos validada: sin cambios de schema (confirmado en el informe).
- Tests en verde: suites de inventario API y portal + lint + typecheck.
- Documentacion archivada: informe de fase emitido e informe vivo actualizado; G5 (gates técnicos + review de segunda capa EM-ARCH) listo para G6/G7.
