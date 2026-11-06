# LAUNCH — Auth · Límites de peticiones

**Plan:** `docs/plans/2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md` · **Spec:** `docs/specs/2026-11-06-limites-de-peticiones-spec.md`
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**G0:** ✅ 2026-11-06. **Sin bloqueos.**

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §L1 | Ahora |
| 2 | `sec-eng` | §R1 | Tras 1, solo lectura |
| 3 | `test-change-reviewer` | §R1 | Tras 1, solo lectura |

**Después:** AI-EM-ARCH mide de nuevo y decide el gate.
**Reglas:** `main`, sin commit, cero PII, nunca `tenant_iwana`. No editan el plan ni registran gates.

```text
===== 1 · sr-backend, L1 =====
Actúa como sr-backend. Lee AGENTS.md, docs/specs/2026-11-06-limites-de-peticiones-spec.md y §L1 de docs/prompts/PROMPT-AUTH-LIMITES-PETICIONES-v1.0.md, con las skills nestjs-expert, backend-security-coder, test-driven-development, e2e-testing-patterns, iwana-test-evidence y verification-before-completion. Empieza por CA-1 en rojo. En main, sin commit.

===== 2 · sec-eng =====
Actúa como sec-eng. Revisa L1 según §R1 de docs/prompts/PROMPT-AUTH-LIMITES-PETICIONES-v1.0.md. Solo lectura: hallazgos con archivo:línea.

===== 3 · test-change-reviewer =====
Actúa como test-change-reviewer. Revisa L1 según §R1 de docs/prompts/PROMPT-AUTH-LIMITES-PETICIONES-v1.0.md. Solo lectura: clasifica cada ajuste con archivo:línea.
```
