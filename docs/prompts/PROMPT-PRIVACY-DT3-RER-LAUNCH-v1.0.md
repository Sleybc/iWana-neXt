# LAUNCH — privacy · DT-3 R-ER (Ola 1)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0 · **Spec:** `docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md` v1.0
**Ola que lanza:** Ola 1 — B1 y B2 en paralelo · **Gates:** G0 CTO {pendiente} · C1 clúster MOD05 commiteado {pendiente}
**Bloqueos abiertos:** no lanzar mientras C1 no esté commiteado (B1 comparte `contracts.service.ts`, guardas y `subscriber-lifecycle.service.ts`).

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md` §B1 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `testing-patterns`, `iwana-test-evidence` | spec v1.0 §4–§6 |
| 2 | `sr-backend` | `docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md` §B2 | `database-migration`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `iwana-test-evidence` | spec v1.0 §4–§6 |

**Paralelo:** 1 y 2 en paralelo; rutas disjuntas (ver §B1 y §B2 «No tocar»).
**Siguiente:** Ola 2 (`sr-qa` §B3) cuando B1 y B2 entreguen conteo real; Ola 3 (§B4) después.
**Reglas:** main sin ramas, sin commit, cero PII, `[BLOQUEO]` si el código contradice la spec.

```text
===== B1 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B1.
Contrato: docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de nestjs-expert, backend-security-coder, postgresql, testing-patterns, iwana-test-evidence.
Solo rutas de §B1. Sin commit. Entrega: inventario de escritores con archivo:línea, diff y conteo real de pruebas.

===== B2 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B2.
Contrato: docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de database-migration, iwana-tenant-migration, postgresql, backend-security-coder, iwana-test-evidence.
Solo rutas de §B2. Sin commit. Entrega: número de migración, diff y conteo PG real (DB_NAME=dbiw, 0 omitidas).
```
