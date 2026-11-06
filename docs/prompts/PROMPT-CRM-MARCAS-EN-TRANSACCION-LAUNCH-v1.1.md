# LAUNCH — CRM · Marcas de privacidad en la transacción · B1-R

**Plan:** `docs/plans/2026-11-06-crm-marcas-en-transaccion-orquestacion.md` · **Spec:** `docs/specs/2026-11-06-crm-marcas-en-transaccion-spec.md`
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.0 (B1 entregado sin catálogo ni media)
**G0:** ✅ 2026-11-06. **Entrada:** el CTO lanzó B1 antes del commit de MOD14; B1-R sigue en el mismo árbol.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §B1-R | Ahora |
| 2 | `boundary-reviewer` | §R1, sobre B1-R | Tras 1, solo lectura |
| 3 | `test-change-reviewer` | §R1, sobre B1-R | Tras 1, solo lectura |

**Después:** AI-EM-ARCH mide de nuevo y decide el gate.
**Reglas:** `main`, sin commit, cero PII, nunca `tenant_iwana`. No editan el plan ni registran gates.

```text
===== 1 · sr-backend, B1-R =====
Actúa como sr-backend. Lee AGENTS.md, la spec docs/specs/2026-11-06-crm-marcas-en-transaccion-spec.md, §4 de docs/specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md y §B1-R de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md, con las skills nestjs-expert, postgresql, test-driven-development, testing-patterns, iwana-test-evidence y verification-before-completion. Empieza por CA-3 y CA-1 ampliadas en rojo. En main, sin commit.

===== 2 · boundary-reviewer =====
Actúa como boundary-reviewer. Revisa B1-R según §R1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md. Solo lectura: hallazgos con archivo:línea.

===== 3 · test-change-reviewer =====
Actúa como test-change-reviewer. Revisa B1-R según §R1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md. Solo lectura: clasifica cada ajuste con archivo:línea.
```
