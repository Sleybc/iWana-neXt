# PROMPT DE EJECUCIÓN — MOD11 ↔ MOD12 · Implementación del reverso de consumo

**Versión:** 1.0 · **Fecha:** 2026-10-10 · **Generado por:** AI-EM-ARCH
**Spec que ejecuta:** `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` **v1.1, aprobada por el CTO el 2026-10-10**. Es de lectura completa obligatoria. R1 a R10 y P1 a P4 **no se re-litigan**.
**Plan:** `docs/plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md` v1.1, con la matriz de skills en su §3b.
**Spec hermana:** consumo v1.1. Su infraestructura se **reutiliza y se extiende de forma explícita** (R5).
**Contrato congelado:** el §3 de la spec, que se materializa como `execution-orders.ts` **v1.7**. Lo materializa V1 en su paso 1 y nadie más lo cambia.

**Reglas comunes:**

- sin commit;
- conteo real con `Cached: 0`;
- **typecheck global** en todo bloque que cambie firmas públicas (lección de R-TC);
- **un test integrado por motivo de rechazo** (norma del CTO del 2026-10-08; usar la skill `iwana-matriz-motivos`);
- **ningún test de un `apps/*` importa código de otro `apps/*`** (lección de C1);
- el motivo del reverso **nunca** sale de MOD11 (R9).

---

## V1 — `sr-backend`: lado MOD11 (ola 1)

**Archivos propios:**

- `packages/shared` (contrato v1.7 y Zod);
- `apps/api/src/modules/tasks/**`;
- `packages/database` (migración **140**);
- `apps/worker/src/**` (listas de tipos, transición de la respuesta, relay y R10).

**Pasos:**

1. **Primero el contrato v1.7** con su Zod (spec §3): el comando, los tres eventos, la extensión de `ExecutionOrderItemUsage` y `REVERSE_ITEM_USAGE`. Sube el docstring a v1.7. **Este paso habilita la ola 2: avísalo en cuanto esté en verde.**
2. **Migración 140** (spec §4): índice único **parcial** sobre `item_usage_id` para `PENDING` y `CONFIRMED`, y un índice único sobre `(tenant_id, reversal_request_id)`. El `down` se bloquea si hay filas.
3. **Comando** `POST /tasks/execution-orders/:id/item-usage/:usageId/reversal` (R1, R9):
   - rol de supervisión, `SUPERVISE` y `assertSupervisionScope`;
   - motivo validado con `safeTextField`;
   - solo líneas `CONFIRMED` sin reverso activo; `409` si ya hay uno;
   - `originalStockMovementId` **derivado de la línea persistida**;
   - idempotencia con `If-Match` y el intent del comando;
   - **asiento de auditoría durable** con el patrón de `finishCommand`, **sin** transición de estado de la OT;
   - emisión al outbox **sin el motivo**.
4. **`allowedActions`:** `REVERSE_ITEM_USAGE` solo para supervisión, sobre líneas `CONFIRMED` sin reverso activo (RA-05 y RA-10).
5. **R8:** el evaluador excluye las líneas con reverso `CONFIRMED` **en `getCompletion` y en el comando de cierre**. Carga el estado del reverso en ambos caminos.
6. **R5 en el worker:** los tipos nuevos entran en `INVENTORY_EVENT_TYPES`, en los exentos de la guarda `aggregateVersion`, en el cotejo con el outbox antes de firmar, en la **clasificación de inventario del relay** (24 horas) y en la DLQ diagnóstica. La transición de la respuesta en MOD11 es condicional (`PENDING → CONFIRMED|REJECTED`), con anomalía ante resultados contradictorios. Aplicar un reverso `CONFIRMED` sobre una OT terminal no toca el resultado ni el cierre (R4).
7. **R10:** el scanner D7 reemite los reversos `PENDING` con `SKIP LOCKED`, `SAVEPOINT` por fila, tope de intentos y un `eventId` nuevo.

**Gates:**

- typecheck global;
- jest de `tasks` y del worker con `Cached: 0`;
- la 140 con `down` ejercitado contra Postgres real;
- test de que el payload del outbox **no contiene el motivo**.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-V1-v1.0.md`.

## U2 — `prod-ux`: ratificación de copy (ola 1, en paralelo con V1)

Ratifica o corrige los dos ajustes que propone la spec §9 sobre tu tabla U1:

- (a) sustituir «Esta línea no admite otra solicitud de reverso» por un texto coherente con el índice parcial de R3;
- (b) el copy de `REVERSAL_LOAN_MISMATCH`.

Español, sentence case y sin enums crudos. **Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-U2-PROD-UX-v1.0.md`, con la tabla final y completa que consumirá V3.

## V2 — `sr-backend`: lado MOD12 (ola 2, después del paso 1 de V1)

**Archivos propios:** `apps/api/src/modules/inventory/**` y `packages/database` (migración **141**).

**Pasos:**

1. **Migración 141** (spec §4): columna `kind` en `inventory_execution_request_receipts`, con los existentes como `CONSUMPTION` y la clave `(tenant_id, kind, request_id)`. Valor `EXECUTION_ORDER_REVERSAL` en el enum de PostgreSQL. El `down` revierte `kind` y se bloquea si hay recibos `REVERSAL` o movimientos con ese origen; el valor del enum queda documentado como no reversible.
2. **Operación de reverso del ledger** (R6):
   - carga el original y deriva las ubicaciones de sus líneas y el activo de su evento de ciclo de vida;
   - coteja `technicianCustodyId` con el `responsibleRefId` de la línea negativa;
   - movimiento contrario con `isReversal = true` y origen `EXECUTION_ORDER_REVERSAL`;
   - `original.reversedByMovementId` en la misma transacción;
   - **cierre del comodato ligado al `stockMovementId` original**, con bloqueo, en la misma transacción;
   - el serial vuelve a `ASSIGNED_TO_TECHNICIAN`.
3. **Los cuatro motivos de R7**, con validaciones explícitas y sin leer el texto de los errores, como `InventoryBusinessRejection`.
4. **Consumidor:** el despacho por tipo, firma, Zod, tenant, recibo (kind `REVERSAL`), ledger, respuesta con `eventId` determinista y DLQ conforme a D11.

**Gates:**

- typecheck global;
- jest de `inventory` con `Cached: 0`;
- la 141 con `down` ejercitado;
- carrera real de dos reversos simultáneos;
- **4/4 tests integrados por motivo** contra Postgres y Redis reales.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-V2-v1.0.md`.

## V3 — `fe-platform`: consola (ola 2, después del paso 1 de V1 y de U2)

**Archivos propios:** `ExecutionOrderMaterialAction.tsx` y sus specs (propiedad R3 según el informe B0 §5). Si el diálogo necesita un archivo nuevo, va en `operations/` con su spec.

- La acción de reverso solo cuando `allowedActions` incluye `REVERSE_ITEM_USAGE`.
- El diálogo con el motivo obligatorio y la ayuda «sin datos personales».
- Los estados del reverso en la línea, los **cuatro** motivos de rechazo y la marca «Corrección posterior al cierre».
- El requisito que vuelve a pendiente.
- Todo con el **copy final de U2**.
- Accesibilidad: foco gestionado en el diálogo y estados anunciados.

**Gates:**

- typecheck del portal;
- jest de `operations/` (≥ 767) con `Cached: 0`;
- `audit-ui.mjs` limpio.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-V3-v1.0.md`.

## V4 — `sr-qa`: verificación integrada (ola 3)

RA-01 a RA-14 contra api, worker, Postgres y Redis reales en local (Redis con credencial, ADR-074 (Aprobado)). Hay que incluir:

- la carrera de RA-07;
- los cuatro motivos de RA-08, con la skill `iwana-matriz-motivos`;
- RA-04 sobre una OT terminal;
- RA-12, un reintento tras un rechazo;
- RA-13: el motivo ausente del outbox, del job, de los logs y de la DLQ, **inspeccionado sin materializar `job.data`**, por ejemplo con la skill `iwana-queue-inspect`;
- RA-14 con D7;
- los copies en la consola.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-V4-SR-QA-v1.0.md`.

## V5 — `sec-eng`: revisión de seguridad (ola 3, en paralelo con V4)

Auditoría de solo lectura de V1 y V2:

- **cada punto de extensión de R5**;
- R9: el motivo nunca sale de MOD11, la auditoría es durable y el original se deriva;
- la autorización de supervisión y su alcance;
- la ausencia de imports cruzados entre `apps/`.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-V5-SEC-ENG-v1.0.md`. Un hallazgo es `[BLOQUEO]` hacia el dueño del bloque.

---

## Adenda 2026-10-10 — remediación de la ola 3 (V4 y V5 en NO GO)

Auditoría de AI-EM-ARCH sobre los informes V4 y V5:

- **El bloqueo de Redis de V4 es un falso positivo.** El contenedor `iwana_redis_dev` define `REDISCLI_AUTH` (`docker-compose.yml:126`), así que `redis-cli` dentro de él se autentica solo. Una conexión nueva sin esa variable responde `NOAUTH Authentication required.` (comprobado por el orquestador). ADR-074 se cumple. El `WRONGPASS` de `iwana_readonly` ocurre porque el ACL no persiste cuando el contenedor se reinicia; se regenera con `pnpm dev:redis-readonly-user`.
- **El P2 de V5 se confirma y viene heredado del consumo.** `removeOnFail: DLQ_RETENTION_SECONDS` ya estaba en `HEAD` y en `72d367a3`; BullMQ 5.71 lo interpreta como un número de jobs, no como una antigüedad. Ni R-D11 ni la verificación en frío de G6 del consumo lo detectaron.
- **Los huecos de V4 son reales.** Ningún criterio RA se recorrió con el api y el worker vivos: el integrado de V2 firma el job con un helper y se salta MOD11, el relay y la proyección. La norma del 2026-10-08 exige los cuatro tramos. El encargo V2 no lo pedía así; es un error de redacción de AI-EM-ARCH.

### R-V5 — `sr-backend`

**Archivos propios:** `apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts` y su spec.

1. `removeOnFail: { age: DLQ_RETENTION_SECONDS }` en la DLQ del consumidor del API, con un test que afirme la forma `{ age }` y no un número.
2. Añade `reversalRequestId` como identificador permitido del diagnóstico (el P3 de V5), con un test que pruebe que la DLQ de un reverso lo lleva y que no lleva el motivo.
3. Busca en todo el repo cualquier otro `removeOnFail` o `removeOnComplete` con valor numérico usado como antigüedad, y repórtalo; no lo corrijas fuera de tus archivos.

**Gates:** typecheck global y jest de `inventory` con `Cached: 0`. **Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-R-V5-v1.0.md`.

### V4-R — `sr-qa`

Recorrido completo contra el **stack vivo**: api, worker y portal locales, Postgres y Redis con credencial, y solo el tenant sintético `i4-qa-a-20261006-9d3098f4`, como en I4. Cada caso entra por **HTTP como supervisor** y se comprueba con SQL y con la API, nunca firmando jobs a mano.

- Escribe la spec reproducible `e2e/tests/api/mod11-mod12-reverso.spec.ts`, junto a `execution-orders-operational.spec.ts`. Si el entorno no está arriba, debe fallar, no saltarse.
- **RA-01, RA-02 y RA-03:** serial con comodato y consumo por cantidad. Compara saldos, el estado del serial, el comodato, `reversedByMovementId` y el original antes y después.
- **RA-04 y RA-09:** sobre una OT abierta y una terminal. El requisito vuelve a pendiente en `getCompletion` y en el cierre; en la terminal, el resultado y el cierre no cambian.
- **RA-05, RA-06, RA-07, RA-10 y RA-12:** `403` (técnico y supervisor de otra sede), `422`, `409`, replay con la misma `Idempotency-Key` y un reintento tras un rechazo, todos por HTTP real.
- **RA-08:** los cuatro motivos, cada uno provocado desde el comando de MOD11, hasta el recibo y la proyección `REJECTED` con `rejectionReasonCode`. Entrega la matriz de `iwana-matriz-motivos`, con los cuatro tramos.
- **RA-14:** para la respuesta perdida, detén el worker después de que MOD12 decida y borra solo esa respuesta con el usuario `iwana_readonly` regenerado. Si no tiene permiso, que decida el usuario. Después arranca el worker y espera a D7: un solo movimiento contrario.
- **RA-11 y RA-13:** con R-V5 en GO, provoca un fallo real de un reverso. Inspecciona el outbox con SQL, y el job y la DLQ con `iwana-queue-inspect`, sin materializar `job.data`. Revisa también los logs de esa corrida.
- **RA-04 y RA-08 en la consola:** con Playwright, la marca de corrección posterior al cierre y el copy de un rechazo, sobre los datos de esta corrida.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-V4-SR-QA-v1.1.md`, con la matriz de RA-01 a RA-14 y el conteo de la spec. Sin commit.

---

## Adenda 2 — 2026-10-10: cierre de la ola 3b

Dictamen de AI-EM-ARCH:

- **R-V5: GO.** Prueba de forma `{ age }`, `reversalRequestId` en el diagnóstico e inventario con 805 tests en verde.
- **V4-R: GO funcional.** Los cuatro motivos y RA-14 recorrieron el stack vivo. RA-03, RA-05 y RA-06 fallaron contra criterios que la **spec v1.2** corrige con una fe de erratas (§9b): `updated_at` es metadata, el `404` es la convención de alcance y el `400` la de validación. El código no cambia.
- **Dos defectos heredados, condiciones de G7, no del G6 del reverso:**
  - (a) `removeOnFail` numérico en el relay para los eventos que no son de inventario;
  - (b) el logger de TypeORM (`['error']`) escribe la consulta fallida, sus parámetros y el mensaje crudo de PostgreSQL en todos los procesos. Contradice D11 y puede llevar PII a los logs de cualquier módulo.

### R-LOG — `sr-backend`

**Archivos propios:**

- `packages/database` (logger nuevo y `data-source.ts`);
- `apps/api/src/app.config.ts`;
- `apps/worker/src/worker.module.ts`;
- `apps/worker/src/services/execution-order-relay.service.ts` y su spec.

1. Un logger de TypeORM propio y compartido. En los errores de consulta registra solo:
   - el tipo de operación;
   - el `code` SQLSTATE del driver;
   - la tabla, si se obtiene sin el mensaje.

   **Nunca** los parámetros, el texto de la consulta con literales ni el `message` crudo. Las migraciones se siguen registrando. Se aplica en los tres sitios de configuración.
2. Test que provoque un `QueryFailedError` con un valor sintético único en los parámetros y compruebe que la salida no lo contiene.
3. `removeOnFail: { age: NON_INVENTORY_SOURCE_JOB_RETENTION_SECONDS }` en el relay, con un test de forma.

**Gates:** typecheck global, y jest del worker y de `packages/database` con `Cached: 0`. **Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-R-LOG-v1.0.md`.

### V4-R2 — `sr-qa`

Ajusta en tu spec solo las aserciones de RA-03, RA-05 y RA-06 a la spec v1.2. RA-03 conserva la comparación estricta de la fila y excluye solo `reversed_by_movement_id` y `updated_at`.

Con R-LOG en GO, haz una **corrida completa nueva** de la spec: 17 de 17, sin retries, con RA-14 en modo continuación. Repite el caso RA-11/RA-13 y comprueba que el log del API ya no contiene parámetros ni el mensaje crudo.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-V4-SR-QA-v1.2.md`.

### V5-R — `sec-eng` (después de R-LOG)

Verificación de solo lectura del cierre de P2 y P3 (R-V5) y de R-LOG contra D11. **Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-V5-SEC-ENG-v1.1.md`.

---

## Adenda 3 — 2026-10-10: cierre de la ola 3c

Dictamen de AI-EM-ARCH:

- **R-LOG: GO.** El orquestador verificó en frío `packages/database/src/safe-typeorm.logger.ts`: solo etiquetas fijas de operación y SQLSTATE, sin parámetros ni mensaje. El relay usa `{ age }` en sus dos ramas.
- **V5-R: GO, con una salvedad de procedencia.** Lo ejecutó un agente general en modo de solo lectura, porque el subagente `sec-eng` falló por infraestructura. La verificación del orquestador lo respalda. La ratificación formal de `sec-eng` pasa a ser condición de G7, no del G6 del reverso.
- **V4-R2: el NO GO no es un defecto del producto; es del entorno.** Con el stack de la corrida vivo, el orquestador encontró **tres procesos del worker** conectados a la vez a Redis (38 conexiones cada uno) y a Postgres: los PID 30536 y 31064, arrancados a las 8:04 y huérfanos, y el 30624. La spec mata solo `V4_WORKER_PID`; los otros dos siguen consumiendo `operations-execution-dlq` con `removeOnComplete: true` y borran el diagnóstico antes del poll. Eso explica la «paradoja» del §6: el inbox `mod11-dlq-terminal` solo lo escribe el `ExecutionOrderDlqProcessor` del worker, así que hubo un consumidor vivo. El inventario de procesos del informe era incorrecto.
- **Observación de R-LOG aceptada:** `packages/database/src/migrations/tenant/runner.ts:557` sigue con `logging: ['error']` y sin el logger seguro. Ese runner también corre en tiempo de ejecución, al aprovisionar un tenant.

### V4-R3 — `sr-qa`

1. Detén **todos** los procesos del worker y comprueba con `Get-NetTCPConnection -RemotePort 6380` que solo el api conserva conexiones.
2. Arranca **un único** worker y usa su PID como `V4_WORKER_PID`.
3. Añade a la spec una precondición de RA-11: si hay más de un proceso del worker con conexiones a Redis, la prueba **falla** con un mensaje explícito, no espera 220 segundos.
4. Haz una corrida completa nueva: **17/17**, sin retries y con RA-14 en continuación.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-V4-SR-QA-v1.3.md`, que corrige el inventario de procesos del §6 de la v1.2.

### R-LOG2 — `sr-backend`

`runner.ts`: el DataSource de migraciones de tenant usa `SafeTypeOrmLogger`, con un test que pruebe que una migración que falla no vuelca el mensaje crudo.

**Gates:** typecheck global y jest de `packages/database` con `Cached: 0`. **Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-R-LOG2-v1.0.md`.
