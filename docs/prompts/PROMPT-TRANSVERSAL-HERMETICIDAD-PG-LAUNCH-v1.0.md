# LAUNCH — Hermeticidad de pruebas PG y runbook G7 de privacidad (Ola 1)

**Plan:** `docs/plans/2026-11-03-hermeticidad-pruebas-y-g7-privacy-orquestacion.md` v1.0
**Encargos:** `PROMPT-TRANSVERSAL-HERMETICIDAD-PG-v1.0.md` (T1 a T5) · `PROMPT-PRIVACY-G7-RUNBOOK-DELTA-v1.0.md` (G)
**Hecho, no re-despachar:** borrado de `tenant_e2e_mod13_f1_41398e` (2026-11-03).
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca escribir en `tenant_iwana`. G **no** ejecuta G7.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-qa` | T1, T2, T3 y T4 | `testing-patterns`, `postgresql`, `iwana-tenant-migration`, `iwana-test-evidence` |
| 2 | `plat-ops` | G (runbook 1.2) | `iwana-tenant-migration`, `database-migration`, `postgresql` |
| 3 | `test-change-reviewer` y `gate-verifier` | T5, tras 1 | según su perfil |
| 4 | `sec-eng` y `docs-governance` | Revisión del runbook, tras 2 | `security-auditor` |

**Paralelo:** 1 y 2 (no comparten archivos); 3 tras 1 y 4 tras 2. Al cerrar, AI-EM-ARCH consolida y se pasa a los dictámenes jurídicos.

```text
===== T1-T4 · sr-qa =====
Ejecuta docs/prompts/PROMPT-TRANSVERSAL-HERMETICIDAD-PG-v1.0.md §T1 a §T4. Spec docs/specs/2026-11-03-transversal-hermeticidad-pruebas-pg-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, postgresql, iwana-tenant-migration, iwana-test-evidence.
Solo pruebas y fixtures; no cambies aserciones (si hace falta: [BLOQUEO]). Nunca escribas en tenant_iwana; usa una base iwana_it_* nueva.
Sin stash ni commit. Entrega: diff, tablas de T3 y T4 y conteo real de unitarias e integración, con omitidas antes y después.

===== G · plat-ops =====
Ejecuta docs/prompts/PROMPT-PRIVACY-G7-RUNBOOK-DELTA-v1.0.md. Solo docs/runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md (versión 1.2 en cabecera, con Edit).
Lee antes: AGENTS.md y SKILL.md de iwana-tenant-migration, database-migration, postgresql. No ejecutes nada en producción. Sin stash ni commit.

===== Tras T1-T4: test-change-reviewer (CA-H-06) y gate-verifier (CA-H-05) =====
===== Tras G: sec-eng (controles, paradas, sin PII) y docs-governance (forma) sobre el diff del runbook =====
```
