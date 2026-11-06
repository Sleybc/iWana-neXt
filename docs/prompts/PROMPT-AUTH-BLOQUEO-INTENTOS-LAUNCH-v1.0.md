# LAUNCH — Auth · Bloqueo por intentos fallidos

**Plan:** `docs/plans/2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md` · **Spec:** `docs/specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md`
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**G0:** ✅ 2026-11-06. **Sin bloqueos.** No depende del commit de MOD14.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §A1 | Ahora |
| 2 | `sec-eng` | §R1 | Tras 1, solo lectura |
| 3 | `test-change-reviewer` | §R1 | Tras 1, solo lectura |
| 4 | `gate-verifier` | §R1 | Tras 2 y 3 |

**Después:** AI-EM-ARCH mide de nuevo y decide el gate.
**Reglas:** `main`, sin commit, cero PII, nunca `tenant_iwana`. No editan el plan ni registran gates.

```text
===== 1 · sr-backend, A1 =====
Actúa como sr-backend. Lee AGENTS.md, §3 y §9 de docs/specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md y §A1 de docs/prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-v1.0.md, con las skills nestjs-expert, auth-implementation-patterns, backend-security-coder, test-driven-development, iwana-test-evidence y verification-before-completion. Empieza por CA-1 en rojo. En main, sin commit.

===== 2 · sec-eng =====
Actúa como sec-eng. Revisa A1 según §R1 de docs/prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-v1.0.md. Solo lectura: hallazgos con archivo:línea.

===== 3 · test-change-reviewer =====
Actúa como test-change-reviewer. Revisa A1 según §R1 de docs/prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-v1.0.md. Solo lectura: clasifica cada ajuste con archivo:línea.

===== 4 · gate-verifier =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge sobre @iwana/api según §R1 de docs/prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-v1.0.md, sin caché y con DB_NAME=test. Entrega conteos reales.
```
