# LAUNCH — MOD11 ↔ MOD12 · Reverso de consumo · Ola 3c (R-LOG + V4-R2 → V5-R)

**Plan:** `docs/plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md` · **Spec:** reverso **v1.2** (fe de erratas de RA-03, RA-05 y RA-06, en §9b)
**Origen:** R-V5 en GO y V4-R en GO funcional; ver la adenda 2 del 2026-10-10 en `PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`

| # | Subagente | Encargo (adenda 2) | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §R-LOG: logger de TypeORM sin parámetros ni mensaje crudo, y `{ age }` en el relay | `nestjs-expert`, `backend-security-coder`, `bullmq-specialist`, `testing-patterns` |
| 2 | `sr-qa` | §V4-R2: aserciones a la v1.2 y corrida completa nueva, 17/17 | `e2e-testing-patterns`, `iwana-matriz-motivos`, `iwana-queue-inspect`, `verification-before-completion` |
| 3 | `sec-eng` | §V5-R: cierre de P2 y P3, y R-LOG contra D11 | `security-auditor`, `backend-security-coder` |

**Paralelo:** 1 y 2 en paralelo; la corrida final de 2 espera a que 1 esté en GO. El 3 va después de 1.
**Siguiente:** con las tres en GO, AI-EM-ARCH consolida G6 del reverso y propone el commit.

---

### Bloque copiar-pegar — `sr-backend` (R-LOG)

> Actúa como `sr-backend`. Lee `AGENTS.md`, D11 de la spec de consumo, el §3 de `INFORME-MOD11-MOD12-REVERSO-V4-SR-QA-v1.1.md` y la adenda 2 (§R-LOG) de `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`. Lee los `SKILL.md` de la tabla.
> Crea un logger de TypeORM compartido en `packages/database`. En los errores de consulta escribe solo la operación y el SQLSTATE; nunca los parámetros, los literales ni el `message`. Aplícalo en `data-source.ts`, `app.config.ts` y `worker.module.ts`, y prueba que un valor sintético de los parámetros no aparece en la salida. En el relay, `removeOnFail: { age: NON_INVENTORY_SOURCE_JOB_RETENTION_SECONDS }`, con un test de forma.
> Gates: typecheck global, y jest del worker y de `packages/database` con `Cached: 0`. Entrega `INFORME-MOD11-MOD12-REVERSO-R-LOG-v1.0.md`. Sin commit.

### Bloque copiar-pegar — `sr-qa` (V4-R2)

> Actúa como `sr-qa`. Lee tu informe V4 v1.1, la spec del reverso **v1.2** (RA-03, RA-05, RA-06 y §9b) y la adenda 2 (§V4-R2). Ajusta solo esas tres aserciones: RA-03 excluye únicamente `reversed_by_movement_id` y `updated_at`, RA-05 espera `404` y RA-06 espera `400`.
> Con R-LOG en GO, reinicia el api y el worker y haz una corrida completa nueva: 17/17, sin retries, con RA-14 en continuación. En RA-11/RA-13 comprueba que el log del API no contiene parámetros ni el mensaje crudo. Solo el tenant `i4-qa-a-20261006-9d3098f4`.
> Entrega `INFORME-MOD11-MOD12-REVERSO-V4-SR-QA-v1.2.md` con el conteo real. Sin commit.

### Bloque copiar-pegar — `sec-eng` (V5-R, después de R-LOG)

> Actúa como `sec-eng`. Lee tu informe V5 v1.0, los informes R-V5 y R-LOG, y D11 de la spec de consumo. Haz una verificación de solo lectura: el cierre de P2 (`{ age }`) y P3 (`reversalRequestId`), y que el logger nuevo no deja salir parámetros ni mensajes crudos en el api ni en el worker. Entrega `INFORME-MOD11-MOD12-REVERSO-V5-SEC-ENG-v1.1.md`. Sin commit.
