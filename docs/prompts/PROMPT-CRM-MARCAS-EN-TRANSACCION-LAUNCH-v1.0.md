# LAUNCH — CRM · Marcas de privacidad en la transacción

**Plan:** `docs/plans/2026-11-06-crm-marcas-en-transaccion-orquestacion.md` · **Spec:** `docs/specs/2026-11-06-crm-marcas-en-transaccion-spec.md`
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**G0:** ✅ 2026-11-06. **Bloqueo abierto:** commit de MOD14 Fase 01. **No lanzar antes.**

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §B1 | Tras el commit de MOD14 |
| 2 | `boundary-reviewer` | §R1 | Tras 1, solo lectura |
| 3 | `test-change-reviewer` | §R1 | Tras 1, solo lectura |
| 4 | `gate-verifier` | §R1 | Tras 2 y 3 |

**Después:** AI-EM-ARCH mide de nuevo y decide el gate.
**Reglas:** `main`, sin commit, cero PII, nunca `tenant_iwana`. No editan el plan ni registran gates.

```text
===== 1 · sr-backend, B1 =====
Actúa como sr-backend. Lee AGENTS.md, docs/specs/2026-11-06-crm-marcas-en-transaccion-spec.md y §B1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md, con las skills nestjs-expert, postgresql, test-driven-development, testing-patterns, iwana-test-evidence y verification-before-completion. Empieza por la prueba de CA-1 en rojo. En main, sin commit.

===== 2 · boundary-reviewer =====
Actúa como boundary-reviewer. Revisa B1 según §R1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md. Solo lectura: hallazgos con archivo:línea.

===== 3 · test-change-reviewer =====
Actúa como test-change-reviewer. Revisa B1 según §R1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md. Solo lectura: clasifica cada ajuste con archivo:línea.

===== 4 · gate-verifier =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge sobre @iwana/api según §R1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md, sin caché y con DB_NAME=test. Entrega conteos reales.
```
