# LAUNCH — privacy · O-1 reloj de retención (Ola 1)

**Plan:** `docs/plans/2026-11-02-privacy-o1-retencion-orquestacion.md` v1.0 · **Spec:** `docs/specs/2026-11-02-privacy-o1-reloj-retencion-spec.md` v1.0
**Ola que lanza:** Ola 1, B1 y B2 en paralelo · **Gates:** G0 del CTO ✅ 2026-11-02 · `main` limpio en las rutas {lo comprueba cada agente} · Postgres de desarrollo {lo comprueba cada agente}
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `PROMPT-PRIVACY-O1-RETENCION-v1.0.md` §B1 | `nestjs-expert`, `postgresql`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` | spec v1.0 §3 y §4 |
| 2 | `sr-backend` | §B2 | `database-migration`, `iwana-tenant-migration`, `postgresql`, `iwana-test-evidence` | spec v1.0 §3 y §4 |

**Paralelo:** 1 y 2, con rutas disjuntas. **Siguiente:** Ola 2 (`sr-qa` §B3 ∥ `plat-ops` §B4) cuando 1 y 2 entreguen su conteo real; Ola 3 (§B5) después.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII. Integraciones PG con `IWANA_DB_INTEGRATION_AVAILABLE=true`; una omitida cuenta como fallo.

```text
===== B1 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B1. Spec docs/specs/2026-11-02-privacy-o1-reloj-retencion-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de nestjs-expert, postgresql, backend-security-coder, testing-patterns, iwana-test-evidence.
Solo rutas de §B1. Sin stash ni commit. Entrega: inventario de escritores, diff, conteo real y cobertura por servicio.

===== B2 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B2. Spec v1.0.
Lee antes: AGENTS.md y SKILL.md de database-migration, iwana-tenant-migration, postgresql, iwana-test-evidence.
Solo packages/database/.../tenant/**. Sin stash ni commit. Entrega: número de migración, diff y conteo PG.
```
