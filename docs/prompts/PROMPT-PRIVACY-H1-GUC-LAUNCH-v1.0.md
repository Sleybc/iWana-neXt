# LAUNCH — privacy · H-1, trigger monótono y bitácora (Ola 1)

**Plan:** `docs/plans/2026-11-07-privacy-h1-guc-supresion-orquestacion.md` v1.0 · **Spec:** `docs/specs/2026-11-07-privacy-h1-guc-supresion-spec.md` v1.0
**Ola que lanza:** Ola 1, B1 · **Gates:** G0 del CTO cerrado el 2026-11-07, opciones 1 y 3
**Bloqueos abiertos:** [BLOQUEO] B1 exige P2: la Ola 6 del barrido publicada (plan §1).

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Plan §4 B1 · spec D-H1-1 y D-H1-2 | `iwana-tenant-migration`, `database-migration`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Siguiente:** Ola 2 (`sr-qa` §4 B2 ∥ B3 documentos).
**Cierre de ola:** CA-H1-03, 04, 05 y 07, con conteo real y `Cached: 0`.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana` ni `dbiw`, `[BLOQUEO]` si el código contradice la spec.

```text
===== B1 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h1-guc-supresion-orquestacion.md §4 B1 y la spec docs/specs/2026-11-07-privacy-h1-guc-supresion-spec.md v1.0, D-H1-1 y D-H1-2.
Lee antes los SKILL.md de iwana-tenant-migration, database-migration, postgresql, backend-security-coder, test-driven-development, iwana-test-evidence.
Confirma el número libre en runner.ts. Una migración: rama monótona en titular_prevent_anonymized_mutation(), bitácora append-only escrita solo por una función SECURITY DEFINER con search_path fijo, sin escritura para iwana_app. down restaura la función de la 169 y conserva la tabla.
Catálogo de columnas exportado desde la migración y prueba de paridad en apps/api contra CRM_RULES y las reglas de contrato; siémbrala para verla fallar.
PostgreSQL propio y desechable aprovisionado como CI, con DB_NAME=test; retíralo con docker rm -fv. main sin ramas, sin stash ni commit, cero PII.
Cierras con CA-H1-03, 04, 05 y 07. Entrega: diff y conteo real sin caché, y toda prueba existente roja con su causa.
```
