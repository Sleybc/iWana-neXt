# Informe I2-R — Semántica de custodia y rollback de la migración 139

**Fecha:** 2026-10-06  
**Estado:** GO  
**Bloque:** `sr-backend` · ola 2b  
**Encargo:** `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §I2-R

## Cambios

- El campo `technicianCustodyId` de `InventoryConsumptionRequestedV2` queda documentado como el ID del técnico (`responsibleRefId`), sin cambiar la forma ni la versión del contrato.
- Antes de invocar el ledger, el processor resuelve en el schema del tenant la `StockLocation` activa de tipo `MOBILE_TECHNICIAN` cuyo `responsibleRefId` corresponde al técnico.
- El processor pasa el ID de ubicación como argumento interno separado del payload contractual. Si no encuentra ubicación, persiste el recibo `REJECTED` con `CUSTODY_INSUFFICIENT` y emite la respuesta sin invocar el ledger.
- Dentro de su transacción, el ledger revalida y bloquea la ubicación por `id` + `responsibleRefId` + tipo + estado `ACTIVE`; así detecta una desactivación o reasignación entre la consulta del processor y el movimiento. La validación de serial y saldo y las líneas de movimiento usan el ID de ubicación. La responsabilidad del activo conserva el ID del técnico.
- El `down` de la migración 139 ahora bloquea el rollback si existen recibos, siguiendo el patrón de la 137.

## Pruebas

La prueba del processor verifica que una `StockLocation` móvil activa con `id` distinto de `responsibleRefId` se resuelve antes de invocar el ledger y se pasa separada del contrato. La prueba del ledger usa un serial CPE y revalida/bloquea esa ubicación por ambos IDs antes de confirmar el movimiento desde ella, conservando el responsable técnico. Otra prueba verifica que una ubicación que desaparece antes de la transacción produce `CUSTODY_INSUFFICIENT`; la prueba del processor confirma que la ausencia detectada antes del ledger se guarda como recibo `REJECTED` y que no se invoca el ledger.

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api typecheck` | PASS |
| `pnpm --filter @iwana/db typecheck` | PASS |
| `pnpm --filter @iwana/shared typecheck` | PASS |
| `pnpm --filter @iwana/api test --runInBand --no-cache --testPathPattern=modules/inventory/` | PASS · 78 suites aprobadas, 3 omitidas; 792 pruebas aprobadas, 8 omitidas |
| `pnpm --filter @iwana/db test --runInBand --no-cache --runTestsByPath src/migrations/tenant/139_inventory_execution_request_receipts.spec.ts` | PASS · 3/3 |
| `pnpm --filter @iwana/db test:integration --runInBand --no-cache --runTestsByPath src/migrations/tenant/139_inventory_execution_request_receipts.integration.spec.ts` | PASS · PostgreSQL real `127.0.0.1:5433/dbiw`; `up`, unicidad, rollback bloqueado con un recibo y rollback aceptado después de eliminarlo |

La integración de la 139 ejercitó `up/down` contra PostgreSQL. No se modificó la forma del contrato v1.6 ni se cambió el comportamiento de los otros caminos del ledger.

**Commit:** no realizado.
