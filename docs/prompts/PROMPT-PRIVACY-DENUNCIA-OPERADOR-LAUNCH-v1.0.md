# LAUNCH — privacy · Denuncia del operador (Ola 1)

**Plan:** `docs/plans/2026-11-03-privacy-denuncia-operador-orquestacion.md` v1.0 · **Spec:** `docs/specs/2026-11-03-privacy-suplantacion-denuncia-operador-spec.md` v1.0
**Ola que lanza:** Ola 1, B1 ∥ B2 ∥ B3 · **Gates:** G0 del CTO ✅ 2026-11-03 · dictamen 3(b)/(c) {pendiente; no bloquea}
**Bloqueos abiertos:** ninguno. **Plazo:** G6.5 antes del 19-11-2026.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | `PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0.md` §B1 | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns`, `iwana-test-evidence` |
| 2 | `sr-backend` | §B2 | `iwana-tenant-migration`, `database-migration`, `postgresql`, `iwana-test-evidence` |
| 3 | `fe-platform` | §B3 | `frontend-dev-guidelines`, `core-components`, `iwana-identity-ui-review`, `system-vocabulary-review` |

**Paralelo:** 1, 2 y 3, con rutas disjuntas. **Siguiente:** Ola 2 (`sr-qa` §B4) y Ola 3 (§B5).
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, la nota fuera de logs, `[BLOQUEO]` si el código contradice la spec.

```text
===== B1 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0.md §B1. Spec docs/specs/2026-11-03-privacy-suplantacion-denuncia-operador-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de nestjs-expert, backend-security-coder, openapi-spec-generation, testing-patterns, iwana-test-evidence.
Solo rutas de §B1. Sin stash ni commit. Entrega: diff, conteo real y OpenAPI actualizado.

===== B2 · sr-backend =====
Ejecuta §B2: migración con el siguiente número libre (sufijo único de 13 dígitos), CHECK con 4 tipos, down que no borra, backfill idempotente con conteo.
Lee antes: AGENTS.md y SKILL.md de iwana-tenant-migration, database-migration, postgresql, iwana-test-evidence. Sin stash ni commit.

===== B3 · fe-platform =====
Ejecuta §B3: mapa exhaustivo de los 4 tipos de tarea, ayuda de la nota y badge «Comunicación tardía» con tokens existentes.
Lee antes: AGENTS.md y SKILL.md de frontend-dev-guidelines, core-components, iwana-identity-ui-review, system-vocabulary-review. Sin stash ni commit.
```
