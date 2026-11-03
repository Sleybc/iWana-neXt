# LAUNCH — Hermeticidad de pruebas PG (Ola 1-R)

**Plan:** `docs/plans/2026-11-03-hermeticidad-pruebas-y-g7-privacy-orquestacion.md` v1.0 · **Spec:** v1.1
**Reemplaza a:** LAUNCH v1.0.
**Cerrado, no re-despachar:** T1, T3, el inventario D-H-5 y **G** (runbook 1.2 con `sec-eng` sin hallazgos P0 a P3 y `docs-governance` limpio).
**Abierto:** T2 (una expectativa de la 141); el alcance de la guarda D-H-4; el 42501 de `network-execution-event.wiring` en la base local.
**Reglas:** solo pruebas, nunca `tenant_iwana`, sin stash ni commit.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-qa` | `PROMPT-TRANSVERSAL-HERMETICIDAD-PG-v1.0.md` §T-R | `testing-patterns`, `postgresql`, `iwana-test-evidence`, `systematic-debugging` |
| 2 | `test-change-reviewer` | T-R.1 y T-R.2 | según su perfil |
| 3 | `gate-verifier` | CA-H-05 repetido, en la base aprovisionada como CI | `iwana-test-evidence` |

**Secuencia:** 1 → 2 → 3. Con 3 en verde, AI-EM-ARCH consolida y el usuario ordena commit y push.

```text
===== T-R · sr-qa =====
Ejecuta docs/prompts/PROMPT-TRANSVERSAL-HERMETICIDAD-PG-v1.0.md §T-R. Spec docs/specs/2026-11-03-transversal-hermeticidad-pruebas-pg-spec.md v1.1.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, postgresql, iwana-test-evidence, systematic-debugging.
1) Añade EXECUTION_ORDER_REVERSAL (migración 141) a EXPECTED_ENUMS en el orden de pg_enum; ninguna otra expectativa.
2) Limita la guarda D-H-4 a las pruebas con conexión real; no toques subscriber-pipeline-listeners.spec.ts.
3) Reproduce el aprovisionamiento del job de integración de ci.yml (roles y grants) en una iwana_it_* nueva y corre network-execution-event.wiring: entorno o [BLOQUEO].
Sin stash ni commit. Entrega: diff, conteo real y la diferencia de grants, si la hay.

===== Tras T-R: test-change-reviewer (T-R.1 y T-R.2), luego gate-verifier (CA-H-05 en la base aprovisionada como CI) =====
```
