# Informe I1 — Lado MOD11

**Versión:** 1.0  
**Fecha:** 2026-10-06  
**Bloque:** I1 · `sr-backend`  
**Estado:** Implementado; gates de I1 en verde.

## Resultado

El contrato compartido v1.6 quedó verde antes de continuar con la implementación, por lo que se notificó la habilitación de Ola 2. V1 conserva su forma. MOD11 ahora emite solicitudes V2 con el contexto requerido; el worker las deriva firmadas a la cola propia de inventario, concilia respuestas tardías de forma condicional y recupera solicitudes `PENDING` antiguas.

## Cambios

### Contrato v1.6 y emisión

- `@iwana/shared` exporta `InventoryConsumptionRequestedV2`, sus esquemas Zod para payload, envelope y job firmado, los motivos tipados de rechazo y la canonicalización HMAC estable.
- El esquema valida los UUID de tenant, evento, OT, solicitud y actor; valida cantidad positiva, enums, límites de cadenas y la regla serial/cantidad. `itemId`, custodia y suscriptor conservan su tipo contractual de cadena.
- `registerItemUsage` emite V2 con `subscriberId` solo para `INSTALLED_AT_CUSTOMER`. Rechaza la asignación `CREW` con `EXECUTION_ORDER_CREW_ASSIGNMENT_UNSUPPORTED`.
- El consumo nace con `movement_status=PENDING`, `request_attempts=1`, timestamp de solicitud y motivo nulo. El contador 1 incluye la solicitud original, también para filas históricas que reciben el default de la migración.

### Migración 138

- Añade `rejection_reason_code`, `last_requested_at` y `request_attempts` de forma aditiva; el `down` elimina las tres columnas.
- No se añadió índice. El índice parcial queda condicionado a evidencia de `EXPLAIN`; no se propuso DDL de índice en I1.

### Worker D2, D7, D10 y D11

- El worker registra `inventory-execution-requests`. El handler V2 valida el envelope y firma `{tenantId, envelope}` con HMAC-SHA256 y la clave activa. Encola con `jobId=eventId`, 8 intentos, backoff exponencial, borrado inmediato al completar y retención de fallo de 30 días.
- Las solicitudes V2 y ambas respuestas de inventario evitan la guarda `aggregateVersion`; V2 necesita esto para las reemisiones nuevas de D7 y las respuestas pueden llegar tras el cierre de la OT.
- Confirmación y rechazo usan un único `UPDATE ... WHERE movement_status = 'PENDING'`. Duplicados idénticos son no-op; un resultado contradictorio se registra como anomalía sin sobrescribir el resultado existente.
- El DLQ de eventos de inventario y sus logs guardan solo IDs permitidos, fecha, intentos y tipo de error. No copian envelope, payload ni mensaje de excepción. La ruta DLQ sanitiza también los metadatos recibidos antes de persistirlos. Los eventos no relacionados con inventario conservan su ruta DLQ previa.
- El scanner corre cada 60 segundos; usa 15 minutos y 10 solicitudes máximas por defecto, configurables con `INVENTORY_REQUEST_RESCAN_THRESHOLD_MINUTES` e `INVENTORY_REQUEST_RESCAN_MAX_ATTEMPTS`. Recorre tenants desde `public.tenants`, valida schema, aplica `SET LOCAL search_path` y toma filas con `FOR UPDATE SKIP LOCKED`. Emite V2 con `eventId` nuevo y el mismo `inventoryRequestId`, e incrementa el contador en la misma transacción del outbox. Al llegar al tope mantiene `PENDING` y reporta `metric=prolonged_pending` con tenant y conteo.
- Los defaults están en `.env.example` y `.env.production.example`; Compose los pasa al worker.

## Verificación

Todos los comandos Jest se ejecutaron con `--no-cache`.

| Gate | Comando / evidencia | Resultado |
|---|---|---|
| Contrato v1.6 | `pnpm --filter @iwana/shared typecheck` | Pasa |
| Pruebas del contrato | `& .\node_modules\.bin\jest.CMD --config jest.config.js contracts/operations/execution-orders.spec.ts --runInBand --no-cache` desde `packages/shared` | 1 suite, 5 pruebas pasan |
| Typecheck I1 | `pnpm --filter @iwana/api typecheck`; `pnpm --filter @iwana/db typecheck`; `pnpm --filter @iwana/shared typecheck`; `pnpm --filter @iwana/worker typecheck` | Todos pasan |
| Typecheck de consumidores compartidos | `pnpm --filter @iwana/storage typecheck`; `tsc --noEmit --incremental false` desde `apps/portal`, `apps/web` y `packages/ui` | Todos pasan. Se desactivó incremental para no escribir `.tsbuildinfo` fuera del área permitida. `@iwana/config` no declara script `typecheck`. |
| Jest tasks | `& ..\..\node_modules\.bin\jest.CMD --runInBand --no-cache src/modules/tasks` desde `apps/api` | 35 suites, 727 pruebas pasan (`Cached: 0`) |
| Jest worker | `& ..\..\node_modules\.bin\jest.CMD --runInBand --no-cache` desde `apps/worker` | 16 suites, 123 pruebas pasan (`Cached: 0`) |
| Migración 138 real | `& ..\..\node_modules\.bin\jest.CMD --config jest.integration.config.js --runInBand --no-cache src/migrations/tenant/138_execution_order_inventory_request_recovery.integration.spec.ts` desde `packages/database` | PostgreSQL local alcanzable; `up`, default y `down` pasan en schema efímero |
| Higiene del diff | `git diff --check` | Pasa; Git solo advierte normalización de CRLF en algunos archivos existentes |

El wrapper Turbo de typecheck no pudo escribir sus logs de caché por permisos del entorno; los typechecks de los paquetes se ejecutaron directamente y pasaron. No se ejecutaron migraciones sobre schemas tenant existentes.

## Fronteras y seguimiento

- P1 dejó configurada la clave y el runbook de rotación en `docs/runbooks/RUNBOOK-INTERNAL-QUEUE-SIGNING-KEY-ROTATION-v1.0.md`. Su informe está en `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-P1-PLAT-OPS-v1.0.md`.
- I1 firma con la clave activa. La verificación con clave activa y anterior, la recepción de la cola, recibos MOD12 y ledger permanecen en I2.
- El informe no contiene valores de secretos. No se creó commit.
