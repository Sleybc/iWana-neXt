# LAUNCH — MOD11 ↔ MOD12 · Inventario de OT · Ola 3b (remediación R-API + R-WORKER)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1 §5 · **Spec:** v1.1 (Aprobado) · **Encargo:** `PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §Ola 3b
**Estado:** I4 en NO GO (CA-04) y S2 en NO GO (3 bloqueos en I1). Hallazgos verificados por el orquestador.
**Decisión ya tomada:** D11 incluye los jobs fallidos de las colas de origen de inventario; se eliminan una vez escrito su diagnóstico.
**No se re-ejecuta:** lo que pasó en I4 (CA-01 a 03, CA-05 a 11) ni los controles que S2 dio por buenos.

| # | Subagente | Encargo | Skills a leer antes de codificar |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §R-API: `SUBSCRIBER_REQUIRED` como recibo `REJECTED`; borrado de fallidos en `inventory-execution-requests` | `nestjs-expert`, `bullmq-specialist`, `testing-patterns` |
| 2 | `sr-backend` | §R-WORKER: firmar solo lo que está en el outbox; `onFailed` con UUID validados; relay sin mensajes crudos | `bullmq-specialist`, `backend-security-coder`, `postgresql`, `testing-patterns` |

**Paralelo:** sí, en dos sesiones. R-API toca `apps/api/src/modules/inventory/**` y R-WORKER toca `apps/worker/src/**`.
**Después:** I4 v1.1 (`sr-qa`) y S2 v1.2 (`sec-eng`), según el §Re-verificación del encargo, con su propio launcher.

---

### Bloque copiar-pegar — `sr-backend` (R-API)

> Actúa como `sr-backend`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §R-API y el plan §5. Lee los `SKILL.md` de `nestjs-expert`, `bullmq-specialist` y `testing-patterns`.
> `SUBSCRIBER_REQUIRED` acaba en `UnrecoverableError` porque `subscriberId: null` no pasa `optionalTrimmedString`. Clasifícalo **antes** del esquema del ledger como recibo `REJECTED/SUBSCRIBER_REQUIRED`, igual que `CUSTODY_INSUFFICIENT`. Normaliza `null` a `undefined` cuando sí hay suscriptor. Ningún motivo del §4 puede terminar en `UnrecoverableError`.
> En `inventory-execution-requests`, elimina el job fallido después de escribir su diagnóstico permitido. Un test por cada motivo del §4. Jest de `inventory` con `Cached: 0`. Entrega el informe R-API. Sin commit.

### Bloque copiar-pegar — `sr-backend` (R-WORKER)

> Actúa como `sr-backend`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §R-WORKER y `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-S2-SEC-ENG-v1.0.md`. Lee los `SKILL.md` de `bullmq-specialist`, `backend-security-coder`, `postgresql` y `testing-patterns`.
> (1) Antes de firmar un V2, cotéjalo en la misma transacción con `execution_order_outbox_events`: id, tenant, tipo, agregado y payload canónico. Si no coincide, no lo firmes. (2) En `onFailed`, valida cada id como UUID antes de escribirlo y omite los que no pasen. (3) En el relay, sustituye los mensajes crudos de excepción por tipos del catálogo permitido. (4) Elimina los fallidos de inventario de la cola de origen después de escribir su diagnóstico.
> Tests: un V2 inyectado o alterado no se firma; ids malformados no se escriben. Worker con `Cached: 0`. Entrega el informe R-WORKER. Sin commit.
