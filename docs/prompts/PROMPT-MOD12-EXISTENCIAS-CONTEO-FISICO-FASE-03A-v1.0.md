# PROMPT - MOD12 Existencias — Conteo físico / inventario cíclico — Fase 03A

> **Estado: Emitido (G4) — EJECUTABLE** (criterios de entrada satisfechos 2026-07-18: G7 Fase 2 confirmado por CTO + ADR-054 aprobado por CTO; ADR-016).

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Convencion documental: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`

## Modulo

- Nombre: Inventario / SCM — submódulo Existencias (stock)
- Codigo: MOD12
- Fase: 03A (Conteo físico / inventario cíclico)
- Version: 1.0
- Fecha: 2026-07-18
- Generado por: AI-EM-ARCH
- Destinatario: AI-SR-FULL (backend) + AI-FE-PLATFORM (portal)
- Nombre de archivo destino: `PROMPT-MOD12-EXISTENCIAS-CONTEO-FISICO-FASE-03A-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** el tenant crea un documento de conteo por bodega (y opcionalmente categoría), captura las cantidades contadas, ve las diferencias contra lo esperado y **cierra** el conteo aplicando un ajuste que deja el saldo del sistema exactamente igual a lo contado — todo trazable en el kardex.
- **Sí entra:** entidades `stock_counts` + `stock_count_lines` (migración 071), `CycleCountService`, endpoints REST del documento (crear/capturar/cerrar/cancelar/listar/detalle), pestaña de primer nivel "Conteos" en el portal, tests y Swagger.
- **No entra:** reservas efectivas (`quantityReserved`) — es **Fase 3B**, con su propio ADR y gate; conteo de activos serializados; bloqueo de bodega durante el conteo; ajuste de `StockLocationsMatrix` para restar reservado (llega con 3B); costeo/valoración (Fase 4).

## 2. Artefactos de entrada obligatorios

- PRD: `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` §7 (contrato Fase 3A)
- ADR: `docs/adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md` (**debe estar Aprobado**)
- Spec de diseño: `docs/specs/2026-07-18-mod12-existencias-conteo-fisico-fase03A-design.md` (decisiones D-F3A-1…10, ciclo de vida, CA)
- HLD: `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`
- Informes de cierre de Fases 1 y 2 (G7 GO)
- Skills: `nestjs-expert`, `database-migration` + `postgresql`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `system-vocabulary-review`, `testing-patterns`, `openapi-spec-generation`

## 3. Instrucciones para el fullstack

### 3.1 Base de datos (SR-FULL) — hacer primero

1. **Entidades** en `packages/database/src/entities/`: `stock-count.entity.ts` (cabecera) y `stock-count-line.entity.ts` (líneas), calcadas de `stock-issue.entity.ts` / `stock-issue-line.entity.ts`:
   - Cabecera: `id`, `tenantId`, `countNumber` (varchar, `CNT-######`), `status` (enum PG `stock_count_status`: OPEN/COUNTING/CLOSED/CANCELLED), `locationId`, `categoryId` nullable (filtro de alcance), `notes` nullable, `createdByUserId`, `closedByUserId` nullable, `closedAt` nullable, `stockMovementId` nullable (ajuste aplicado), `createdAt`/`updatedAt`. Índices `(tenantId, status, createdAt)` y `(tenantId, locationId)`. Sin FK cross-module; refs a location/movement como en `StockIssue`.
   - Línea: `id`, `tenantId`, `countId`, `itemId`, `lotId` nullable, `condition` (enum `StockBalanceCondition`, default NEW), `expectedQty` numeric(12,2), `countedQty` numeric(12,2) nullable, `createdAt`. Índice `(countId, createdAt)`, FK `countId ON DELETE CASCADE`. `variance` se deriva en el servicio/DTO (no columna).
2. **Migración** `packages/database/src/migrations/tenant/071_create_stock_counts.ts` (plantilla `057_create_stock_issues.ts`): crea el enum `stock_count_status` idempotente, ambas tablas con índices y FK cascade. `down()` elimina tablas y enum. **Registrar a mano** en `TENANT_MIGRATIONS` (`packages/database/src/migrations/tenant/runner.ts`) — import + entrada al final del array (orden importa). Registrar entidades en el barrel de `@iwana/db`. Migración reversible.
3. Enum `StockCountStatus` en `packages/shared/src/enums/inventory/` + barrel. NO tocar `StockMovementOrigin` (se reutiliza ADJUSTMENT, D-F3A-3). `StockAdjustmentReason.CYCLE_COUNT` ya existe.

### 3.2 Backend (SR-FULL)

4. **`CycleCountService`** nuevo en `apps/api/src/modules/inventory/services/cycle-count.service.ts` (patrón `StockIssueService`; inyecta `StockLedgerService` y `DataSource`):
   - `create(input, actor)`: `runInTenantSchema` + transacción. Congela líneas: lee `StockBalance` por `locationId` (+ `categoryId` si viene), **solo ítems `CONSUMABLE`** (join/consulta a `InventoryItem.trackingMode`), una línea por tupla item×lot×condition con `expectedQty = onHand`. Numera `CNT-######` con `generateSequentialNumber` (patrón `purchasing.service.ts:952`). Estado `COUNTING`.
   - `list(query)` / `getById(id)`: listado con filtros (status, locationId) + detalle con líneas y `variance` calculada (`countedQty − expectedQty`, null si no contado).
   - `update(id, input)`: capturar `countedQty` por línea (y añadir líneas "encontradas"); bloquea si estado terminal (CLOSED/CANCELLED).
   - `close(id, actor)` **solo ADMIN**: transacción; **relee `onHand` vivo** por línea (patrón `stock-ledger.service.ts:920`), `delta = countedQty − onHand`; arma líneas con delta ≠ 0; si hay alguna, invoca `stockLedgerService.recordMovementWithManager(manager, tenantId, { origin: ADJUSTMENT, originContext: 'inventory.cycle-count', originRefId: countId, idempotencyKey: 'cycle-count:'+countId, lines }, actor)`; persiste `stockMovementId`, `closedAt`, `closedByUserId`, estado `CLOSED`. Idempotente: si ya tiene `stockMovementId`, devolver sin re-aplicar. Líneas sin `countedQty`: no ajustan (documentar la regla elegida en CA-F3A-06).
   - `cancel(id, actor)`: estado `CANCELLED`, sin efecto en stock.
5. **DTOs** (append a `apps/api/src/modules/inventory/dto/index.ts`, plantilla `CreateStockIssueSchema`/`ListStockIssuesQuerySchema`): `CreateStockCountSchema` (locationId, categoryId?, notes?), `UpdateStockCountSchema` (líneas con countedQty; bloqueo terminal), `CloseStockCountSchema` (idempotencyKey opcional o derivada), `ListStockCountsQuerySchema` (status, locationId) + clases Nest espejo con `@ApiProperty`/`@Allow`.
6. **Controller** (append a `inventory.controller.ts`): los 6 endpoints de §5 del spec, con los `@Roles` indicados (cerrar = solo `UserRole.ADMIN`), `@ApiOperation` en español. `POST /inventory/counts/:id/close` y `.../cancel` como los `dispatch`/`cancel` de issues.
7. **Módulo**: registrar `CycleCountService` en providers de `inventory.module.ts` (y exports si aplica).

### 3.3 Frontend portal (FE-PLATFORM)

8. **Tab de primer nivel** `'counts'` en `inventory-tab-params.ts` (union `InventoryTab` + `INVENTORY_TABS`, junto a `issues`) y su `TabsTrigger`/`TabsContent` en `InventoryClient.tsx` (append acotado). Etiqueta "Conteos".
9. **Workspace** `StockCountsWorkspace.tsx` + componentes (plantilla `StockIssuesWorkspace` y familia): tabla/listado con KPIs por estado + toolbar de filtros; composer de creación (elegir bodega + categoría → carga líneas esperadas); tabla de captura de cantidades (plantilla `StockIssueDraftLinesTable`); drawer de detalle con columnas esperado/contado/diferencia y botón **Cerrar conteo** (visible solo si el rol es ADMIN; fallback 403 mapeado) + Cancelar.
10. **API client** (`api-client.ts`): tipos `StockCountRecord`/`StockCountLineRecord`/`StockCountDetailRecord` + métodos `listCounts/getCount/createCount/updateCount/closeCount/cancelCount` (plantilla del grupo `*Issue`).
11. **Labels** (`inventory-labels.ts`): `STOCK_COUNT_STATUS_LABELS` + `_VARIANTS` + getters (español sentence case). Reutilizar `getStockAdjustmentReasonLabel` (CYCLE_COUNT → "Conteo físico") donde se muestre el motivo del ajuste.

### 3.4 Contratos, seguridad, tenant

- Contrato §5 del spec congelado; desvío → `[CONSULTA]`/`[BLOQUEO]` a AI-EM-ARCH.
- Tenant desde JWT; `runInTenantSchema` en todas las operaciones; el conteo no escribe `StockBalance` directamente (solo vía ledger, D-F3A-5).
- Cerrar conteo restringido a ADMIN (D-F3A-6).

## 4. Restricciones no negociables

- El stock solo se mueve por `StockLedgerService`; el servicio de conteo no muta saldos por su cuenta.
- Sin `ALTER TYPE` sobre `stock_movement_origin` (se reutiliza ADJUSTMENT).
- Sin FKs cross-module en las entidades de conteo.
- Sin `any`; texto visible en español sentence case, sin enums crudos.
- Migración 071 reversible y registrada en el runner; `@iwana/db` debe compilar antes de correr migraciones.
- Solo append en archivos compartidos (dto/index.ts, inventory.controller.ts, inventory.module.ts, InventoryClient.tsx, inventory-tab-params.ts).
- pnpm (nunca npm/yarn).

## 5. Entregables tecnicos obligatorios

- BD: entidades + migración 071 + enum + registro en runner y barrel.
- Backend: `CycleCountService`, DTOs, 6 endpoints, module.
- Frontend: tab Conteos, workspace + composer + captura + detalle/cierre, api-client, labels.
- Tests:
  - API — `tests/cycle-count.service.spec.ts`: congelado de líneas (solo consumibles), captura y variance, cierre con delta = contado − onHand vivo (saldo final = contado), idempotencia del cierre, conteo sin variación (sin movimiento), exclusión de serializados. Append en HTTP spec (RBAC del cierre 403 NOC/SUPPORT, 200 ADMIN) y en `inventory.swagger.spec.ts` (6 paths). Verificar el mock de `CycleCountService` en los testing modules que construyen `InventoryController` (lección B1 de Fase 1: correr el **directorio completo** del módulo).
  - Portal — specs del workspace/composer/detalle (creación, captura, cierre visible solo ADMIN, estados).
  - Migración: si hay patrón de test de migración en el repo, seguirlo; si no, verificación manual `pnpm db:migrate:all` en entorno dev.
- OpenAPI/Swagger actualizado.

## 6. Entregables documentales obligatorios

- Informe de fase `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03A-v1.0.md`.
- Actualización del informe vivo `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md`.
- Si la ejecución revela un desvío que cambia el contrato o el modelo → actualizar ADR-054 vía AI-EM-ARCH.

## 7. Criterios de aceptacion

CA-F3A-01…09 del spec (sección 7). Gates del ejecutor:

1. `pnpm db:migrate:all` aplica 071 en dev; `migration:revert` la revierte.
2. `pnpm --filter @iwana/api test -- src/modules/inventory` (**directorio completo** del módulo — lección Fase 1).
3. `pnpm --filter @iwana/portal test`.
4. `pnpm lint && pnpm typecheck` (obligatorio; no omitir lint).
5. E2E manual con `pnpm dev`: crear conteo por bodega → capturar con diferencias → cerrar → verificar que el saldo quedó igual a lo contado y que el movimiento aparece en el kardex filtrando `origin=ADJUSTMENT`; verificar que NOC/SUPPORT no pueden cerrar.
6. `/api/v1/docs` muestra los 6 endpoints.

## 8. Criterio de stop/go

- Detenerse si: (a) ADR-054 no está aprobado; (b) Fase 2 no está cerrada en G7; (c) el congelado de líneas exige tocar el guardado anti-negativo o rutas de reserva (eso es 3B); (d) el contrato §5 resulta inviable.
- Documentar causa en el informe de fase; escalar a AI-EM-ARCH con opciones (máx. 3) y recomendación.

## 9. Criterio de salida de la fase

- BD: migración 071 aplicada y reversible; entidades en `@iwana/db`.
- Backend: crear/capturar/cerrar/cancelar/listar/detalle validados; cierre idempotente y reconciliación contra saldo vivo probada.
- Frontend: pestaña Conteos operable (crear → capturar → cerrar); cierre restringido a ADMIN en UI.
- Tests en verde (directorio completo del módulo + portal) + lint + typecheck; Swagger actualizado.
- Documentación: informe de fase + informe vivo; listo para G6 (PROD-UX/DS-OWNER/SR-QA) y luego G7.
