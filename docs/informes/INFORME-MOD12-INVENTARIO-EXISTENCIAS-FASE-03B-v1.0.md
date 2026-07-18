# Informe de fase — MOD12 Existencias Fase 03B (Reservas efectivas)

**Versión:** 1.0  
**Fecha:** 2026-07-18  
**Estado:** Implementación lista para G6 (G5 técnico)  
**Rol ejecutor:** AI-SR-FULL (+ FE-PLATFORM en la misma sesión)  
**Prompt:** `docs/prompts/PROMPT-MOD12-EXISTENCIAS-RESERVAS-FASE-03B-v1.0.md`  
**ADR:** `docs/adrs/ADR-055-Reservas-Efectivas-Disponible-Comprometido.md` (Aprobado CTO)  
**Spec:** `docs/specs/2026-07-18-mod12-existencias-reservas-fase03B-design.md`  
**Plan:** `docs/plans/2026-07-18-mod12-existencias-fase-03b-reservas.md`  
**Rama:** `feat/mod12-existencias-fase-03b-reservas`

---

## 1. Resumen ejecutivo

Se cerró la sobre-venta de material prometido: las salidas abiertas apartan stock en `quantity_reserved`, y **todas** las rutas de consumo deciden contra `disponible = existencia − reservado`. El invariante `0 ≤ reserved ≤ onHand` vive en el único escritor de saldos (`StockBalanceService.applyDeltaWithManager`). No se agregaron endpoints ni columnas.

## 2. Entregables

| Área | Cambio |
| --- | --- |
| Motor | `reservedDelta` opcional + invariante D-F3B-1; helper `getAvailabilityWithManager` |
| Salidas | Reserva en `create`; ajuste en `update`; liberación en `cancel`; release+ledger en `dispatch` (misma TX, idempotente) |
| Validaciones | Issue + ledger + guardado del balance usan disponible |
| Migración | Tenant **072** `ReconcileStockReservations0720000000000` registrada en `TENANT_MIGRATIONS` |
| Portal | `StockLocationsMatrix` muestra existencia / reservado / disponible |
| OpenAPI | Descripciones actualizadas en create/update/dispatch issues y transfers |
| Tests | Balance (4 esquinas), issue (reserva/rechazo/despacho propio), ledger (comprometido ajeno), cycle-count CA-F3B-08, portal matriz + overview |

## 3. Criterios de aceptación

| CA | Evidencia |
| --- | --- |
| CA-F3B-01…05 | `stock-issue.service.spec.ts` + ciclo create/reserve/dispatch/cancel |
| CA-F3B-06 | `stock-ledger.service.spec.ts` — transferencia rechazada con reserved |
| CA-F3B-07 | `stock-balance.service.spec.ts` — invariante |
| CA-F3B-08 | `cycle-count.service.spec.ts` — cierre rechazado vía invariante |
| CA-F3B-09 | Migración 072 aplicada en `tenant_iwana`; re-ejecución del migrator no-op (idempotente a nivel runner); `down()` → `reserved = 0` |
| CA-F3B-10 | Matriz + `stock-overview` con reservas reales |
| CA-F3B-11 | Gates abajo |

## 4. Gates técnicos (G5)

| Gate | Resultado |
| --- | --- |
| `pnpm db:migrate:all` | PASS — 072 aplicada (`ReconcileStockReservations0720000000000`) |
| Re-ejecutar migraciones tenant | PASS — no duplica (skip si aplicada) |
| `pnpm --filter @iwana/api test -- src/modules/inventory` | **PASS 256/256** |
| `pnpm --filter @iwana/portal test -- src/components/inventory` | **PASS 234/234** |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| Suite portal completa | 3 fallos **preexistentes** en `scheduling/*` (fechas/timezone; fuera de alcance 3B). Inventario en verde. |

## 5. Protocolo multiagente

- Etapa 5 (implementación) con contratos congelados §3bis: sin shapes nuevos; semántica de `quantityReserved` y mensajes 400.
- Subagente FE paralelo abortó por límite de API; FE-PLATFORM se ejecutó en la misma sesión SR-FULL.
- Listo para **G6** (PROD-UX / DS-OWNER / SR-QA) y luego G7 (EM-ARCH).

## 6. Deuda / notas

- E2E manual del prompt §7.5 (`pnpm dev`: crear → transferir comprometido → despachar → cancelar → conteo) queda para verificación G6/SR-QA.
- Caducidad automática de reservas y reservas no-`StockIssue`: fuera de alcance (ADR-055).
- Fallos portal `scheduling/*` no introducidos por esta fase; no bloquean G5 de Existencias.

## 7. Archivos principales

- `apps/api/src/modules/inventory/services/stock-balance.service.ts`
- `apps/api/src/modules/inventory/services/stock-issue.service.ts`
- `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- `packages/database/src/migrations/tenant/072_reconcile_stock_reservations.ts`
- `packages/database/src/migrations/tenant/runner.ts`
- `apps/portal/src/components/inventory/StockLocationsMatrix.tsx`
