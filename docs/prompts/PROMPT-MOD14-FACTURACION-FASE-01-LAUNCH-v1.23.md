# LAUNCH — MOD14 · Facturación Fase 01 · BR-12

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, G6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §BR-12
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.22 (BR-11).
**Gates:** G2 a G5 ✅ · G6 revocado el 2026-11-06 · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-qa` | §BR-12 | Ahora |
| 2 | `plat-ops` | `E2E_API_LOG` en el job `execution-orders-e2e` | Ahora, en paralelo |

**Después:** AI-EM-ARCH corre el E2E y decide G6 de MOD14 y de la Ola A2.
**Reglas:** `main`, sin commit, cero PII, nunca `tenant_iwana`. No editan el plan ni registran gates.

```text
===== 1 · sr-qa, BR-12 (ahora) =====
Actúa como sr-qa. Lee AGENTS.md y §BR-12 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con las skills e2e-testing-patterns e iwana-test-evidence. Solo toca e2e/tests/portal-billing-flow.spec.ts y scripts/e2e-provision-operational.mjs; un rojo de producción es hallazgo. Cierra con el aprovisionador completo y sus marcadores E2E_PLAYWRIGHT_*. En main, sin commit; no edites el plan ni registres gates.

===== 2 · plat-ops, E2E_API_LOG (ahora) =====
Actúa como plat-ops. Lee AGENTS.md. En el job execution-orders-e2e de .github/workflows/ci.yml, define E2E_API_LOG con una ruta en /tmp, sin imprimir su contenido, para que la API escriba a un archivo y no a una tubería que nadie lee mientras corre spawnSync. No toques otros jobs. En main, sin commit; no edites el plan ni registres gates.
```
