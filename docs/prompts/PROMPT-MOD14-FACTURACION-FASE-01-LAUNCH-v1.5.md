# LAUNCH — MOD14 · Facturación Fase 01 · D1-R13 y Ola 3

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.4 (G2 ✅ 2026-11-04).
**Ola que lanza:** D1-R13, luego B2 ∥ B3 ∥ B4p ∥ F1 · **Bloqueos abiertos:** B3 de H-2 cierra antes del paso 2: su `gate-verifier` necesita la suite en verde.

| # | Subagente | Encargo | Skills a leer antes | Cuándo |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | §D1-R13 | `postgresql`, `iwana-test-evidence` | Ahora |
| 2 | `sr-backend` | §B2 | `nestjs-expert`, `bullmq-specialist`, `postgresql`, `openapi-spec-generation`, `test-driven-development` | Tras 1 y B3 de H-2 |
| 3 | `sr-backend` | §B3 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `openapi-spec-generation`, `test-driven-development` | Con 2 |
| 4 | `sr-backend` | §B4p | `nestjs-expert`, `backend-security-coder`, `postgresql`, `iwana-test-evidence` | Con 2 |
| 5 | `fe-platform` | §F1 | Las de su fila en el plan | Con 2 |

**Paralelo:** 2 ∥ 3 ∥ 4 ∥ 5, rutas disjuntas según el plan. **Cierre de ola (G3):** CA-FAC-03 a 10, 12 y 13, con concurrencia real y conteo.
**Reglas:** toda integración nueva corre con `DB_NAME=test`, sin guarda que falle al cargar. `main`, sin commit, cero PII, nunca `tenant_iwana`.

```text
===== 1 · data-eng (ahora) =====
Actúa como data-eng. Lee AGENTS.md, tu encargo §D1-R13 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, postgresql e iwana-test-evidence.
billing-migration.integration-helpers.ts no puede fallar al cargarse con DB_NAME=test: acepta test e iwana_it_*; con otro nombre, describe.skip con aviso visible. Sin commit. Cierras con la integración completa de @iwana/db con DB_NAME=test, iwana_migrator y base migrada como en CI, sin caché y con conteo real.

===== 2 · sr-backend, B2 (tras 1 y B3 de H-2) =====
Actúa como sr-backend. Lee AGENTS.md, el plan y tu encargo §B2 del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1 §6.1, §6.2, §6.5, §6.6 y RS-9 a RS-12; si falta un dato, [BLOQUEO]. Solo tus rutas; sin commit. Cierras con conteo real sin caché, integración con DB_NAME=test.

===== 3 · sr-backend, B3 (con 2) =====
Actúa como sr-backend. Lee AGENTS.md, el plan y tu encargo §B3 del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1; si falta un dato, [BLOQUEO]. Solo tus rutas; sin commit. Cierras con conteo real sin caché, integración con DB_NAME=test.

===== 4 · sr-backend, B4p (con 2) =====
Actúa como sr-backend. Lee AGENTS.md, el plan y tu encargo §B4p del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1 §8.1. Clasifica buyer_document_encrypted en erasure-coverage.invariant.spec.ts y prueba la 175 con el trigger 169 real. Solo tus rutas; sin commit. Cierras con conteo real, integración con DB_NAME=test.

===== 5 · fe-platform, F1 (con 2) =====
Actúa como fe-platform. Lee AGENTS.md, el plan, la spec UX y tu encargo §F1 del prompt v1.1, con sus skills de la matriz. Solo tus rutas; sin commit. Cierras con conteo real sin caché, typecheck y lint.
```
