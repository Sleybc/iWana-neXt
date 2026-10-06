# Diseño — MOD11 ↔ MOD12: el consumo de una OT mueve el inventario

**Versión:** 1.1
**Estado:** **Aprobado por el CTO el 2026-10-06**, con las tres ratificaciones del §11: excepción D3, DDL de las migraciones 138 y 139, y finalidad D12. También quedan aprobados el secreto `INTERNAL_QUEUE_SIGNING_KEY` y ADR-074 (propuesto) como condición de G7. **El contrato v1.6 del §3 queda congelado desde esta aprobación.**
**Fecha:** 2026-10-06
**Cambio v1.0 → v1.1 (2026-10-06):** incorpora los tres dictámenes de G1 (`INFORME-MOD11-MOD12-INVENTARIO-G1-{SR-FULL,SEC-ENG,PROD-UX}-v1.0.md`). Cambia el contenido de D3, D4, D5, D7 y D8, nacen D9 a D12, y se completan el contrato (§3), el catálogo (§4) y los criterios (§5). El detalle de qué cambió y por qué está en §10.
**Modo:** Architect + EM
**Autor:** AI-EM-ARCH
**Origen:** hallazgo de R5 v1.3. El consumo de `OTE-20261006-003` quedó `PENDING` para siempre. La causa la verificó el orquestador: el consumidor que ADR-068 prescribe no existe. El CTO decidió el 2026-10-06 abrir esta definición en paralelo y no bloquear el G6 de la consola, **con la condición de que G7 no ocurra sin esta pieza**.

**ADR que se implementa, sin modificarlo:**

- [ADR-068](../adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado), decisión 6, decisión 10 y tabla de eventos;
- ADR-048 (Aprobado), por el ownership de inventario en MOD12;
- [ADR-067](../adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md) (Aprobado), por la finalidad del dato y la prohibición de PII en logs y errores.

**Relacionado:** [ADR-074](../adrs/ADR-074-Autenticacion-de-Redis.md) (propuesto). Ver D8.

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md`

---

## 1. Problema

ADR-068 decide una coreografía en tres pasos:

1. MOD11 emite `InventoryConsumptionRequestedV1` por su outbox;
2. MOD12 mueve el stock;
3. MOD12 responde con `InventoryMovementConfirmedV1` o `InventoryMovementRejectedV1`, y MOD11 concilia el consumo.

En el código **solo existen los extremos**:

- MOD11 emite la solicitud (`registerItemUsage`);
- MOD12 sabe mover el stock de una OT de forma idempotente (`StockLedgerService.recordExecutionOrderMovement`, `stock-ledger.service.ts:692`). El dictamen F1 §1 lo confirmó también para el comodato y los eventos de dominio;
- MOD11 sabe aplicar la respuesta (`execution-order-events.processor.ts:472-570`).

Lo que falta es lo de en medio:

- **nadie consume la solicitud**: el handler del worker la deja sin efecto, en `:221-226`;
- **nadie emite la respuesta**;
- **el evento V1 no lleva** custodia, acción, disposición, suscriptor ni actor.

**Efecto operativo:** ningún consumo de OT descuenta stock ni custodia. Un CPE instalado sigue en la custodia del técnico y el selector de R3 lo vuelve a ofrecer. Todo consumo queda `PENDING` para siempre.

## 2. Decisiones

| # | Decisión | Por qué |
| --- | --- | --- |
| **D1** | **Nace `InventoryConsumptionRequestedV2`** con el contexto completo (§3). V1 no se amplía. | Los eventos V1 ya escritos no traen el contexto y MOD12 no puede leerlo de tablas de MOD11. |
| **D2** | **La entrega a MOD12 va por una cola propia, `inventory-execution-requests`.** El handler del worker para V2 la reencola con `jobId = eventId` de la solicitud. | El relay sigue siendo genérico. Dos consumidores sobre `operations-execution-events` se repartirían los jobs. |
| **D3** | **El consumidor de MOD12 vive en el proceso API, dentro del módulo de inventario. Es una excepción explícita al patrón «API produce, worker consume»**, con precedente en `users-bulk-create.processor.ts`, que también se declara deuda. Lleva concurrencia fija, configurable y declarada, y pruebas de cableado. **Requiere ratificación del CTO** (§11.1). | El ledger, con su comodato, sus transiciones de activo y sus eventos de dominio, vive en el API. Reimplementarlo en el worker duplicaría la lógica de inventario. Extraerlo a una librería de dominio es la salida limpia, pero desproporcionada para este hueco. Queda como deuda (§8.4). |
| **D4** | **Resultado terminal persistido por MOD12: el recibo.** Nace la tabla de MOD12 `inventory_execution_request_receipts`, con `inventory_request_id` único por tenant, `outcome` (`CONFIRMED` o `REJECTED`), `stock_movement_id`, `reason_code` y `decided_at` (migración 139). El recibo se escribe **en la misma transacción que el movimiento** si se confirma, o **solo** si se rechaza. Antes de evaluar nada, el consumidor busca el recibo: **si existe, reemite la misma respuesta sin volver a evaluar.** La respuesta lleva `eventId = uuidv5(inventoryRequestId)`, una por solicitud y nunca una por resultado. **No hay outbox de MOD12**: el job se completa solo después de que `Queue.add()` de la respuesta haya sido aceptado. | Sin recibo, un rechazo cuya respuesta no llegó se reevaluaría con otra disponibilidad y podría convertirse en confirmación. Es la consulta bloqueante de F1 §5. Con el recibo, una solicitud produce siempre la misma respuesta. |
| **D5** | **El rechazo es un resultado tipado, no una excepción leída por su mensaje.** El ledger, en el camino de OT, lanza `InventoryBusinessRejection` con su `reasonCode` del §4, **solo** después de validaciones explícitas. Se añaden las dos que hoy no existen: **el serial está en la custodia de origen** y **el artículo está activo**. Los errores técnicos (PostgreSQL, Redis, timeout, `23505` de carrera) se propagan y se reintentan. | El ledger actual lanza `BadRequestException` genéricas y no valida ni la custodia del serial ni el estado del artículo (F1 §2). |
| **D6** | **El motivo del rechazo se persiste y se expone.** Columna aditiva `rejection_reason_code` en `execution_order_item_usage` (migración 138: nula, `down` reversible). Campo opcional `rejectionReasonCode` en `ExecutionOrderItemUsage`, con el contrato en **v1.6**. Copy de U1 (§4). | Un «Rechazado» sin motivo deja al técnico sin saber qué hacer. |
| **D7** | **Re-solicitud de pendientes antiguos, propiedad de MOD11, en el worker.** Itera `public.tenants`, valida el esquema y fija `SET LOCAL search_path`. Elige los consumos `PENDING` cuyo `last_requested_at` supera el umbral con `FOR UPDATE SKIP LOCKED`, para que varias réplicas no se pisen. Por cada uno escribe una **solicitud V2 nueva en el outbox**: `eventId` nuevo, **mismo `inventoryRequestId`**. Incrementa `request_attempts` y actualiza `last_requested_at`, dos columnas que se añaden en la migración 138. La configuración tiene **umbral de 15 minutos y tope de 10 intentos** por defecto. Al alcanzar el tope, deja de reemitir y el consumo queda `PENDING` con el copy de «pendiente prolongado» y una métrica de atascados. | La reemisión es segura **por el recibo de D4**: si MOD12 ya decidió, reemite la misma respuesta. No hace falta saber si la anterior sigue en vuelo. El `eventId` nuevo evita chocar con el inbox y con el `jobId` retenido de BullMQ (F1 §6). Recupera también los consumos registrados con V1. El índice parcial `(movement_status, last_requested_at) WHERE movement_status = 'PENDING'` se añade **solo si** el `EXPLAIN` lo justifica. |
| **D8** | **Procedencia autenticada del job.** El sobre de la solicitud lleva una **firma HMAC-SHA256** calculada al reencolar (D2), con la clave `INTERNAL_QUEUE_SIGNING_KEY`, que gestiona `plat-ops` y no se versiona. El consumidor **rechaza sin procesar** un job con firma inválida, un tenant inexistente, un tenant externo distinto del interno o un payload que no supere la validación de runtime (Zod: UUID, cantidad positiva, enums, consistencia entre serial y cantidad). El esquema se deriva **solo** de `public.tenants`. Un tenant que no está `ACTIVE` se **difiere** con reintento y backoff, y no se rechaza como negocio. | Redis hoy acepta conexión sin contraseña (`REDIS_PASSWORD \|\| undefined`, y ADR-074 (propuesto) sigue Propuesto). La igualdad de tenant interno y externo no impide que alguien con acceso a la cola cambie ambos a la vez (S1 §1). La firma cierra ese hueco **sin depender de ADR-074** (propuesto). ADR-074 (propuesto) sigue siendo deseable y queda como condición de G7. |
| **D9** | **Actor: solo atribución.** `actorUserId` viaja en el payload V2 porque nace dentro de la transacción autorizada de MOD11, y su integridad la cubre la firma de D8. El consumidor construye un principal interno mínimo (`{ sub }`) para la auditoría del ledger: **sin rol, sin permisos y sin claims fabricados.** El adaptador del puerto expone esa firma, de modo que el ledger no recibe un `JwtPayload` inventado. | Resuelve la contradicción entre D8 de la v1.0 y §3 (F1 §7, S1 §2). La autorización ocurrió en MOD11: el controlador exige `OPERATIONS_EXECUTION_ORDERS_EXECUTE` y `assertCustodyAssignment` exige que la custodia sea del técnico asignado. |
| **D10** | **La respuesta no compite con la versión de la OT.** `InventoryMovementConfirmedV1` y `InventoryMovementRejectedV1` **salen de la guarda `aggregateVersion`** del consumidor de proyección (`execution-order-events.processor.ts:121-140`). Se deduplican por inbox (`eventId`) y se aplican con una **transición condicional única**: `UPDATE … SET movement_status = $estado … WHERE inventory_request_id = $1 AND movement_status = 'PENDING'`. Un duplicado idéntico es no-op. Un resultado contradictorio sobre un consumo ya decidido **no sobrescribe**: se registra como anomalía. | Con la guarda actual, la respuesta se descartaría siempre, porque la solicitud ya ocupó su versión, y más aún tras un cierre. Rompería CA-01 a CA-09 (consulta bloqueante de F1 §4). Los handlers actuales además permiten pasar de `REJECTED` a `CONFIRMED` y al revés. |
| **D11** | **Diagnóstico sin PII.** Las DLQ y los logs del consumidor de MOD12 **y** del handler de reencolado guardan solo campos permitidos: código o tipo de error, número de intentos, fecha, `tenantId`, `executionOrderId`, `inventoryRequestId` y `eventId`. **Nunca el payload ni el mensaje crudo de la excepción.** Retención: `removeOnComplete` inmediata y `removeOnFail` de 30 días. Se corrige también el DLQ actual de `execution-order-events`, que copia el sobre completo y el `error.message` (S1 §4), al menos para los tipos de inventario. | ADR-067 §8 y `AGENTS.md` prohíben PII en logs y errores. Con V2, el sobre lleva `subscriberId` y `actorUserId`. |
| **D12** | **`subscriberId`: finalidad única.** Solo viaja cuando `finalDisposition = INSTALLED_AT_CUSTOMER`, para resolver el sitio del cliente y abrir el comodato. En los demás casos es `null`. Se trata como **identificador seudónimo enlazable**, no como dato anónimo. Su retención en la cola la acota D11. **Requiere ratificación del CTO** como finalidad declarada bajo ADR-067 (§11.3). | ADR-067 autoriza proyecciones mínimas con finalidad por campo, pero no declara colas (S1 §3). |

**Restricciones para la v1, que declara el dictamen F1 §7:**

- La OT no guarda sitio de cliente propio ni contrato. **`customerSiteLocationId` y `contractRefId` viajan `null`.** `INSTALLED_AT_CUSTOMER` exige `subscriberId`; si falta, el resultado es `SUBSCRIBER_REQUIRED`.
- **La custodia `CREW` se rechaza en la emisión**, en MOD11, mientras no exista la verificación de membresía y vigencia que pide ADR-068. Se responde con un error de producto. El código actual solo emite una advertencia (S1 §2).

**Fuera de alcance:**

- el ajuste o reverso de un consumo ya confirmado;
- la custodia `CREW`;
- la UI más allá del motivo y del copy de pendiente;
- el p95 y G7.

## 3. Contrato v1.6 (se congela al aprobar)

Archivo: `packages/shared/src/contracts/operations/execution-orders.ts`.

```ts
export interface InventoryConsumptionRequestedV2 extends EventPayloadBase {
  inventoryRequestId: string;        // idempotencia extremo a extremo (ledger + recibo)
  itemId: string;
  quantity: number;                  // > 0; con serial => 1
  serial?: string;
  technicianCustodyId: string;       // custodia de origen; solo TECHNICIAN en v1
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  subscriberId: string | null;       // solo para INSTALLED_AT_CUSTOMER (D12)
  actorUserId: string;               // atribución, no autorización (D9)
}
// InventoryMovementConfirmedV1 / RejectedV1: sin cambio de forma; reasonCode ∈ catálogo §4.
// ExecutionOrderItemUsage: + rejectionReasonCode?: string | null
```

**Sobre interno de la cola `inventory-execution-requests`** (no es contrato público): `{ tenantId, envelope, signature }`. `signature` es la HMAC del sobre canónico.

El esquema Zod de runtime vive junto al contrato y lo consumen tanto el worker como el API.

## 4. Catálogo de motivos y copy (U1)

| `reasonCode` | Cuándo (validación explícita, D5) | Qué pasó (visible) | Qué hacer (visible) |
| --- | --- | --- | --- |
| `CUSTODY_INSUFFICIENT` | El saldo de la custodia de origen no alcanza | No hay suficientes unidades disponibles en tu inventario asignado. | Revisa la cantidad solicitada. Si necesitas más unidades, pide a tu supervisor que actualice tu inventario asignado. |
| `SERIAL_NOT_IN_CUSTODY` | El serial no está en la custodia de origen (**validación nueva**) | El equipo con ese número de serie no figura en tu inventario asignado. | Comprueba el número de serie. Si es correcto, pide a tu supervisor que revise la asignación del equipo. |
| `SUBSCRIBER_REQUIRED` | `INSTALLED_AT_CUSTOMER` sin `subscriberId` | La orden no indica el cliente o la sede donde se instalará el equipo. | Pide a tu supervisor que complete esos datos en la orden y vuelve a registrar el consumo. |
| `ITEM_INACTIVE` | El artículo no está activo (**validación nueva**) | El producto seleccionado ya no está disponible para registrar consumos. | Elige otro producto disponible. Si necesitas usar este producto, pide a tu supervisor que revise su disponibilidad. |
| `PENDING` prolongado | D7 alcanzó el tope de intentos, o el consumo supera el umbral | El consumo aún no se ha aplicado al inventario. | No lo registres de nuevo. Revisa el estado de la orden más tarde; si sigue igual, avisa a tu supervisor. |

**Se retira `LEGACY_REQUEST_UNSUPPORTED`** respecto de la v1.0. El consumidor de MOD12 solo escucha la cola de V2. Los consumos V1 nunca le llegan: los recupera D7 como V2. Un rechazo `LEGACY` cerraría como `REJECTED` un pendiente que D7 debía recuperar (F1 §2).

## 5. Criterios de aceptación

- **CA-01** — Un consumo `INSTALLED_AT_CUSTOMER` de un serial en custodia termina `CONFIRMED`, con `stock_movement_id`. El serial sale de la custodia del técnico, queda en el sitio del cliente y abre comodato.
- **CA-02** — Un consumo de cantidad descuenta el saldo de la custodia de origen.
- **CA-03** — Tras CA-01, el selector de custodia de R3 ya no ofrece ese serial.
- **CA-04** — Cada motivo del §4 termina `REJECTED`, con su `reasonCode` persistido y el copy visible, **sin reintentos**. Para `SERIAL_NOT_IN_CUSTODY`, con un serial que existe en **otra** custodia.
- **CA-05** — Idempotencia: el reintento del job, la re-solicitud D7 y un duplicado de la cola producen **un solo** movimiento, **un solo** recibo y **una sola** transición. Hay que probar también la carrera de dos jobs simultáneos (`23505` → reintento → recibo existente).
- **CA-06** — Un fallo técnico reintenta. Al agotar los intentos, el job queda en la DLQ con diagnóstico conforme a D11, sin payload, y el consumo sigue `PENDING`.
- **CA-07** — Un consumo `PENDING` registrado con V1 termina conciliado gracias a D7. Al alcanzar el tope de intentos, queda `PENDING` con el copy de pendiente prolongado.
- **CA-08** — Aislamiento, probado por negación:
  - (a) un tenant inexistente se descarta;
  - (b) un tenant externo distinto del interno se descarta;
  - (c) **un job de A con el tenant cambiado a B y la firma inválida no mueve nada en B**;
  - (d) A y B procesados en paralelo no contaminan `TenantContext` ni `search_path`;
  - (e) un tenant que no está `ACTIVE` se difiere.
- **CA-09** — Una respuesta que llega **después de que la OT cerró** se aplica (D10) sin reescribir el resultado ni el cierre (ADR-068, decisión 10).
- **CA-10** — Un resultado contradictorio sobre un consumo ya decidido no lo sobrescribe y queda registrado como anomalía.
- **CA-11** — Las DLQ y los logs de los tipos de inventario no contienen `subscriberId`, `actorUserId`, el payload ni el mensaje crudo de la excepción. Se verifica inspeccionando un job fallido real.

## 6. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Esquema derivado solo de `public.tenants` (D8). CA-08 con cinco negaciones. |
| **Seguridad** | Mutación de inventario fuera de HTTP con autorización heredada (D9) y procedencia firmada (D8). La clave HMAC es un secreto nuevo, gestionado por `plat-ops`. |
| **Datos** | Migración 138 (MOD11: `rejection_reason_code`, `last_requested_at`, `request_attempts`). Migración 139 (MOD12: recibos). Ambas aditivas y reversibles. Sin backfill. El índice parcial de D7, solo con `EXPLAIN`. |
| **Escala** | Un job por solicitud. El recibo y el movimiento están indexados por clave. D7 recorre por tenant con `SKIP LOCKED`. |
| **Regulación** | `subscriberId` con finalidad única (D12), retención acotada (D11) y fuera de logs. |
| **Boundaries** | MOD11 y MOD12 se comunican solo por eventos y colas. Ningún módulo lee tablas del otro. La excepción D3 queda declarada. |

## 7. Bloques (detalle en el plan)

| Bloque | Qué entrega | Dueño |
| --- | --- | --- |
| **I1** | Lado MOD11: contrato v1.6 y esquema Zod, emisión de V2 con rechazo de `CREW`, migración 138, D7 en el worker, reencolado firmado (D2 y D8), D10 en el consumidor de proyección y D11 en el DLQ de `execution-order-events` | `sr-backend` |
| **I2** | Lado MOD12: migración 139 de recibos, `InventoryBusinessRejection` y las dos validaciones nuevas en el ledger, consumidor en el API (D3 y D8), principal interno (D9), emisión de la respuesta (D4) y DLQ conforme a D11 | `sr-backend` |
| **I3** | Consola: motivo del rechazo y copy de pendiente prolongado (§4) | `fe-platform` |
| **I4** | Verificación de CA-01 a CA-11 contra Postgres y Redis reales, con inspección de la DLQ | `sr-qa` |
| **P1** | `INTERNAL_QUEUE_SIGNING_KEY` en las plantillas de entorno y en el despliegue, con rotación documentada | `plat-ops` |
| **S2** | Revisión de seguridad del código de I1 e I2 antes de G6 (D8, D9, D11, CA-08) | `sec-eng` |

## 8. Deuda que esta spec no cierra

1. El ajuste o reverso de consumos confirmados (MOD12).
2. La custodia `CREW` de punta a punta. Queda rechazada en la emisión mientras tanto.
3. ADR-074 (propuesto), la autenticación de Redis, sigue Propuesto. D8 no depende de él, pero **G7 lo exige**.
4. **Excepción D3:** consumidor de jobs en el proceso API. Saldarla exige extraer el ledger a una librería de dominio consumible desde el worker. Se suma a la deuda ya declarada de `users-bulk-create`.
5. El DLQ de `execution-order-events` para los tipos que no son de inventario: D11 solo cubre los de inventario. Generalizarlo es deuda de `plat-ops`.

## 9. Artefactos que esta spec no supera

Ninguno. Implementa ADR-068 sin enmendarlo.

## 10. Resolución de la revisión cruzada G1 (2026-10-06)

| Origen | Consulta | Resolución en v1.1 |
| --- | --- | --- |
| F1 §3 | ¿Un processor en el API es excepción o política? | **Excepción explícita** (D3), con ratificación del CTO y deuda §8.4 |
| F1 §4 | La respuesta tardía se descarta por la guarda `aggregateVersion` (**bloqueante**) | **D10**: fuera de la guarda, inbox por `eventId` y transición condicional única |
| F1 §4 | Los handlers permiten pasar de `REJECTED` a `CONFIRMED` y al revés | **D10** + **CA-10** |
| F1 §5 | Un rechazo no es idempotente sin outbox (**bloqueante**) | **D4**: recibo terminal de MOD12 y `eventId` por solicitud, no por resultado |
| F1 §2 | Rechazos inferidos de mensajes; faltan validaciones de serial y artículo | **D5**: `InventoryBusinessRejection` y dos validaciones nuevas |
| F1 §6 | D7 sin umbral, sin detección de vuelo, sin coordinación, con `jobId` retenido | **D7**: 15 min / 10 intentos, `SKIP LOCKED`, `eventId` nuevo por reemisión, seguridad apoyada en el recibo |
| F1 §7 | Faltan `customerSiteLocationId` y `contractRefId`; contradicción del actor | Ambos `null` en v1 (restricciones §2) · **D9** |
| S1 §1 | Procedencia del job no autenticada; Redis sin contraseña | **D8**: HMAC + validación de runtime · ADR-074 (propuesto) pasa a G7 · CA-08 (a)-(e) |
| S1 §1 | ¿Qué hacer con un tenant suspendido? | Se **difiere**, no se rechaza (D8, CA-08 e) |
| S1 §2 | Custodia `CREW` en fail-open | Se rechaza en la emisión (restricciones §2) |
| S1 §3 | `subscriberId` en Redis bajo ADR-067 | **D12** + ratificación del CTO |
| S1 §4 | La DLQ y los logs copian el payload y el error crudo | **D11** + **CA-11** |
| U1 | Copy de los cinco motivos y del pendiente prolongado | Adoptado en §4. `LEGACY` se retira junto con su copy |

## 11. Ratificaciones que pide al CTO

1. **D3**: consumidor en el proceso API como excepción declarada, con su deuda.
2. **DDL**: migraciones 138 (MOD11) y 139 (MOD12), aditivas y reversibles.
3. **D12**: finalidad única de `subscriberId` en la cola, bajo ADR-067.

Además, el secreto nuevo `INTERNAL_QUEUE_SIGNING_KEY` (D8) y que **ADR-074** (propuesto) pase a ser condición de G7.
