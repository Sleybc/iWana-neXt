# LAUNCH — MOD11 ↔ MOD12 · Reverso de consumo · Ola 3b (R-V5 + V4-R)

**Plan:** `docs/plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md` v1.1 · **Spec:** reverso v1.1 (Aprobado)
**Origen:** V4 y V5 en NO GO; ver la adenda del 2026-10-10 en `PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`
**Redis:** el bloqueo de V4 se refutó, porque ADR-074 se cumple. Antes de V4-R, ejecuta `pnpm dev:redis-readonly-user`.

| # | Subagente | Encargo (adenda del 2026-10-10) | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §R-V5: retención `{ age }` en la DLQ del API y `reversalRequestId` en el diagnóstico | `bullmq-specialist`, `testing-patterns`, `backend-security-coder` |
| 2 | `sr-qa` | §V4-R: RA-01 a RA-14 contra el stack vivo, con la spec `e2e/tests/api/mod11-mod12-reverso.spec.ts` | `e2e-testing-patterns`, `iwana-matriz-motivos`, `iwana-queue-inspect`, `verification-before-completion`, `playwright-skill` |

**Paralelo:** sí, sobre archivos disjuntos. V4-R deja RA-11 y RA-13 para el final, cuando R-V5 esté en GO.
**Siguiente:** con las dos en GO, se consolida G6 del reverso y se hace un commit único de V1 a V3, R-V5 y la spec E2E.

---

### Bloque copiar-pegar — `sr-backend` (R-V5)

> Actúa como `sr-backend`. Lee `AGENTS.md`, el informe `INFORME-MOD11-MOD12-REVERSO-V5-SEC-ENG-v1.0.md` y la adenda del 2026-10-10 (§R-V5) de `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`. Lee los `SKILL.md` de la tabla.
> En `inventory-execution-request.processor.ts`: `removeOnFail: { age: DLQ_RETENTION_SECONDS }` en la DLQ, con un test que lo afirme; añade `reversalRequestId` al diagnóstico, con un test que confirme que el motivo no aparece. Reporta, sin corregirlo, cualquier otro `removeOnFail` o `removeOnComplete` numérico que se use como antigüedad.
> Gates: typecheck global y jest de `inventory` con `Cached: 0`. Entrega `INFORME-MOD11-MOD12-REVERSO-R-V5-v1.0.md`. Sin commit.

### Bloque copiar-pegar — `sr-qa` (V4-R)

> Actúa como `sr-qa`. Lee `AGENTS.md`, tu informe V4 v1.0, la spec del reverso v1.1 (RA-01 a RA-14) y la adenda del 2026-10-10 (§V4-R) del encargo. Lee los `SKILL.md` de la tabla. **El bloqueo de Redis se refutó:** `redis-cli` dentro del contenedor hereda `REDISCLI_AUTH`, y sin esa variable la respuesta es `NOAUTH`. Regenera el ACL con `pnpm dev:redis-readonly-user`.
> Levanta el api, el worker y el portal locales, y usa solo el tenant `i4-qa-a-20261006-9d3098f4`. Escribe `e2e/tests/api/mod11-mod12-reverso.spec.ts`: cada caso entra por HTTP como supervisor, sin firmar jobs a mano, y se verifica con SQL y la API. Cubre los cuatro motivos con sus cuatro tramos, D7 con la respuesta perdida y RA-04/RA-09 sobre una OT terminal. RA-11 y RA-13 van al final, con R-V5 en GO, inspeccionando sin materializar `job.data`.
> Entrega `INFORME-MOD11-MOD12-REVERSO-V4-SR-QA-v1.1.md` con la matriz de RA y el conteo real. Sin commit.
