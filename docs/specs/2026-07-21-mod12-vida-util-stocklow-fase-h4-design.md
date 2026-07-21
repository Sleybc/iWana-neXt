# Spec — MOD12 Vida útil + StockLow + eventos de dominio — Fase H4

**Version:** 1.0  
**Estado:** Diseño congelado — **aprobado por CTO** (2026-07-21)  
**Fecha:** 2026-07-21  
**PRD:** [PRD-MOD12-VIDA-UTIL-STOCKLOW-v1.0.md](../prds/PRD-MOD12-VIDA-UTIL-STOCKLOW-v1.0.md)  
**Hallazgo:** H4 (INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO v1.3+)  
**Decisiones de producto:** umbrales StockLow = ambos niveles (C); alertas vida útil = endpoint + panel (A); eventos = emitir + listener mínimo (B)

---

## D-H4-01 — Constantes de eventos

Ampliar `INVENTORY_EVENTS` en `inventory.events.ts`:

| Constante | Nombre de canal | RF |
| --- | --- | --- |
| `STOCK_LOW` | `inventory.stock-low` | RF-INV-22 |
| `ASSET_SOLD` | `inventory.asset-sold` | RF-INV-14 |

Payload `StockLowEvent`:

```text
tenantId, itemId, sku?, level: 'below-minimum' | 'below-reorder',
available, pending, minimumStock, reorderPoint,
stockMovementId?, actorUserId?
```

Payload `AssetSoldEvent`:

```text
tenantId, itemId?, serializedAssetId?, stockMovementId,
quantity, commercialReference?, actorUserId?
```

No inventar en MVP los demás eventos del HLD (`items-received`, `asset-installed-in-comodato`, etc.).

## D-H4-02 — Emisión post-commit

Emitir **después del commit** del ledger (no dentro de la TX), para no emitir en rollback.

Puntos de enganche:

1. Tras movimientos que mutan balance (paths que pasan por `applyDeltaWithManager` / retorno de `recordMovementWithManager`).
2. Paths `SALE` (`recordSale`, `recordStockIssueSaleWithManager`) → `ASSET_SOLD`.

Helper sugerido: `InventoryDomainEventPublisher` inyectado en `StockLedgerService` (o servicio hermano llamado al final de los métodos públicos que cierran TX).

## D-H4-03 — Evaluación de umbrales (ambos niveles)

Reutilizar la semántica F2:

- Agregar `available` por ítem (on-hand − reserved) y `pending` (OC abiertas + líneas de solicitud abiertas), misma familia que `ReplenishmentService`.
- Elegibles: `purchasable` + `ACTIVE`.
- Niveles:
  - `below-minimum` si `available < minimumStock` (y `minimumStock > 0`).
  - `below-reorder` si `available + pending < reorderPoint` (y `reorderPoint > 0`).
- Un mismo movimiento puede emitir **uno o dos** eventos `STOCK_LOW` (un payload por nivel cruzado).
- Criticidad `out` (`available <= 0`) se trata como caso de `below-minimum` si `minimumStock > 0`; no se introduce un tercer canal.

## D-H4-04 — Dedup al cruzar umbral

Emitir solo al **cruzar hacia abajo**:

```text
beforeLevel[level] == false  AND  afterLevel[level] == true  → emit
```

No re-emitir si el ítem **sigue** bajo el umbral tras otro movimiento. Recuperación (cruzar hacia arriba) = fuera de MVP.

Comparar snapshot pre-delta vs post-delta del ítem afectado (no de toda la bodega si el balance es por ubicación: agregar a nivel ítem como F2).

## D-H4-05 — Listener mínimo

`InventoryDomainEventsListener` en el módulo inventory:

- `@OnEvent(INVENTORY_EVENTS.STOCK_LOW)` y `@OnEvent(INVENTORY_EVENTS.ASSET_SOLD)`
- Log estructurado sin PII: `event`, `tenantId`, `itemId` / `serializedAssetId`, `level`, `stockMovementId`
- **Prohibido:** crear OC, mutar stock, llamar Purchasing

## D-H4-06 — Endpoint vida útil (pull)

```text
GET /inventory/assets/useful-life-alerts
  ?status=por-vencer|vencida
  &page=&pageSize=
```

- Reusa `calculateUsefulLife` (`serialized-asset-useful-life.util.ts`).
- Incluye activos con datos suficientes; excluye `sin-dato` y `vigente` del listado de alertas.
- Sin migración; sin tabla materializada; sin BullMQ.
- Roles: lectura ADMIN / NOC / SUPPORT (alineado a activos).

## D-H4-07 — Portal

- Panel/subvista «Vida útil» (Activos o Existencias — preferir Activos): lista paginada, chip de estado, enlace a ficha 360.
- Stock bajo: **no** duplicar F2; CTA/enlace a la subvista de reposición existente (`StockReplenishmentPanel`).
- Copy en español vía `inventory-labels.ts`; sin enums crudos.
- Fuera de alcance: H5 (select nativos Movimientos/Bajas).

## D-H4-08 — Sin migración / sin ADR

H4 no introduce columnas nuevas. Escalar ADR solo si se propone outbox persistente o cola BullMQ (stop → AI-EM-ARCH).

## D-H4-09 — Tests mínimos

| Caso | Capa |
| --- | --- |
| Cruzar `minimumStock` → emite `below-minimum` | unit |
| Cruzar `reorderPoint` → emite `below-reorder` | unit |
| Ya bajo umbral + nuevo movimiento → no re-emite | unit |
| SALE → emite `asset-sold` | unit |
| Listener invocado (mock logger) | unit |
| `GET useful-life-alerts` filtra `por-vencer` / `vencida` | unit/integration |
| Aislamiento tenant en endpoint | integration |
| E2E smoke: panel vida útil visible con fixture | Playwright portal |

## D-H4-10 — Limitaciones declaradas

- Sin notificaciones email/push.
- Sin auto-creación de solicitudes de compra.
- Sin consumidor Billing/ERP real (solo publisher + listener log).
- Sin eventos HLD restantes (received / assigned / returned / written-off) en esta fase.
