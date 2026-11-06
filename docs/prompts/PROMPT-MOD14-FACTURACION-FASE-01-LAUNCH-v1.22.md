# LAUNCH — MOD14 · Facturación Fase 01 · BR-11

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, G6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §BR-11
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.21 (BR-10 y revisiones de G6).
**Gates:** G2 a G5 ✅ · G6 pendiente · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-qa` | §BR-11 | Ahora, en paralelo con la Ola A2 |

**Después:** AI-EM-ARCH corre la suite completa y decide G6.
**Reglas:** `main`, sin commit, cero PII, nunca `tenant_iwana`. No edita el plan ni registra gates.

```text
===== 1 · sr-qa, BR-11 (ahora) =====
Actúa como sr-qa. Lee AGENTS.md, §5 y §7 de docs/hlds/HLD-MOD14-FACTURACION-v1.1.md y §BR-11 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con las skills testing-patterns e iwana-test-evidence. Solo toca billing-agenda.postgres.integration.spec.ts y access-permission-catalog.invariant.spec.ts; un rojo de producción es hallazgo. Usa un postgres:18-alpine propio con DB_NAME=test y elimínalo al terminar. En main, sin commit; no edites el plan ni registres gates.
```
