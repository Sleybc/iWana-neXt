# LAUNCH — privacy · H-EXP Fase 1 · B4-R (re-revisión tras B2-R3 y B2-R4)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.5 a §1.7 · **Sustituye en parte:** [B4](PROMPT-PRIVACY-H-EXP-FASE-1-B4-LAUNCH-v1.0.md) (contract-drift y test-change-reviewer ya cerrados)
**Ola que lanza:** B4-R, solo lectura y en paralelo · **Gates:** G3 ✅ · G2 de B2-R4 ✅ 2026-11-08
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sec-eng` | Cierre de P1, P2a, P2b y P3 | `security-auditor`, `backend-security-coder`, `postgresql` |
| 2 | `boundary-reviewer` | Cierre de B1 | — |
| 3 | `gate-verifier` | Gates Before Merge completos | `iwana-test-evidence`, `verification-before-completion` |

**Siguiente:** commit y push → G6.5 → B5. **Cierre (G6):** sin P1 abierto; suites completas con conteo real.
**Reglas:** solo lectura, `main`, cero PII, nunca `tenant_iwana`. Hallazgos con archivo:línea y severidad.

```text
===== B4-R · sec-eng =====
Actúa como sec-eng. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.5 a §1.7 y la spec H-EXP v1.1 D-EXP-1. Lee antes los SKILL.md de security-auditor, backend-security-coder y postgresql.
Confirma en el diff sin commit que quedan cerrados: P1 (reloj contractual o fiscal ausente, también en el caso mixto, falla cerrado por el motor y por la ruta API de supresión), P2a (R4 de la 179 con transferred_to, transfer_destination_*, arrays y status), P2b (BEFORE TRUNCATE en las cuatro tablas) y P3 (request_id NULL en el ledger del prospecto). Busca cualquier otro deber que pueda fallar abierto ante un dato ausente. Solo lectura; archivo:línea y severidad.
===== B4-R · boundary-reviewer =====
Actúa como boundary-reviewer. Confirma que apps/api/src/modules/privacy/retention/ ya no lee ni bloquea tablas de CRM, Billing ni Assurance por SQL directo y que solo usa sus puertos (IContractStandingReadPort.listProspectDiscard y findProspectDiscard, IBillingStandingReadPort, IPersonalDataErasurePort). Revisa también los métodos nuevos de los adaptadores de CRM y Billing frente a AGENTS.md.
===== B4-R · gate-verifier =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge de AGENTS.md sobre el diff sin commit, en un PostgreSQL desechable nuevo (no la base local test, que tiene semillas cruzadas en tenant_test): unitarias sin caché de shared, db, api y portal; integración de @iwana/db y apps/api como en CI (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true) con duración y omitidas frente a integration-expected-skips.json; migración 179 arriba y abajo; typecheck del monorepo; ESLint y Prettier de las rutas tocadas. Conteo real.
```
