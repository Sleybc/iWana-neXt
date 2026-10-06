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
