# LAUNCH — privacy · H-EXP Fase 1 · Cierre de B4 (B-2 y revisión final)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.8 y §1.9
**Ola que lanza:** primero 1 (`sr-backend`); al terminar, 2 a 4 en paralelo y solo lectura · **Gates:** G2 de B4-R2 ✅ 2026-11-08
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | B-2 autorizado | `nestjs-expert`, `test-driven-development`, `iwana-test-evidence` |
| 2 | `sec-eng` | M-1 y M-2 | `security-auditor`, `backend-security-coder` |
| 3 | `test-change-reviewer` | Ajustes de B4-R2 y B-2 | — |
| 4 | `gate-verifier` | Gates Before Merge completos | `iwana-test-evidence`, `verification-before-completion` |

**Siguiente:** G6 → commit y push con rutas explícitas → G6.5 → B5. **Cierre (G6):** sin P1 abierto; suites completas con conteo real.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`. Hallazgos con archivo:línea y severidad.

```text
===== 1 · B-2 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md y el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.9. B-2 está autorizado: unreconciledContractClock pasa a boolean obligatorio en el puerto y en los dos adaptadores; el adaptador CRM devuelve siempre terminalWithClock < terminalCount; añade unreconciledContractClock: false en las dos aserciones toEqual de crm-contract-standing-read.adapter.spec.ts (líneas 30 y 60), y nada más en ese spec. Entrega: diff, unitarias de api sin caché, typecheck, ESLint y Prettier. Sin commit.
===== 2 · sec-eng (tras 1) =====
Actúa como sec-eng. Lee el plan §1.8 y §1.9 y ADR-104. Revisa M-1 (conservation-duty.service.ts: el 409 CONTRACT_UNRECONCILED o FISCAL_UNRECONCILED solo cuando no hay contrato abierto ni reloj vigente) y M-2 (hasProspectDuty y processProspecto con el reloj de PQR_SOPORTES de 3 años). Confirma que ningún camino interpreta un reloj ausente como plazo cero. Solo lectura; archivo:línea y severidad.
===== 3 · test-change-reviewer (tras 1) =====
Actúa como test-change-reviewer. Revisa los ajustes de B4-R2 y B-2: resolved_at añadido a solicitudes terminales en las suites B1/B2 y B3, fiscal fechado 2018 → 2014 en conservation-clock-mixed, el stub de retention-expiry.service.spec con consultas separadas, el CHECK de la 179 sin PROSPECT_HAS_CONTRACT y las dos aserciones de crm-contract-standing-read.adapter.spec.ts. Clasifica cada uno: exigido por una regla nueva o posible regresión oculta.
===== 4 · gate-verifier (tras 1) =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge de AGENTS.md sobre el diff de H-EXP en un PostgreSQL desechable nuevo: unitarias sin caché de shared, db, api y portal; integración de @iwana/db y apps/api como en CI (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true) con duración y omitidas frente a integration-expected-skips.json; typecheck del monorepo; ESLint y Prettier de las rutas tocadas; pnpm audit --audit-level=critical --prod. Retira contenedor y volumen al terminar. Conteo real.
```
