# MOD12 Existencias Fase 03B — Reservas efectivas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apartar stock comprometido por salidas abiertas en `quantity_reserved` y decidir todas las rutas de consumo contra `disponible = onHand − reserved`.

**Architecture:** Extender el único escritor de saldos (`StockBalanceService.applyDeltaWithManager`) con `reservedDelta` + invariante D-F3B-1; ciclo de reserva atado a `StockIssue` (crear/editar/cancelar/despachar); migrar validaciones de disponible; reconciliación tenant 072; corregir UI Por bodega.

**Tech Stack:** NestJS, TypeORM, PostgreSQL multi-tenant, Jest, Next.js portal, `@iwana/ui`

**Contratos congelados (§3bis):**
- API: sin endpoints/shapes nuevos; cambian mensajes 400 y semántica de `quantityReserved`.
- UI: existencia / reservado / disponible en matriz por bodega; errores en español vía `PortalAlert`.

**Roles:** AI-SR-FULL (backend) · AI-FE-PLATFORM (portal) · AI-SR-QA (gates E2E posteriores)

---

### Task 1: Motor de saldos + helper disponible

**Files:**
- Modify: `apps/api/src/modules/inventory/services/stock-balance.service.ts`
- Create: `apps/api/src/modules/inventory/tests/stock-balance.service.spec.ts`

- [ ] Extender `ApplyStockDeltaInput` con `reservedDelta?: number` (default 0)
- [ ] Verificar invariante `0 ≤ reserved_new ≤ onHand_new` tras ambos deltas
- [ ] Mensaje 400 en español con existencia y comprometido
- [ ] Exponer `getAvailableQuantityWithManager` (y/o helper puro) por tupla
- [ ] Tests de 4 esquinas del invariante

### Task 2: Ciclo de reserva en StockIssue

**Files:**
- Modify: `apps/api/src/modules/inventory/services/stock-issue.service.ts`
- Modify: `apps/api/src/modules/inventory/tests/stock-issue.service.spec.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts` (si hace falta wiring explícito — Nest DI)

- [ ] Inyectar `StockBalanceService`
- [ ] `create`: reservar `requestedQty` por línea; fallar si no hay disponible
- [ ] `update`: liberar reservas viejas al reemplazar líneas; reservar nuevas
- [ ] `cancel`: liberar en transacción
- [ ] `dispatch`: liberar reserva **antes** del ledger (misma TX); idempotencia sin doble liberación
- [ ] Tests: crear/editar/cancelar/despachar/parcial/idempotente/D-F3B-5

### Task 3: Migrar validaciones a disponible

**Files:**
- Modify: `apps/api/src/modules/inventory/services/stock-issue.service.ts` (`getAvailableQuantity`)
- Modify: `apps/api/src/modules/inventory/services/stock-ledger.service.ts` (`getAvailableQuantity`)
- Modify: `apps/api/src/modules/inventory/tests/stock-ledger.service.spec.ts`
- Modify: `apps/api/src/modules/inventory/tests/cycle-count.service.spec.ts` (CA-F3B-08)

- [ ] Ambos `getAvailableQuantity` usan `onHand − reserved`
- [ ] Mensajes 400 coherentes (existencia + comprometido)
- [ ] Transferencia/venta/baja rechazan stock comprometido ajeno
- [ ] Cierre de conteo que deja `onHand < reserved` rechazado vía invariante

### Task 4: Migración tenant 072

**Files:**
- Create: `packages/database/src/migrations/tenant/072_reconcile_stock_reservations.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

- [ ] `UPDATE` que **asigna** reserved recalculado desde salidas abiertas
- [ ] Acotar con `LEAST(on_hand, calculated)` + `RAISE NOTICE` si se acota
- [ ] `down()` → `quantity_reserved = 0`
- [ ] Registrar en `TENANT_MIGRATIONS`

### Task 5: Portal (FE-PLATFORM)

**Files:**
- Modify: `apps/portal/src/components/inventory/StockLocationsMatrix.tsx`
- Create/Modify: specs de matriz y `stock-overview` con `quantityReserved > 0`
- Verificar: `StockIssueComposer` / `PortalAlert` muestran mensaje backend

- [ ] Dejar de rotular `onHand` como «Disponible»
- [ ] Mostrar existencia, reservado y disponible
- [ ] Tests portal

### Task 6: Gates + documentación

- [ ] `pnpm db:migrate:all` + idempotencia 072 + revert
- [ ] `pnpm --filter @iwana/api test -- src/modules/inventory`
- [ ] `pnpm --filter @iwana/portal test`
- [ ] `pnpm lint && pnpm typecheck`
- [ ] Informe fase + actualizar informe vivo
