# LAUNCH — MOD05 · Fase 09 Ciclo de facturación · V3c (suite completa)

**Plan:** `docs/plans/2026-10-30-mod05-ciclo-facturacion.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §V3c · Sustituye a [v1.6](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.6.md)
**Gates:** R1, R2, R3, R3-bis y R3-ter cerrados; V3b en verde (portal completo, `crm/contracts` 178/178, CA-CF-08 ejecutado). Falta la suite completa de API por el cambio de `ContractsModule`.
**Bloqueos abiertos:** ninguno.
**Plantilla:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md)

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `gate-verifier` | §V3c | `iwana-test-evidence`, `verification-before-completion`, `turborepo-caching` | AGENTS.md «Gates Before Merge» |

**Estado al arrancar:** índice vacío; sin stash; respaldos de R3-bis y R3-ter fuera del repo (no borrar).
**Cierre de ola:** suite completa de API e integraciones sin omisiones en verde. Luego AI-EM-ARCH consolida el GO de D.

---

### Bloque copiar-pegar

===== 1 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge» y §V3c de `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md`. Lee `iwana-test-evidence`, `verification-before-completion` y `turborepo-caching`. Sin caché de turbo: suite completa de `@iwana/api` (incluido `app.module.boot.spec.ts`), las integraciones Postgres de contratos, cambio de plan, ciclo de vida y la migración 167 sin omisiones (`IWANA_DB_INTEGRATION_AVAILABLE=true`, `DB_NAME` permitido) y typecheck de `@iwana/shared`. Comandos y cifras reales; ante un fallo, reporta suite, caso, primer error y ola (D, E, F u otra). No corriges código.
