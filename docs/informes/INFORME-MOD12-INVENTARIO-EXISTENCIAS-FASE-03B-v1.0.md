# Informe de fase — MOD12 Existencias Fase 03B (Reservas efectivas)

**Versión:** 1.1  
**Fecha:** 2026-07-18  
**Estado:** G5 + **EV-1 cerrado** — listo para G6 (aún no G7)  
**Rol ejecutor:** AI-SR-FULL (+ FE-PLATFORM / SR-QA en tracks §3bis)  
**Prompt:** `docs/prompts/PROMPT-MOD12-EXISTENCIAS-RESERVAS-FASE-03B-v1.0.md`  
**ADR:** `docs/adrs/ADR-055-Reservas-Efectivas-Disponible-Comprometido.md` (Aprobado CTO)  
**Spec:** `docs/specs/2026-07-18-mod12-existencias-reservas-fase03B-design.md`  
**Plan:** `docs/plans/2026-07-18-mod12-existencias-fase-03b-reservas.md`  
**Rama:** `feat/mod12-existencias-fase-03b-reservas`

---

## 1. Resumen ejecutivo

Se cerró la sobre-venta de material prometido: las salidas abiertas apartan stock en `quantity_reserved`, y **todas** las rutas de consumo deciden contra `disponible = existencia − reservado`. El invariante `0 ≤ reserved ≤ onHand` vive en el único escritor de saldos (`StockBalanceService.applyDeltaWithManager`).

**v1.1 — condición EV-1 (bloqueante para G7):** además de unitarios con EntityManager mockeado, hay evidencia contra PostgreSQL real (migración 072 apply/re-run/revert + smoke transaccional Nest/TypeORM) y smoke Playwright que protege el contrato UI a futuro.

## 2. Entregables

| Área | Cambio |
| --- | --- |
| Motor | `reservedDelta` opcional + invariante D-F3B-1; helper `getAvailabilityWithManager` |
| Salidas | Reserva en `create`; ajuste en `update`; liberación en `cancel`; release+ledger en `dispatch` |
| Validaciones | Issue + ledger + guardado del balance usan disponible |
| Migración | Tenant **072** + script EV-1 `scripts/ev1-mod12-migration-072-verify.sql` |
| Portal | `StockLocationsMatrix` existencia / reservado / disponible |
| OpenAPI | Descripciones create/update/dispatch issues y transfers |
| Tests unitarios | Balance, issue, ledger, cycle-count, portal |
| EV-1 transaccional | `stock-reservations.transactional.ev1.spec.ts` (opt-in `EV1_REAL_DB=1`) |
| EV-1 Playwright | `Portal Inventario / Reservas (Fase 03B)` en `portal-inventory-scm.spec.ts` |

## 3. Condición EV-1 (por qué no G7 antes)

Los unitarios con manager mockeado prueban la lógica del invariante, **no** el comportamiento transaccional real ni la protección ante sobre-venta bajo operación. EV-1 exige:

1. E2E del §7.5 con persistencia real  
2. Migración 072: aplicar → re-ejecutar SQL directo → revertir  
3. Smoke Playwright que proteja la garantía a futuro  

### 3.1 Migración 072 en DB real

Script: `scripts/ev1-mod12-migration-072-verify.sql` sobre `tenant_iwana`.

| Paso | Resultado |
| --- | --- |
| Baseline | 3 balances; `sum_reserved = 0` |
| Re-ejecutar cuerpo UP ×2 | `drift_after_double_up = 0` (idempotente, no acumula) |
| DOWN (`quantity_reserved = 0`) | `remaining_after_down = 0` |
| Re-aplicar UP | `mismatches_vs_baseline = 0` → `EV1_MIG_OK` |

Fila en `typeorm_migrations`: `ReconcileStockReservations0720000000000`.

### 3.2 Smoke transaccional §7.5 (PostgreSQL + servicios Nest)

```bash
EV1_REAL_DB=1 pnpm --filter @iwana/api test -- src/modules/inventory/tests/stock-reservations.transactional.ev1.spec.ts --coverage=false --forceExit
```

**Resultado (2026-07-18):** **2/2 PASS**

| Escenario §7.5 | Evidencia |
| --- | --- |
| Crear salida → disponible baja, existencia no | `reserved=5`, `onHand` intacto |
| Transferir stock comprometido → 400 | `BadRequestException` con mensaje de comprometido/disponible |
| Cancelar otra salida → libera reserva | `reserved` 7 → 5 |
| Despachar → existencia baja y reserva liberada | `onHand -= 5`, `reserved = 0` |
| Intento que deja existencia &lt; reservado | `applyDelta` real rechaza (camino del cierre de conteo) |

### 3.3 Smoke Playwright (contrato UI / mocks HTTP alineados F3B)

```bash
pnpm test:e2e:portal -- e2e/tests/portal-inventory-scm.spec.ts -g "Reservas"
```

**Resultado:** **4/4 PASS** (~9 s)

1. Disponible = existencia − reservado; crear salida compromete  
2. Transferencia sobre comprometido → 400  
3. Cancelar libera reserva  
4. Despachar libera reserva y descuenta existencia  

**Límite declarado:** el Playwright sigue el patrón F1/F2/F3A (mocks HTTP). La prueba de atomicidad/TX real queda en §3.2; no se confunde mock UI con garantía transaccional.

## 4. Criterios de aceptación

| CA | Evidencia |
| --- | --- |
| CA-F3B-01…05 | Unitarios issue + EV-1 transaccional |
| CA-F3B-06 | Ledger unitario + EV-1 transfer 400 + Playwright |
| CA-F3B-07 | Balance unitario + EV-1 applyDelta real |
| CA-F3B-08 | cycle-count unitario + invariante EV-1 |
| CA-F3B-09 | Script EV-1 migración |
| CA-F3B-10 | Matriz + overview + Playwright |
| CA-F3B-11 | Gates G5 |

## 5. Gates técnicos (G5)

| Gate | Resultado |
| --- | --- |
| `pnpm db:migrate:all` | PASS — 072 aplicada |
| EV-1 migración SQL | **PASS** `EV1_MIG_OK` |
| EV-1 transactional Jest | **PASS 2/2** |
| Playwright Reservas | **PASS 4/4** |
| `pnpm --filter @iwana/api test -- src/modules/inventory` | PASS (suite inventory) |
| `pnpm --filter @iwana/portal test -- src/components/inventory` | PASS |
| `pnpm lint` / `pnpm typecheck` | PASS |

## 6. Protocolo multiagente

| Track | Agente | Entrega EV-1 |
| --- | --- | --- |
| Backend / TX | AI-SR-FULL | Migración SQL + smoke Nest/TypeORM real |
| QA / E2E | AI-SR-QA (subagente) | Playwright Reservas 4/4 |
| FE contrato mock | FE-PLATFORM vía QA | Handlers F3B en `portal-inventory-scm.spec.ts` |

**Handoff G6:** PROD-UX / DS-OWNER / SR-QA pueden revisar con EV-1 satisfecho.  
**G7:** pendiente verificación independiente AI-EM-ARCH (aprobador ≠ productor) — no auto-cerrar.

## 7. Deuda / notas

- Caducidad automática de reservas y reservas no-`StockIssue`: fuera de alcance (ADR-055).  
- Suite portal completa: fallos preexistentes `scheduling/*` (fuera de 3B).  
- Smoke EV-1 usa `SALE_DISPATCH` (evita reglas de custodia móvil); cubre el contrato de reserva/sobre-venta.  
- No hay CLI `migration:tenant:revert`; el DOWN se verificó ejecutando el SQL de `down()` del 072.

## 8. Archivos principales

- `apps/api/src/modules/inventory/services/stock-balance.service.ts`
- `apps/api/src/modules/inventory/services/stock-issue.service.ts`
- `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- `apps/api/src/modules/inventory/tests/stock-reservations.transactional.ev1.spec.ts`
- `packages/database/src/migrations/tenant/072_reconcile_stock_reservations.ts`
- `scripts/ev1-mod12-migration-072-verify.sql`
- `apps/portal/src/components/inventory/StockLocationsMatrix.tsx`
- `e2e/tests/portal-inventory-scm.spec.ts` (describe Reservas F3B)
