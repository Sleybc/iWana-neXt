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
