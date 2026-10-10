# LAUNCH — MOD11 ↔ MOD12 · Reverso de consumo · Ola 3d (V4-R3 + R-LOG2)

**Plan:** `docs/plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md` · **Spec:** reverso v1.2
**Origen:** el NO GO de V4-R2 se debe al entorno: había tres workers vivos y la spec mataba solo uno. Ver la adenda 3 del 2026-10-10 en `PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`.

| # | Subagente | Encargo (adenda 3) | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `sr-qa` | §V4-R3: un solo worker, precondición en RA-11 y corrida completa 17/17 | `e2e-testing-patterns`, `iwana-matriz-motivos`, `iwana-queue-inspect`, `verification-before-completion` |
| 2 | `sr-backend` | §R-LOG2: `SafeTypeOrmLogger` en el runner de migraciones de tenant | `database-migration`, `backend-security-coder`, `testing-patterns` |

**Paralelo:** sí. R-LOG2 no toca procesos ni la spec E2E, pero obliga a recompilar. V4-R3 hace su corrida final con el árbol que incluye R-LOG2, o deja constancia de que no lo incluyó.
**Siguiente:** con V4-R3 en GO, AI-EM-ARCH consolida G6 del reverso y propone el commit. G7 espera a R-LOG2 y a que `sec-eng` ratifique V5-R.

---

### Bloque copiar-pegar — `sr-qa` (V4-R3)

> Actúa como `sr-qa`. Lee tu informe V4 v1.2 y la adenda 3 (§V4-R3) de `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`. **Causa encontrada por AI-EM-ARCH:** había tres procesos `apps/worker/dist/main` vivos (PID 30536, 31064 y 30624), cada uno con 38 conexiones a Redis. Tu spec mata uno y los otros dos consumen la DLQ y borran el diagnóstico antes del poll.
> Detén todos los workers y comprueba con `Get-NetTCPConnection -RemotePort 6380` que solo queda el api. Arranca un único worker y usa su PID como `V4_WORKER_PID`. Añade a RA-11 una precondición que falle si hay más de un worker conectado. Haz una corrida completa nueva: 17/17, sin retries, con RA-14 en continuación. Solo el tenant `i4-qa-a-20261006-9d3098f4`.
> Entrega `INFORME-MOD11-MOD12-REVERSO-V4-SR-QA-v1.3.md`, corrigiendo el inventario de procesos del §6 de la v1.2. Sin commit.

### Bloque copiar-pegar — `sr-backend` (R-LOG2)

> Actúa como `sr-backend`. Lee el informe R-LOG v1.0 y la adenda 3 (§R-LOG2). En `packages/database/src/migrations/tenant/runner.ts`, haz que el DataSource de migraciones de tenant use `SafeTypeOrmLogger`, con un test que pruebe que una migración que falla no vuelca el mensaje crudo. Gates: typecheck global y jest de `packages/database` con `Cached: 0`. Entrega `INFORME-MOD11-MOD12-REVERSO-R-LOG2-v1.0.md`. Sin commit.
