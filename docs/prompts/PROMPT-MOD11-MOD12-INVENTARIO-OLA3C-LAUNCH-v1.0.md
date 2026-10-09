# LAUNCH — MOD11 ↔ MOD12 · Inventario de OT · Ola 3c (R-D11 + I4 v1.1)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1 §5 · **Encargo:** `PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md`, §Ola 3c y §Re-verificación
**Estado:** R-API y R-WORKER en GO condicionado (2026-10-08). Quedan dos residuos de D11.
**Decisión:** retención de respaldo de 24 horas en las colas de origen de inventario; diagnóstico sin identificadores cuando estos son inválidos.
**No se re-ejecuta:** lo que ya pasó en I4 (CA-01 a 03 y CA-05 a 11) ni los controles de S2 que pasaron.
**Entorno:** Docker local (Postgres en 5433, Redis en 6380) y `INTERNAL_QUEUE_SIGNING_KEY` local.

| # | Subagente | Encargo | Skills a leer |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §R-D11: diagnóstico sin identificadores y retención de 24 horas en origen | `bullmq-specialist`, `backend-security-coder`, `testing-patterns` |
| 2 | `sr-qa` | §Re-verificación, parte I4 v1.1: CA-04 completo, copy en la UI e inyección de S2 | `e2e-testing-patterns`, `postgresql`, `verification-before-completion`, `playwright-skill` |

**Paralelo:** sí. R-D11 toca dos processors y sus specs; I4 no modifica código. La comprobación de jobs fallidos de origen con sobre la cierra **S2 v1.2**, después de R-D11.
**Cierre:** los dos en GO. Después, S2 v1.2 y la consolidación de G6.

---

### Bloque copiar-pegar — `sr-backend` (R-D11)

> Actúa como `sr-backend`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §Ola 3c y el plan §5. Lee los `SKILL.md` de `bullmq-specialist`, `backend-security-coder` y `testing-patterns`.
> En las colas de origen de inventario, `removeOnFail: { age: 86400 }`. Con identificadores inválidos, escribe un diagnóstico sin ellos (`errorType`, `attemptsMade`, `failedAt`) y borra el origen. Si falla el encolado del diagnóstico, deja un log del catálogo permitido; el tope de 24 horas cubre el resto.
> Tests de los dos casos. Jest de `inventory` y del worker con `Cached: 0`. Entrega el informe R-D11. Sin commit.

### Bloque copiar-pegar — `sr-qa` (I4 v1.1)

> Actúa como `sr-qa`. Lee la §Re-verificación de `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` y tu informe I4 v1.0. Lee los `SKILL.md` de `e2e-testing-patterns`, `postgresql`, `verification-before-completion` y `playwright-skill`.
> Contra Postgres y Redis reales: CA-04 con los cuatro motivos (recibo `REJECTED`, sin reintentos). El copy visible de cada rechazo y del pendiente prolongado en la consola, sobre una OT de prueba **con snapshot de la plantilla v2**. Y la inyección de S2: un V2 escrito directamente en la cola, sin fila en el outbox, no se firma ni mueve stock.
> No repitas lo que ya pasó. Entrega el informe I4 v1.1. Sin commit.
