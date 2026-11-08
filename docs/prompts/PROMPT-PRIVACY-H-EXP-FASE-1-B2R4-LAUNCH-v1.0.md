# LAUNCH — privacy · H-EXP Fase 1 · B2-R4 (reloj ausente en el caso mixto)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.6 · **Spec:** `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` v1.1 D-EXP-1
**Ola que lanza:** B2-R4 · **Gates:** G2 de B2-R3 ⛔ por P1 residual
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Cerrar P1 en el caso mixto y hacer obligatorios los métodos de reloj | `nestjs-expert`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Siguiente:** B4 parcial (`sec-eng`, `boundary-reviewer`, `gate-verifier`). **Cierre (G2):** rojo y luego verde; integración completa como en CI.
**Reglas:** `main` sin ramas, **sin stash** ni commit, cero PII, nunca `tenant_iwana`.

```text
===== H-EXP B2-R4 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.5 y §1.6 y la spec H-EXP v1.1 D-EXP-1. Lee antes los SKILL.md de nestjs-expert, postgresql, backend-security-coder, test-driven-development, iwana-test-evidence.
P1 sigue abierto en el caso mixto. crm-contract-standing-read.adapter.ts:76 marca unreconciledContractClock solo si terminalWithClock === 0, y billing-standing-read.adapter.ts:51 solo si withDate === 0. Con un contrato terminado en 2018 con fecha y otro terminado sin fecha, el reloj toma 2018 y el titular vence antes de tiempo. Lo mismo con un documento fiscal antiguo con fecha y otro sin ella.
Primero en rojo, contra PostgreSQL real:
1. Caso mixto de contratos: un terminado con terminated_at antiguo y otro sin él → CONTRACT_UNRECONCILED, sin anonimizar. La condición pasa a terminalWithClock < terminalCount.
2. Caso mixto fiscal: un EMITIDO con issue_date antiguo y otro EMITIDO/ANULADO sin ella → FISCAL_UNRECONCILED. La condición pasa a withDate < total.
3. hasUnreconciledFiscalClock deja de ser opcional en IBillingStandingReadPort, y ConservationDutyService lo llama sin ?. ; un puerto sin el método no compila. Igual para cualquier método opcional nuevo de B2-R3 que decida un deber.
Los casos de B2-R3 (todos sin reloj) siguen en verde sin tocar sus aserciones.
Entrega: diff, rojo y verde, unitarias sin caché, integración completa de @iwana/db y apps/api como en CI (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true) con duración y omitidas frente a integration-expected-skips.json, typecheck, ESLint y Prettier.
```
