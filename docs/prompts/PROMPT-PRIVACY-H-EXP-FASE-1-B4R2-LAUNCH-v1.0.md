# LAUNCH — privacy · H-EXP Fase 1 · B4-R2 (hallazgos medios y bajos de B4-R)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.8 · **Spec:** `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` v1.1 D-EXP-1 · **ADR:** ADR-104
**Ola que lanza:** B4-R2 · **Gates:** G2 de B2-R4 ✅ · G6 ⛔ por M-1
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | M-1, M-2, B-1, B-2, B-3 y B-5 del plan §1.8 | `nestjs-expert`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Siguiente:** `sec-eng` (M-1, M-2), `test-change-reviewer` (lo nuevo) y `gate-verifier` → G6. **Cierre (G2):** rojo y luego verde; integración como en CI en PostgreSQL nuevo.
**Reglas:** `main` sin ramas, **sin stash** ni commit, cero PII, nunca `tenant_iwana`. HEAD avanzó a `1853f931`: revisa `git status` antes de empezar.

```text
===== H-EXP B4-R2 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.8, la spec H-EXP v1.1 D-EXP-1 y ADR-104. Lee antes los SKILL.md de nestjs-expert, postgresql, backend-security-coder, test-driven-development, iwana-test-evidence.
Primero en rojo, contra PostgreSQL real:
1. M-1: conservation-duty.service.ts:82-88 lanza CONTRACT_UNRECONCILED antes de mirar el contrato abierto. Con un contrato abierto y otro terminado sin fecha, la supresión por API debe responder como hoy ante un contrato abierto (conserva), no 409. El 409 codificado solo cuando nada más justifica conservar.
2. M-2: hasProspectDuty (retention-expiry.service.ts:1247-1254) aplica a prospectos el reloj completo de PQR_SOPORTES: 3 años desde lastResponseAt (ADR-104). Una PQR respondida hace 6 meses retiene; respondida hace más de 3 años, no.
3. B-1: pruebas de CONTRACT_UNRECONCILED y FISCAL_UNRECONCILED por la ruta HTTP de supresión y en el ledger de processTitular (fila ATTENTION_REQUIRED con reason_code).
4. B-2: unreconciledContractClock pasa a boolean obligatorio en el puerto y en sus adaptadores.
5. B-3: prospecto DESCARTADO sin discardedAt y solicitud terminal sin fecha de cierre dejan fila ATTENTION_REQUIRED con su código (PROSPECT_UNRECONCILED, MISSING_REQUEST_CLOSURE). Retira del CHECK de la 179 los códigos que ningún camino produzca.
6. B-5: el dry-run de expire-retention separa elegibles de no conciliados; --apply sale con código distinto de 0 si el lote deja ATTENTION_REQUIRED o FAILED. Actualiza el runbook RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md con los códigos de salida, sin Prettier en docs/.
Cualquier ajuste de una aserción existente fuera de la 179 y de las suites de H-EXP es [BLOQUEO].
Entrega: diff, rojo y verde, unitarias sin caché, integración completa de @iwana/db y apps/api como en CI en un PostgreSQL desechable nuevo (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true) con duración y omitidas frente a integration-expected-skips.json, typecheck, ESLint y Prettier.
```
