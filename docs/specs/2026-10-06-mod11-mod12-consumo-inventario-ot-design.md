# Diseño — MOD11 ↔ MOD12: el consumo de una OT mueve el inventario

**Versión:** 1.0
**Estado:** **Propuesto**. Pendiente de aprobación del CTO (G1), con revisión cruzada de `sr-backend` (factibilidad), `sec-eng` (riesgo) y `prod-ux` (copy de rechazo).
**Fecha:** 2026-10-06
**Modo:** Architect + EM
**Autor:** AI-EM-ARCH
**Origen:** hallazgo de R5 v1.3. El consumo de `OTE-20261006-003` quedó `PENDING` para siempre. La causa la verificó el orquestador: el consumidor que ADR-068 prescribe no existe. El CTO decidió el 2026-10-06 abrir esta definición en paralelo y no bloquear el G6 de la consola, **con la condición de que G7 no ocurra sin esta pieza**.

**ADR que se implementa, sin modificarlo:**

- [ADR-068](../adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado), decisión 6, decisión 10 y tabla de eventos;
- ADR-048 (Aprobado), por el ownership de inventario en MOD12.

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md`

---

## 1. Problema

ADR-068 decide una coreografía en tres pasos:

1. MOD11 emite `InventoryConsumptionRequestedV1` por su outbox;
2. MOD12 mueve el stock;
3. MOD12 responde con `InventoryMovementConfirmedV1` o `InventoryMovementRejectedV1`, y MOD11 concilia el consumo.

En el código, **solo existen los extremos**:

| Pieza | Estado | Evidencia |
| --- | --- | --- |
| MOD11 emite la solicitud | ✅ | `execution-orders.service.ts`, en `registerItemUsage`, la escribe en el outbox con `movementStatus = PENDING` |
| El relay la lleva a la cola | ✅ | `execution-order-relay.service.ts` → `operations-execution-events` |
| **Alguien de MOD12 la consume** | ❌ | El handler del worker la deja sin efecto: *«MOD12 consumirá este evento»* (`execution-order-events.processor.ts:221-226`). Nada en `apps/api/src/modules/inventory` la escucha. |
| MOD12 sabe mover el stock de una OT | ✅ | `StockLedgerService.recordExecutionOrderMovement` (`stock-ledger.service.ts:692`): es idempotente por clave, resuelve el sitio del cliente, abre el comodato y publica sus eventos de dominio. El puerto `InventoryMovementPort.consumeFromExecutionOrder` lo expone. |
| **La respuesta llega a MOD11** | ❌ | No existe ningún emisor de `InventoryMovementConfirmedV1` ni de `InventoryMovementRejectedV1`. |
| MOD11 aplica la respuesta | ✅ | `applyInventoryMovementConfirmed` y `applyInventoryMovementRejected` en el worker son idempotentes. |

Hay además un **hueco de contrato**. `InventoryConsumptionRequestedV1` solo lleva `inventoryRequestId`, `itemId`, `quantity` y `serial` (`packages/shared/src/contracts/operations/execution-orders.ts:497-502`). `recordExecutionOrderMovement` necesita además:

- la custodia de origen;
- la acción;
- la disposición final;
- el suscriptor (sin él, `INSTALLED_AT_CUSTOMER` se rechaza, `stock-ledger.service.ts:1398-1401`);
- el actor.

MOD12 no puede leer esos datos de las tablas de MOD11 (boundary).

**Efecto operativo:**

- ningún consumo de OT descuenta stock ni custodia;
- un CPE instalado sigue en la custodia del técnico, y el selector de R3 lo vuelve a ofrecer;
- todo consumo queda `PENDING` para siempre.

## 2. Decisiones

| # | Decisión | Por qué |
| --- | --- | --- |
| **D1** | **Nace `InventoryConsumptionRequestedV2`** con el contexto completo (§3). V1 no se amplía. | Una ampliación aditiva de V1 dejaría eventos V1 ya escritos que MOD12 no podría procesar sin leer tablas de MOD11. Un tipo nuevo hace explícita la frontera y permite rechazar V1 con un motivo claro. |
| **D2** | **La entrega a MOD12 va por una cola propia, `inventory-execution-requests`.** El handler del worker para V2 la reencola con un `jobId` determinista (`inventoryRequestId`). | El relay sigue siendo genérico. Dos consumidores sobre `operations-execution-events` se repartirían los jobs. |
| **D3** | **El consumidor de MOD12 vive en el proceso API, dentro del módulo de inventario** (`@Processor`, con precedente en `users-bulk-create.processor.ts`). Invoca `recordExecutionOrderMovement` con `idempotencyKey = inventoryRequestId`. | El worker no importa servicios del API, solo `@iwana/db`, `@iwana/shared` y `@iwana/storage`. Reimplementar el ledger en SQL crudo duplicaría la lógica de inventario. |
| **D4** | **La respuesta se encola en `operations-execution-events` con un `eventId` determinista**, derivado de `inventoryRequestId` y el resultado. **No se crea un outbox de MOD12.** | El job de BullMQ ya es durable. Si el encolado de la respuesta falla, el job se reintenta, el movimiento hace replay idempotente y la respuesta se reemite. El inbox de MOD11 deduplica por `eventId`. Es entrega at-least-once sin DDL de outbox. |
| **D5** | **El rechazo es un resultado, no un error.** Las violaciones de negocio (custodia insuficiente, serial que no está en custodia, suscriptor ausente para `INSTALLED_AT_CUSTOMER`, artículo inactivo) producen `InventoryMovementRejectedV1` con un `reasonCode` del catálogo de §4. Los errores técnicos (base caída, timeout) reintentan y, al agotar los intentos, van a la DLQ existente. | Un rechazo de negocio que se reintenta para siempre es otro `PENDING` eterno. |
| **D6** | **El motivo del rechazo se persiste y se expone.** Columna aditiva `rejection_reason_code` en `execution_order_item_usage` (migración 138: nula, `down` reversible). Campo opcional `rejectionReasonCode` en `ExecutionOrderItemUsage`, con bump del contrato a **v1.6**. | Un «Rechazado» sin motivo deja al técnico sin saber qué hacer: el defecto que la auditoría de la consola corrigió en todas partes. |
| **D7** | **Re-solicitud de pendientes antiguos, propiedad de MOD11.** Una tarea de reconciliación de MOD11 reemite V2, con el mismo `inventoryRequestId`, para los consumos `PENDING` sin respuesta pasado un umbral configurable. Resuelve también los consumos pendientes registrados con V1. | MOD11 es dueño de sus datos y del contexto completo. La idempotencia por `inventoryRequestId` en MOD12 evita el doble movimiento. |
| **D8** | **Tenant y actor salen del sobre, no del payload.** El consumidor fija `TenantContext` con el `tenantId` del sobre interno, verificado contra `public.tenants`, y ejecuta como el actor original (`actorUserId` en V2) solo para auditoría, **sin evaluar permisos HTTP**: la autorización ya ocurrió al registrar el consumo en MOD11. | Evita que un payload elija esquema. Mantiene la trazabilidad de quién movió el stock. A validar por `sec-eng` (§6). |

**Fuera de alcance:**

- el ajuste o reverso de un consumo ya confirmado (deuda MOD12 de la spec de corrección §7);
- la custodia de cuadrilla (`CREW`), que R3 ya declaró sin verificar;
- cambios de UI más allá de mostrar el motivo del rechazo;
- el p95 y G7.

## 3. Contrato `InventoryConsumptionRequestedV2` (se congela al aprobar)

Archivo: `packages/shared/src/contracts/operations/execution-orders.ts`, contrato **v1.6**.

```ts
export interface InventoryConsumptionRequestedV2 extends EventPayloadBase {
  inventoryRequestId: string;        // clave de idempotencia extremo a extremo
  itemId: string;
  quantity: number;
  serial?: string;                   // presente => quantity = 1
  technicianCustodyId: string;       // origen: custodia del ejecutor
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  subscriberId?: string | null;      // de la OT; requerido por MOD12 solo para INSTALLED_AT_CUSTOMER
  actorUserId: string;               // quién registró el consumo (auditoría)
}
```

`InventoryMovementRejectedV1.reasonCode` usa el catálogo de §4. `ExecutionOrderItemUsage` gana `rejectionReasonCode?: string | null`.

## 4. Catálogo de motivos de rechazo

| `reasonCode` | Cuándo |
| --- | --- |
| `CUSTODY_INSUFFICIENT` | La custodia de origen no tiene la cantidad |
| `SERIAL_NOT_IN_CUSTODY` | El serial no está en la custodia de origen |
| `SUBSCRIBER_REQUIRED` | `INSTALLED_AT_CUSTOMER` sin suscriptor ni sitio de cliente |
| `ITEM_INACTIVE` | El artículo no está activo |
| `LEGACY_REQUEST_UNSUPPORTED` | Llegó un V1 sin contexto. D7 lo reemite como V2. |

El copy visible de cada código lo define `prod-ux` en G1.

## 5. Criterios de aceptación

- **CA-01** — Un consumo `INSTALLED_AT_CUSTOMER` de un serial en custodia termina `CONFIRMED`, con `stock_movement_id`. El serial sale de la custodia del técnico, queda en el sitio del cliente y abre comodato.
- **CA-02** — Un consumo de cantidad descuenta el saldo de la custodia de origen.
- **CA-03** — Tras CA-01, el selector de custodia de R3 **ya no ofrece** ese serial.
- **CA-04** — Una violación de negocio termina `REJECTED`, con su `reasonCode` persistido y visible en la consola, **sin reintentos**.
- **CA-05** — Idempotencia: reprocesar la misma solicitud, ya sea por reintento del job, re-solicitud D7 o duplicado de la cola, produce **un solo** movimiento y **una sola** transición de estado.
- **CA-06** — Un fallo técnico en MOD12 reintenta y no deja el consumo en un estado intermedio inconsistente. Al agotar los intentos, el job queda en la DLQ y el consumo sigue `PENDING`, listo para la re-solicitud.
- **CA-07** — Un consumo `PENDING` registrado con V1 termina conciliado gracias a la re-solicitud D7.
- **CA-08** — Aislamiento: una solicitud nunca mueve stock de otro tenant, y un `tenantId` que no existe se descarta y queda registrado.
- **CA-09** — Una confirmación tardía sobre una OT terminal se anexa sin reescribir el resultado ni el cierre (ADR-068, decisión 10).

## 6. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | El consumidor fija el tenant desde el sobre interno. Verificación de CA-08 a cargo de `sec-eng`. |
| **Seguridad** | Un nuevo consumidor ejecuta mutaciones de inventario fuera de HTTP. La autorización se hereda del registro en MOD11. `sec-eng` dictamina D8 antes de G4. |
| **Datos** | Una columna aditiva nula (migración 138). Sin backfill. El outbox de MOD12 se evita (D4). |
| **Escala** | Un job por consumo. El movimiento ya está indexado por clave de idempotencia. |
| **Regulación** | `subscriberId` viaja como identificador opaco, no como PII de contenido (ADR-067). A confirmar por `sec-eng`. |
| **Boundaries** | MOD11 y MOD12 se comunican solo por eventos y colas. Ningún módulo lee tablas del otro. |

## 7. Bloques (detalle en el plan)

| Bloque | Qué entrega | Dueño |
| --- | --- | --- |
| **I1** | Contrato v1.6, emisión de V2 desde MOD11, re-solicitud D7, migración 138, el worker reencola V2 y aplica `rejectionReasonCode` | `sr-backend` |
| **I2** | Consumidor de MOD12 en la cola `inventory-execution-requests`, clasificación rechazo/error y emisión de la respuesta | `sr-backend` |
| **I3** | Copy del motivo de rechazo en la consola | `fe-platform` |
| **I4** | Verificación extremo a extremo de CA-01 a CA-09 contra Postgres y Redis reales | `sr-qa` |

## 8. Deuda que esta spec no cierra

1. El ajuste o reverso de consumos confirmados (MOD12).
2. La custodia `CREW` de punta a punta.
3. Los consumos `PENDING` de entornos de desarrollo creados antes de D7: se concilian al desplegar la re-solicitud. No hay datos productivos.
