# LAUNCH — CRM · Marcas de privacidad en la transacción · B1-R2

**Plan:** `docs/plans/2026-11-06-crm-marcas-en-transaccion-orquestacion.md`
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.1

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §B1-R2 | Ahora |

**Después:** AI-EM-ARCH mide de nuevo y decide G6.
**Reglas:** `main`, sin commit, cero PII, nunca `tenant_iwana`.

```text
===== 1 · sr-backend, B1-R2 =====
Actúa como sr-backend. Lee AGENTS.md y §B1-R2 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md, con las skills testing-patterns e iwana-test-evidence. Solo toca crm-privacy-marks-in-transaction.postgres.integration.spec.ts. Usa un postgres:18-alpine propio con DB_NAME=test. En main, sin commit.
```
