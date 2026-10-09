# PROMPT DE EJECUCIÓN — MOD11 ↔ MOD12 · Implementación del consumo de inventario de OT

**Versión:** 1.0 · **Fecha:** 2026-10-06 · **Generado por:** AI-EM-ARCH
**Spec que ejecuta:** `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` **v1.1, aprobada por el CTO el 2026-10-06**. Es de lectura obligatoria completa; las decisiones D1 a D12 **no se re-litigan**.
**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1, con la matriz de skills en su §3.
**Contrato congelado:** spec §3, que se materializa como `packages/shared/src/contracts/operations/execution-orders.ts` **v1.6**. Lo materializa I1 en su paso 1 y nadie más lo modifica. Un cambio de contrato es `[BLOQUEO]` hacia AI-EM-ARCH.
**Reglas comunes:**

- Sin commit.
- Conteo real con `Cached: 0`.
- No editar fuera de los archivos propios de cada bloque.
- Ningún log, mensaje de error ni DLQ lleva el payload ni PII (D11).

---

## P1 — `plat-ops`: secreto de firma (ola 1)

1. `INTERNAL_QUEUE_SIGNING_KEY` en `.env.example` y en los Compose (`docker-compose*.yml`) para `api` y `worker`, **sin valor real**: un marcador más una instrucción de generación (32 bytes aleatorios en base64).
2. **Arranque fail-closed:** si la clave falta o es más corta que el mínimo, `api` y `worker` no arrancan en producción. En desarrollo y pruebas, la clave se toma de las plantillas.
3. Procedimiento de rotación documentado en `docs/`: doble clave con una ventana de aceptación, y lo que ocurre con los jobs en vuelo.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-P1-PLAT-OPS-v1.0.md`.

## I1 — `sr-backend`: lado MOD11 (ola 1)

**Archivos propios:**

- `packages/shared` (contrato y esquema Zod);
- `apps/api/src/modules/tasks/**`;
- `packages/database` (migración **138** y entidad del consumo);
- `apps/worker/src/**` (processor de eventos, DLQ y nuevo scanner D7).

**Pasos:**

1. **Contrato v1.6 primero**, en un paso independiente. Incluye `InventoryConsumptionRequestedV2` y `rejectionReasonCode` (spec §3), y el **esquema Zod de runtime** exportado desde `@iwana/shared`, que I2 consume. Sube el docstring a v1.6. Este paso **habilita la ola 2**: señálalo en cuanto esté en verde.
2. **Emisión V2** en `registerItemUsage`, con `subscriberId` solo para `INSTALLED_AT_CUSTOMER` (D12). Si la custodia es `CREW`, se rechaza con un error de producto (restricciones §2).
3. **Migración 138:** `rejection_reason_code`, `last_requested_at` y `request_attempts`. Las tres son nulas o con valor por defecto, y el `down` es reversible.
4. **Worker:**
   - el handler V2 **reencola** en `inventory-execution-requests` con `jobId = eventId` y la firma HMAC (D2, D8);
   - las respuestas de inventario **salen de la guarda `aggregateVersion`** y se aplican con la transición condicional única; un resultado contradictorio se registra como anomalía (D10);
   - el DLQ de los tipos de inventario queda conforme a D11.
5. **Scanner D7** en el worker: `SKIP LOCKED`, umbral de 15 minutos y tope de 10 intentos configurables, y un `eventId` nuevo por cada reemisión. Ante cualquier índice, `EXPLAIN` primero.

**Gates:**

- typecheck;
- jest de `tasks` (≥ 717) y del worker (≥ 117) con `Cached: 0`;
- la 138 con `down` ejercitado contra Postgres real.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-I1-v1.0.md`.

## I1-R — `sr-backend`: remediación de D7 (ola 2, adenda del 2026-10-06 tras la auditoría de I1)

**Defecto.** El scanner (`apps/worker/src/services/execution-order-inventory-rescan.service.ts`) arma con Zod cada consumo `PENDING` dentro de **una sola transacción por tenant**, en orden de antigüedad. `inventory_request_id` y `actor_user_id` son **nulables** en `execution_order_item_usage`. Una fila sin esos datos, o con un valor que Zod no acepte, **revierte todo el lote del tenant en cada ciclo**. Como el orden es por antigüedad, esa fila queda primera para siempre y **ningún pendiente de ese tenant vuelve a solicitarse**. CA-07 falla justo con los consumos antiguos que D7 debía recuperar.

**Alcance:**

- Cada fila se procesa con su propio `SAVEPOINT`. Una fila que no pasa la validación se excluye y se cuenta como `irrecuperable` con un código: `MISSING_REQUEST_ID`, `MISSING_ACTOR` o `INVALID_PAYLOAD`. Se registra en un log con los identificadores de D11, sin payload, y no bloquea al resto.
- Para no reintentarla en cada ciclo, marca la fila con `request_attempts = maxAttempts`, sin columna nueva. Así cae en el conteo de atascados y la consola muestra el copy de pendiente prolongado.
- Tests: un lote con una fila envenenada en primer lugar sigue reemitiendo las demás.

**Archivos propios:** el servicio de rescan y su spec. **Gates:** worker ≥ 123 más los casos nuevos, con `Cached: 0`. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-I1-R-v1.0.md`.

## I2 — `sr-backend`: lado MOD12 (ola 2, después del paso 1 de I1)

**Archivos propios:**

- `apps/api/src/modules/inventory/**`;
- `packages/database` (migración **139**, recibos).

**Pasos:**

1. **Migración 139**, tabla `inventory_execution_request_receipts` (D4): `inventory_request_id` único por tenant, `down` reversible.
2. **Ledger, camino de OT:** `InventoryBusinessRejection(reasonCode)` y las validaciones nuevas `SERIAL_NOT_IN_CUSTODY` e `ITEM_INACTIVE` (D5). **No cambies el comportamiento de los demás caminos del ledger.**
3. **Consumidor `@Processor('inventory-execution-requests')`** en `InventoryModule` (D3), con concurrencia declarada y en este orden:
   1. verificar la firma;
   2. validar con Zod;
   3. resolver el tenant en `public.tenants`; si no está `ACTIVE`, diferir (D8);
   4. buscar el recibo; si existe, reemitir la misma respuesta (D4);
   5. ejecutar el ledger con el principal interno `{ sub }` (D9);
   6. escribir el recibo en la misma transacción;
   7. encolar la respuesta con `eventId = uuidv5(inventoryRequestId)` y completar el job **solo** si el encolado fue aceptado.

   Un rechazo de negocio completa el job sin reintentar. Un `23505` o un error técnico se reintentan.
4. DLQ y logs conforme a D11.

**Gates:**

- typecheck;
- jest de `inventory` con `Cached: 0`;
- la 139 con `down` ejercitado;
- **la carrera de dos jobs simultáneos probada** (CA-05).

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-I2-v1.0.md`.

## I2-R — `sr-backend`: semántica de la custodia y `down` de la 139 (adenda del 2026-10-06, auditoría de la ola 2)

**Defecto P1, verificado por el orquestador en el código.** `technicianCustodyId` significa una cosa distinta a cada lado:

- **MOD11 lo emite como id del técnico.** `assertCustodyAssignment` exige que `custodyId === order.assignedTechnicianId` (`execution-orders.service.ts:3582-3599`).
- **MOD12 lo usa como id de ubicación.** El ledger lo pone como `locationId` de la línea (`stock-ledger.service.ts:~1514`). La validación nueva de I2 compara `asset.currentLocationId` y el saldo contra ese valor.

La custodia real es una `StockLocation` móvil cuyo `responsibleRefId` es el técnico (`executor-custody.service.ts:47-58`, con índice único parcial). Su `id` no es el del técnico. Resultado: **en un entorno real, todo consumo sale como `CUSTODY_INSUFFICIENT` o `SERIAL_NOT_IN_CUSTODY`**. Los tests no lo detectaron porque usan dobles.

**Decisión (re-sync del contrato v1.6, sin cambio de forma):** `technicianCustodyId` es el **`responsibleRefId` del técnico**, que es lo que MOD11 ya emite. **MOD12 resuelve la ubicación**: la `StockLocation` activa de tipo `MOBILE_TECHNICIAN` con ese `responsibleRefId`, mediante el mismo índice que `executor-custody`, antes del ledger. Si no hay custodia activa, el resultado es `CUSTODY_INSUFFICIENT`. A partir de ahí, la validación y las líneas del movimiento usan la **ubicación resuelta**. Aclara el docstring del campo en `execution-orders.ts`, sin cambiar el tipo, y anótalo como aclaración semántica de v1.6.

**Además:** el `down` de la 139 borra la tabla de recibos sin guarda. Replica el patrón de la 137: bloquea el rollback si hay recibos.

**Tests:** con fixtures reales de `StockLocation` móvil, cuyo `id` es distinto del `responsibleRefId`, un CPE serial en custodia termina `CONFIRMED`. Un técnico sin custodia activa termina en rechazo.

**Archivos propios:** `apps/api/src/modules/inventory/**`, la migración 139 y solo el docstring del campo en el contrato. **Gates:** typecheck y jest de `inventory` con `Cached: 0`. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-I2-R-v1.0.md`.

## T-FIX — `fe-platform`: tests que caducan con la fecha (adenda del 2026-10-06)

**Defecto.** Los 4 fallos de `use-execution-order-console.spec.ts` que I3 declaró ajenos son una **bomba de tiempo**. El fixture usa `expiresAt = '2026-10-06T12:00:00.000Z'` y `isValidFutureEvidenceExpiry` compara contra `Date.now()`. Esos tests pasaron hasta el mediodía UTC del 2026-10-06 y fallan desde entonces. El orquestador los reprodujo a las 22:14 UTC. No es un defecto de producto.

**Alcance:**

- Pasa a fechas relativas (`Date.now() + …`) o a reloj falso (`jest.useFakeTimers().setSystemTime`) en todos los specs de `apps/portal/src/components/operations/` cuyo resultado dependa de comparar contra la hora actual: caducidad de evidencia, umbral de pendiente prolongado de I3 y antigüedad.
- Las fechas fijas que **no** dependen de la hora actual se quedan como están. Lista en el informe cuáles cambiaste y por qué.

**Gates:** `operations/` completo **sin fallos**, con `Cached: 0`, **y una segunda corrida con el reloj del sistema adelantado 30 días** para demostrar que no queda ninguna bomba. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-T-FIX-v1.0.md`.

## I3 — `fe-platform`: consola (ola 2, después del paso 1 de I1)

**Archivos propios:** `ExecutionOrderMaterialAction.tsx`, `use-execution-order-custody.ts` y sus pruebas (propiedad R3 según el informe B0 §5).

**Encargo:**

- mostrar el **motivo del rechazo** con el copy de la spec §4, en sus dos partes: qué pasó y qué hacer;
- mostrar el **pendiente prolongado** cuando el consumo supera el umbral.

Sin enums crudos. El umbral se lee de una constante compartida, no de un número mágico.

**Gates:**

- typecheck del portal;
- jest de `operations/` (≥ 759) con `Cached: 0`;
- `audit-ui.mjs` limpio.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-I3-v1.0.md`.

## S2 — `sec-eng`: revisión del código (ola 3, en paralelo con I4)

Auditoría de solo lectura del código de I1 e I2 contra D8, D9, D11 y CA-08:

- firma y comparación en tiempo constante;
- validación de runtime;
- derivación del esquema;
- ausencia de un `JwtPayload` fabricado;
- DLQ y logs sin PII, comprobados en el código y en un job fallido real.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-S2-SEC-ENG-v1.0.md`. Un hallazgo es `[BLOQUEO]` hacia el dueño del bloque.

## I4 — `sr-qa`: verificación extremo a extremo (ola 3)

CA-01 a CA-11 contra Postgres, Redis, api y worker reales en local, con los datos de prueba del seed de R5 o con datos nuevos del mismo mecanismo. Hay que incluir:

- las cinco negaciones de CA-08;
- la carrera de CA-05;
- la respuesta tardía tras el cierre (CA-09);
- la inspección de un job fallido en la DLQ (CA-11);
- CA-03 en el selector de custodia de la consola.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-I4-SR-QA-v1.0.md`.

## Ola 3b — remediación de I4 y S2 (adenda del 2026-10-07)

**Origen:** I4 **NO GO** (CA-04) y S2 **NO GO** (tres bloqueos sobre I1 y una consulta). El orquestador verificó cada hallazgo contra el código.

### R-API — `sr-backend`: `SUBSCRIBER_REQUIRED` como rechazo de negocio (I2)

**Causa.** El processor pasa `subscriberId: null` a `ExecutionOrderMovementSchema`, cuyo campo es `optionalTrimmedString(160)` (`inventory/dto/index.ts`): acepta `undefined`, no `null`. El `safeParse` falla y se lanza `UnrecoverableError('La solicitud no satisface el esquema del ledger.')`. No queda recibo y el job no se reintenta, así que el consumo se queda `PENDING`.

**Corrección.** **Antes** del esquema del ledger, clasifica de forma explícita: si `finalDisposition = INSTALLED_AT_CUSTOMER` y `subscriberId` viene vacío, se guarda el recibo `REJECTED/SUBSCRIBER_REQUIRED` por el mismo camino que `CUSTODY_INSUFFICIENT`, se responde y el job se completa sin reintentar. Con suscriptor, `null` se normaliza a `undefined` al construir la entrada del ledger. **Ningún motivo del catálogo §4 puede acabar en `UnrecoverableError`.**

**Fallos retenidos en la cola de origen (decisión sobre la consulta de S2).** D11 **incluye** el conjunto de jobs fallidos de las colas de origen de inventario. La recuperación nunca depende del sobre guardado en Redis: D7 reemite desde las filas durables de MOD11. Por eso, en `inventory-execution-requests`, el job fallido se elimina (`removeOnFail: true`) **una vez escrito su diagnóstico permitido** en la DLQ.

**Tests:** un test por cada motivo del §4 de la spec, comprobando el recibo `REJECTED` y que el job no se reintenta. **Gates:** jest de `inventory` con `Cached: 0`. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-R-API-v1.0.md`.

### R-WORKER — `sr-backend`: los tres bloqueos de S2 sobre I1

1. **El worker firma lo que le llegue (P1).** Antes de firmar un `InventoryConsumptionRequestedV2`, comprueba **en la misma transacción y en el esquema del tenant** que existe en `execution_order_outbox_events` una fila con el mismo `event_id`, `tenant_id`, `event_type` y `aggregate_id`, y con el **mismo payload canónico**. Si no existe o no coincide, el job **no se firma**: se descarta con un error del catálogo permitido y queda diagnóstico sin datos. Así el worker solo firma lo que salió del outbox de MOD11.
2. **`onFailed` escribe identificadores sin validar (P1).** Cada identificador se valida como UUID antes de escribirlo en logs o en la DLQ, siguiendo el patrón `safeUuid` del API. El que no pase se omite y se conservan solo el código del error, los intentos y la fecha.
3. **El relay registra mensajes crudos de excepción (P2).** Sustituye `error.message` y `String(error)` en `execution-order-relay.service.ts` (fallos de enqueue, de marcado y de escaneo) por un tipo de error del catálogo permitido, con el contexto que autoriza D11.
4. **Fallos retenidos de inventario en `operations-execution-events`.** Mismo criterio que en R-API: se eliminan una vez escrito su diagnóstico.

**Tests:**

- un V2 inyectado sin fila en el outbox **no se firma** ni llega a `inventory-execution-requests`;
- un V2 con fila pero con payload alterado tampoco;
- `onFailed` con identificadores malformados no los escribe;
- el relay no registra mensajes crudos.

**Gates:** worker con `Cached: 0`. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-R-WORKER-v1.0.md`.

### Re-verificación (después de R-API y R-WORKER)

- **I4 v1.1 (`sr-qa`):**
  - CA-04 con los cuatro motivos contra Postgres y Redis reales;
  - **copy visible de CA-04 y del pendiente prolongado** en la consola, sobre una OT de prueba **con snapshot de la plantilla v2**;
  - la inyección de S2 (V2 sin fila en el outbox) no mueve stock;
  - no quedan jobs fallidos de origen con sobre.

  Lo que ya pasó no se repite.
- **S2 v1.2 (`sec-eng`):** re-auditoría de solo lectura de los tres bloqueos y de la decisión sobre los fallos retenidos.

## Ola 3c — residuos de D11 (adenda del 2026-10-08)

**Origen:** R-API y R-WORKER cerraron en GO condicionado, y declararon dos casos en los que el sobre puede quedar retenido en Redis hasta 30 días:

- **(a) R-API:** en `onFailed`, si los identificadores son inválidos, no se escribe diagnóstico y no se elimina el job de origen.
- **(b) R-WORKER:** si falla el encolado del diagnóstico en la DLQ, el job de origen no se elimina.

### R-D11 — `sr-backend`

**Decisión (AI-EM-ARCH):** no basta con borrar el job después de escribir el diagnóstico; hace falta además un **tope de retención** como respaldo. En las colas de origen de inventario (`inventory-execution-requests` y los tipos de inventario en `operations-execution-events`), **`removeOnFail: { age: 86400 }`**, es decir, 24 horas, en lugar de 30 días. La DLQ diagnóstica conserva sus 30 días, porque no lleva datos sensibles.

1. **Caso (a):** con identificadores inválidos, se escribe un diagnóstico **sin identificadores**: solo `errorType`, `attemptsMade` y `failedAt`, los campos del catálogo permitido. Después se elimina el job de origen. Ajusta el esquema del diagnóstico para que los identificadores sean opcionales.
2. **Caso (b):** si falla el encolado del diagnóstico, se registra un log del catálogo permitido. El job de origen queda cubierto por el tope de 24 horas: **retención máxima del sobre, 24 horas**, sea cual sea el camino.
3. **Tests:** el caso (a) produce diagnóstico sin identificadores y borra el origen. El caso (b) deja el log y la opción de retención de 24 horas puesta en el job.

**Archivos propios:** `inventory-execution-request.processor.ts` y su spec; `execution-order-events.processor.ts` y su spec. **Gates:** jest de `inventory` y del worker con `Cached: 0`. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-R-D11-v1.0.md`.

## Ola 3d — cierre de CA-04 (adenda del 2026-10-08)

**Origen:** I4 v1.1 en **NO GO** (`INFORME-MOD11-MOD12-INVENTARIO-I4-SR-QA-v1.1.md`). La inyección sin outbox **pasa**, y también la retención D11 en las colas de origen. Quedan dos fallos.

### R-CA04 — `sr-backend`

1. **`listItemUsage()` no devuelve el motivo (causa verificada por el orquestador).** El `.select([...])` de `execution-orders.service.ts` (alrededor de las líneas 521-531) no incluye `'usage.rejectionReasonCode'`. El mapeo (`:3394`) lo convierte en `null` y la consola nunca recibe el código. **Corrección:** añadir la columna a la proyección y un test que la compruebe **contra Postgres real**, no solo con un doble. Revisa también el detalle y cualquier otra lectura del consumo.
2. **`SUBSCRIBER_REQUIRED` desaparece sin recibo (causa sin demostrar).** El registro devuelve 202 y el consumo queda `PENDING` con `request_attempts = 1`. No hay recibo y las colas de origen quedan vacías. Los tests unitarios de R-API pasan, así que **el fallo está en el recorrido integrado**. El orquestador descartó una hipótesis: el esquema V2 admite `INSTALLED_AT_CUSTOMER` con `subscriberId: null`. **Antes de corregir, diagnostica con evidencia:**
   - lee **solo los campos permitidos** del diagnóstico de la DLQ para ese `inventoryRequestId`. La DLQ tiene 20 jobs pausados que I4 no inspeccionó;
   - revisa los logs del worker y del API para ese id;
   - determina en qué tramo se pierde: emisión, cotejo con el outbox y firma, consumidor de MOD12 o persistencia del recibo.

   Corrige la causa y añade un **test de integración contra Postgres y Redis reales** que lleve el caso hasta `REJECTED/SUBSCRIBER_REQUIRED`.
3. **Regla nueva para este bloque:** cada motivo del §4 de la spec debe tener un test **integrado**, del registro en MOD11 al recibo en MOD12 y la proyección `REJECTED` en MOD11. Un rechazo de negocio no puede acabar sin rastro.

**Gates:** jest de `tasks`, `inventory` y del worker con `Cached: 0`, más los tests integrados con su conteo. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-R-CA04-v1.0.md`, con la causa demostrada del punto 2.

### Después de R-CA04

- **I4 v1.2:** solo CA-04 completo y el copy visible de los cuatro motivos en la consola.
- **S2 v1.2:** re-auditoría de solo lectura (bloqueos de I1, R-D11 y la retención). Puede correr en paralelo con R-CA04.

## Ola 3e — decisiones sobre el caso histórico y la retención D11 (adenda del 2026-10-09)

### Decisión 1 — el caso histórico `SUBSCRIBER_REQUIRED` se cierra por convergencia, no por forense

**No se habilita ninguna vía para leer jobs de Redis ni líneas completas de log.** Cualquier lectura de ese tipo materializa el sobre, y D11 existe justo para que el sobre no se lea. Un auto-review que lo bloquea está haciendo su trabajo.

**El criterio de cierre cambia** de «causa demostrada» a **«el estado converge con el código vigente»**:

1. El código actual cierra `SUBSCRIBER_REQUIRED` de punta a punta, como prueba R-CA04 con 4 de 4 recorridos integrados.
2. El consumo histórico sigue `PENDING`, así que D7 lo reemitirá: mismo `inventoryRequestId`, `eventId` nuevo. **Si termina `REJECTED/SUBSCRIBER_REQUIRED`**, la pérdida histórica queda declarada **no reproducible con el código vigente**. Hipótesis que **no se afirma**: un proceso API anterior a R-API seguía atendiendo la cola. La verificación usa **solo SQL de MOD11 y MOD12** (recibo, `movement_status`, `rejection_reason_code` y `request_attempts`); no se lee Redis.
3. **Si no converge**, se abre un hallazgo nuevo con la evidencia SQL. Seguiría sin leer el sobre.

### Decisión 2 — la retención de D11 se reformula y la limpieza no depende del contenido del job

S2 v1.2 tiene razón en los dos bloqueos. **La regla «24 horas pase lo que pase» fue mía y era inalcanzable**: ningún limpiador puede borrar nada si la plataforma entera está caída.

**D11 queda así:** *un job fallido en una cola de origen de inventario se elimina en un máximo de 24 horas **mientras al menos un proceso de la plataforma, API o worker, esté activo**. Con la plataforma caída no se procesa ni se retiene nada nuevo. Ese residuo queda cubierto en G7 por ADR-074 (Aprobado) y por la monitorización del worker.*

### R-D11b — `sr-backend`

1. **Limpieza independiente del contenido (D11-RET-02).** En la cola exclusiva `inventory-execution-requests`, borra **todo** job fallido con más de 24 horas: `queue.clean(86_400_000, lote, 'failed')`, **sin** filtrar por nombre ni por `eventType`. En la cola mixta `operations-execution-events`, haz lo mismo con **todos** los fallidos de más de 24 horas. La ruta genérica ya deja su diagnóstico permitido en la DLQ, así que borrar el job de origen no pierde nada.
2. **Dos procesos limpian, no uno (D11-RET-01).** El limpiador corre como **job repetible en el API y en el worker**, cada hora, de modo que basta con que uno de los dos esté vivo. La limpieza es idempotente.
3. **Tests:** se borra un fallido malformado, sin `eventType` y con más de 24 horas. Se conserva uno con menos de 24 horas. Funciona con un solo proceso activo.

**Gates:** jest de `inventory` y del worker con `Cached: 0`. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-R-D11B-v1.0.md`.

### Re-verificación final

- **I4 v1.2 (`sr-qa`):**
  - el copy visible de los cuatro motivos de CA-04 en la consola, ahora que la proyección trae el código, sobre una OT con snapshot v2;
  - la convergencia del caso histórico según la Decisión 1, **solo con SQL**.
- **S2 v1.3 (`sec-eng`):** re-auditoría de R-D11b frente a D11-RET-01 y D11-RET-02, con la D11 reformulada.

## Ola 3f — precisión del tope D11 y cierre de seguridad (adenda del 2026-10-09)

**Respuesta a la `[CONSULTA]` de R-D11b.** Con un periodo de gracia de 24 horas y una limpieza cada hora, un job fallido puede durar hasta casi 25 horas. **Decisión:** **gracia = 24 h − intervalo de limpieza**, es decir, 23 horas con el intervalo horario actual. La gracia se **deriva** de las dos constantes, no se fija a mano. Así, mientras haya al menos un proceso activo, ningún job fallido supera 24 horas desde `failedAt`.

### R-D11c — `sr-backend`

- En el API (`inventory-execution-request.processor.ts`) y en el worker (`execution-order-relay.processor.ts` y `execution-order-relay.service.ts`), la gracia pasa a calcularse como `INVENTORY_SOURCE_MAX_AGE_MS - INVENTORY_SOURCE_CLEANUP_INTERVAL_MS`. Define las dos constantes **una sola vez**, en `packages/shared/src/constants/`, y que ambos procesos las importen.
- **Test:** con el intervalo actual, la gracia es 23 horas, y un job fallido hace 23 h 30 min se borra en el siguiente ciclo.

**Gates:** jest de `inventory` y del worker con `Cached: 0`. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-R-D11C-v1.0.md`.

### S2 v1.3 — `sec-eng`, después de R-D11c

Re-auditoría de solo lectura de D11-RET-01 y D11-RET-02 frente a la D11 enmendada de la spec, que garantiza 24 horas mientras API o worker estén activos, y frente al código de R-D11b y R-D11c. **Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-S2-SEC-ENG-v1.3.md`, con GO o NO GO por bloqueo.

## Ola 3g — typecheck global en rojo antes de G6 (adenda del 2026-10-09)

**Hallazgo del orquestador, en la verificación en frío previa a G6.** `pnpm typecheck --force` falla en `@iwana/api` con `TS2554: Expected 6 arguments, but got 5` en `apps/api/src/modules/inventory/tests/inventory-execution-request.ola3d.postgres.integration.spec.ts:515`.

R-D11b añadió el parámetro `requestsQueue` al constructor de `InventoryExecutionRequestProcessor`, pero no actualizó el spec integrado de la ola 3d. Ese spec está excluido de las corridas normales de jest (por gating), así que los conteos sin caché lo dieron por bueno. **Consecuencia:** la evidencia «4/4 integrados» de CA-04 es **anterior** a R-D11b y hoy ese spec ni siquiera compila.

### R-TC — `sr-backend`

1. Actualiza la construcción del processor en el spec integrado, con la cola `inventory-execution-requests` real. Revisa también cualquier otro spec integrado o con gating que construya ese processor o el `ExecutionOrderRelayProcessor`.
2. **`pnpm typecheck --force` global en verde**, con su salida en el informe.
3. **Vuelve a ejecutar los cuatro recorridos integrados de CA-04** contra Postgres y Redis reales, con las variables de gating activas. Informa el comando exacto y el conteo **4/4**.

**Regla para el resto del plan:** el gate de cualquier bloque que cambie una firma pública (constructor, puerto o contrato) incluye el **typecheck global**, además de jest. Un spec con gating no cuenta como verificado si no compila.

**Entrega:** `INFORME-MOD11-MOD12-INVENTARIO-R-TC-v1.0.md`.
