# LAUNCH — MOD14 · Facturación Fase 01 · V1-R2

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, G4) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` §10 · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §V1-R2
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.17 (flujo verificado el 2026-11-05, con aserciones pendientes). Los bloques 2 a 5 de v1.16 siguen vigentes.
**Gates:** G2 ✅ · G3 ✅ · G4 pendiente · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-qa` | §V1-R2 | Entregado y verificado el 2026-11-05, salvo el punto 7 |
| 2 | `sr-qa` | §V1-R3 | Ahora, en paralelo con V2 a V4 |

**Reglas:** la entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. No corrige producción, no edita el plan ni registra gates. `main`, sin commit, cero PII, nunca `tenant_iwana`.

```text
===== 1 · sr-qa, V1-R2 (ahora) =====
Actúa como sr-qa. Lee AGENTS.md y §V1-R2 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Contrato: HLD v1.1 §10 y PRD §7. Solo e2e/tests/portal-billing-flow.spec.ts y e2e/tests/api/mod14-facturacion.spec.ts; un rojo de producción es hallazgo; sin commit; no edites el plan ni registres gates.
Cierras con Playwright contra portal y API reales, 0 omisiones, conteo real y, por cada punto del 1 al 10, la línea donde queda la aserción. Afirma solo lo que una aserción comprueba. Un tenant marcado para borrar no es un tenant eliminado: dilo así.

===== 2 · sr-qa, V1-R3 (ahora) =====
Actúa como sr-qa. Lee §V1-R3 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md. Solo e2e/tests/portal-billing-flow.spec.ts; sin commit; no edites el plan ni registres gates. Cierras con Playwright contra portal y API reales, 0 omisiones, conteo real y las líneas donde se guarda y se compara el estado.
```
