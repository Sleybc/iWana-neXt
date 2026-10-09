# INFORME — MOD11 ↔ MOD12 · R-API (Ola 3b)

**Fecha:** 2026-10-07  
**Responsable:** sr-backend  
**Veredicto:** **GO condicionado** al cierre del caso de identificadores inválidos en `onFailed` (ver §5).  
**Commit:** no realizado.

## 1. Alcance

Se corrigió `SUBSCRIBER_REQUIRED` en el consumidor de `inventory-execution-requests`, se cubrieron los cuatro códigos de rechazo de negocio del catálogo de la spec §4 y se elimina el job terminal de la cola de origen después de que la DLQ acepta su diagnóstico allowlisted. No se modificaron contratos, migraciones ni archivos fuera de `apps/api/src/modules/inventory/**` y este informe.

## 2. Cambios

- Antes de validar la entrada del ledger, `INSTALLED_AT_CUSTOMER` sin `subscriberId` no vacío persiste recibo `REJECTED/SUBSCRIBER_REQUIRED` y emite `InventoryMovementRejectedV1`. El processor retorna normalmente; no produce `UnrecoverableError` ni reintento.
- Al construir la entrada del ledger, `subscriberId: null` se normaliza a `undefined`; un suscriptor presente se conserva. El schema opcional del ledger acepta la ausencia.
- `CUSTODY_INSUFFICIENT`, `SERIAL_NOT_IN_CUSTODY` e `ITEM_INACTIVE` quedan como resultados terminales: se persiste recibo `REJECTED`, se emite la respuesta y no se relanza el error de negocio.
- En `onFailed`, para un job terminal con los cuatro identificadores UUID válidos, se escribe primero el diagnóstico de siete campos permitidos (`tenantId`, `eventId`, `executionOrderId`, `inventoryRequestId`, `failedAt`, `attemptsMade`, `errorType`) y después se invoca `job.remove()`. El mensaje de excepción no se copia al diagnóstico ni al log.

## 3. Cobertura añadida y actualizada

| Caso | Comprobación |
| --- | --- |
| `CUSTODY_INSUFFICIENT` | Recibo `REJECTED`, respuesta con el código, processor resuelto sin retry. |
| `SERIAL_NOT_IN_CUSTODY` | Recibo `REJECTED`, respuesta con el código, processor resuelto sin retry. |
| `SUBSCRIBER_REQUIRED` | Entrada firmada con `subscriberId: null`; rechazo antes del schema y sin invocar ledger/custodia. |
| `ITEM_INACTIVE` | Recibo `REJECTED`, respuesta con el código, processor resuelto sin retry. |
| Error técnico terminal | La secuencia verifica que la DLQ acepte solo los siete campos permitidos antes de llamar `job.remove()`. |
| Camino confirmado | El suscriptor presente se conserva en la entrada del ledger. |

`PENDING` prolongado en §4 es un estado del consumo gestionado por D7/MOD11, no un código de rechazo que este processor pueda persistir como `REJECTED`.

## 4. Verificación ejecutada

Comando exacto de la suite completa del directorio `inventory`, forzada sin caché:

```powershell
pnpm exec turbo run test --filter=@iwana/api --force -- -- --runInBand --testPathPattern=modules/inventory
```

Resultado: **78 suites aprobadas**, 3 suites omitidas (81 totales); **795 pruebas aprobadas**, 8 omitidas (803 totales); **`Cached: 0 cached, 4 total`**. El spec del processor quedó incluido en esa corrida.

También pasaron:

```powershell
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/api exec eslint src/modules/inventory/services/inventory-execution-request.processor.ts src/modules/inventory/tests/inventory-execution-request.processor.spec.ts
```

## 5. Salvedad pendiente

El callback actual solo crea el diagnóstico DLQ si los cuatro identificadores requeridos pasan `safeUuid()`. Si alguno falta o es inválido, registra un log genérico sin esos IDs y retorna; en ese camino no crea diagnóstico ni elimina el job original, que puede conservar el sobre en la cola de origen.

Se intentó una modificación para emitir diagnóstico allowlisted omitiendo IDs no válidos y borrar el origen tras la aceptación. La revisión automática rechazó ese parche con el motivo de que no validaba/omitía IDs malformados; el parche **no se aplicó**. El camino con UUID válidos sí está cubierto y pasa. La retención de jobs API con identificadores inválidos queda pendiente de resolución antes de declarar completo D11 para ese caso.

## 6. Archivos del bloque

- `apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts`
- `apps/api/src/modules/inventory/tests/inventory-execution-request.processor.spec.ts`
- `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-R-API-v1.0.md` (este informe)
