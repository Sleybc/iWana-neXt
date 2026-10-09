# Informe I2 — consumidor de solicitudes de inventario en MOD12

**Fecha:** 2026-10-06  
**Estado:** implementación y gates de código aprobados; verificación `up/down` real pendiente por disponibilidad de PostgreSQL  
**Commit:** ninguno

## Resultado

- Se añadió y registró la migración tenant 139 para `inventory_execution_request_receipts`, con unicidad por tenant y solicitud, restricciones coherentes para resultados confirmados/rechazados y `down` reversible.
- Se incorporó `InventoryBusinessRejection` y validación exclusiva del camino firmado de OT: artículo activo, serial asociado al artículo y en custodia del técnico, y saldo disponible bajo el advisory lock del ledger. Los demás caminos del ledger conservan su comportamiento.
- `InventoryExecutionRequestProcessor` consume la cola propia de solicitudes. Verifica HMAC actual/anterior en tiempo constante antes de validar el sobre con Zod; resuelve tenant exclusivamente desde `public.tenants`; difiere tenants no activos; reproduce recibos existentes; invoca el ledger con principal mínimo `{ sub }`; escribe el recibo confirmado en la transacción del movimiento y genera respuesta determinista con UUIDv5. Un rechazo de negocio queda registrado como resultado terminal. Los errores técnicos se reintentan y la DLQ/log no contiene el payload.
- Se añadió una prueba concurrente con dos jobs: una ejecución gana el recibo, la otra recibe una violación única simulada y, al reintentarse, reproduce el recibo sin volver a registrar movimiento.

## Verificación

- `pnpm --filter @iwana/api typecheck` — aprobado.
- `pnpm --filter @iwana/shared typecheck` — aprobado.
- `pnpm --filter @iwana/db typecheck` — aprobado.
- `pnpm --filter @iwana/api test --runInBand --no-cache --testPathPattern=modules/inventory/` — 78 suites aprobadas, 3 omitidas; 789 pruebas aprobadas, 8 omitidas, 0 fallos. `--no-cache` desactiva la caché de Jest.
- `pnpm --filter @iwana/db test --runInBand --no-cache --runTestsByPath src/migrations/tenant/139_inventory_execution_request_receipts.spec.ts` — 1 suite, 2 pruebas aprobadas (DDL y reversión de la secuencia de SQL).
- La suite de API incluye `inventory-execution-request.processor.spec.ts` y `stock-ledger.service.spec.ts`; la ejecución enfocada de ambas terminó con 2 suites y 30 pruebas aprobadas.

## Gate PostgreSQL y alcance de la prueba de carrera

Se intentó ejecutar la suite real con:

```powershell
pnpm --filter @iwana/db test:integration --runInBand --no-cache --testPathPattern=139_inventory_execution_request_receipts.integration.spec.ts
```

Jest omitió explícitamente la integración: el probe no pudo conectar a `127.0.0.1:5433/dbiw` (`ECONNREFUSED`); tampoco hay PostgreSQL escuchando en 5432 y el daemon Docker no está disponible. Por ello, el `up/down` y la restricción única de la 139 **no quedan acreditados contra PostgreSQL real en esta corrida**, aunque existe la prueba de integración que los ejercita cuando la base está disponible.

La prueba de carrera es un test concurrente a nivel de processor que simula el `23505`/`QueryFailedError` y verifica el reintento con recibo. No sustituye una carrera contra PostgreSQL real; esa verificación queda para la suite integrada cuando haya una base local disponible.
