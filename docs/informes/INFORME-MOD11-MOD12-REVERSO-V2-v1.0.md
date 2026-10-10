# Informe de implementación V2 — reverso del ledger MOD12

**Fecha:** 2026-10-10  
**Dictamen de implementación:** GO. Migración 141 y R-CA04 verificados contra PostgreSQL real; R-CA04 también atravesó Redis DB 15.  
**Commit:** ninguno, conforme al encargo.

## Cambios

- Implementé el reverso en una transacción que bloquea el movimiento original, valida origen, OT, líneas, custodia y estado del activo, crea el movimiento contrario enlazado y persiste `reversed_by_movement_id` junto con el recibo. Usa el origen tipado `StockMovementOrigin.EXECUTION_ORDER_REVERSAL`. Referencia: `apps/api/src/modules/inventory/services/stock-ledger.service.ts`.
- El retorno del activo serializado deriva su ubicación de la línea original y lo deja en `ASSIGNED_TO_TECHNICIAN`. Si el movimiento original instaló un activo en comodato, cierra bajo bloqueo solo el préstamo ligado a ese movimiento; si no coincide, emite `REVERSAL_LOAN_MISMATCH`. Referencias: `stock-ledger.service.ts`, `asset-loan.service.ts` y `serialized-asset.service.ts`.
- Añadí al consumidor la verificación HMAC y Zod del sobre de reverso, aislamiento por tenant, recibo `REVERSAL`, respuesta determinista y tratamiento terminal de los cuatro rechazos de R7. El motivo no forma parte de la solicitud firmada. Referencia: `apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts`.
- Corregí el DataSource sintético del integrado: su lista explícita omitía `StockMovement`, `StockMovementLine`, `AssetLifecycleEvent` y `AssetLoanAssignment`, cuyos metadatos necesita el camino de reverso. Los añadí al fixture; no se captura ni degrada `EntityMetadataNotFoundError`.
- La migración 141 agrega `kind`, conserva los recibos previos como `CONSUMPTION`, cambia la clave única a `(tenant_id, kind, request_id)`, almacena el movimiento original y añade el origen al enum de PostgreSQL. Separé los `RENAME COLUMN` en sentencias `ALTER TABLE` propias, requeridas por PostgreSQL. `down` conserva la política: se bloquea si hay recibos de reverso o movimientos con el nuevo origen; sin esos datos restaura el esquema anterior y conserva el label del enum. Registrada en `packages/database/src/migrations/tenant/runner.ts`.
- Añadí pruebas unitarias del consumidor para confirmación idempotente y los cuatro rechazos; y casos integrados con Redis/PostgreSQL reales para los rechazos, más una carrera de dos reversos simultáneos.

## Gates ejecutados

| Gate | Resultado |
|---|---|
| `pnpm --filter @iwana/api build` | PASS |
| `pnpm typecheck` | PASS, 8/8 paquetes |
| Jest de `apps/api/src/modules/inventory` con `--no-cache` | PASS, 78 suites y 803 tests; 3 suites y 8 tests omitidos por precondiciones |
| Processor de solicitudes de inventario con `--no-cache` | PASS, 17/17 |
| Tests unitarios de migración 141 con `--no-cache` | PASS, 3/3; cubren SQL de `up`, bloqueos de `down` y ruta lógica de reversión sin datos |
| Typecheck de `@iwana/db` | PASS |
| Suite integrada R-CA04 del API: 4 rechazos de consumo, 4 de reverso y carrera simultánea | PASS, 9/9 contra `i4_qa_20261006_a1`, tenant `i4-qa-a-20261006-9d3098f4`, PostgreSQL en `127.0.0.1:5433` y Redis DB 15. `--runInBand --no-cache`; incluye los cuatro motivos R7 y confirma un solo movimiento para dos reversos concurrentes. |
| Migración 141 sobre PostgreSQL real, incluido `down` | PASS con `pnpm --filter @iwana/db exec jest --config jest.integration.config.js --runInBand --no-cache --runTestsByPath src/migrations/tenant/141_inventory_execution_request_reversal_receipts.integration.spec.ts`: PostgreSQL alcanzable en `127.0.0.1:5433/dbiw`; backfill, bloqueo de `down` por recibo, bloqueo por movimiento, y `down` limpio verificados. |

## Limitaciones y cierre

Los cuatro motivos, los recibos/respuestas y la carrera simultánea quedaron verificados en el flujo integrado real. La migración 141 quedó verificada con PostgreSQL real, incluidos los dos bloqueos de `down` y su reversión limpia. No hice commit.
