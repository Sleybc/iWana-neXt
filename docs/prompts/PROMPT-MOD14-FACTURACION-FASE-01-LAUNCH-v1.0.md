# LAUNCH — MOD14 · Facturación Fase 01 · Ola 1

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` v1.0 · **Spec:** la entrega P0 en esta ola (`docs/specs/2026-10-31-mod14-facturacion-ux.md`) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.0.md` v1.0
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Ola que lanza:** Ola 1 — P0 ∥ S0 ∥ D1 ∥ B1a · **Gates verificados:** G0 ✅ (CTO, 2026-10-31) · G1–G4 no aplican aún.
**Bloqueos abiertos:** ninguno para esta ola. D-BIL-2 y D-BIL-8 van con valor provisional y bloquean G7, no esta ola. D1 incluye la 171 (D-BIL-7 (b)). B1b, B2, B3, F1, F2 y V no se despachan en esta ola.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `prod-ux` | `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.0.md` §P0 | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | `docs/hlds/HLD-MOD14-FACTURACION-v1.0.md` v1.0 |
| 2 | `sec-eng` | ídem §S0 | `security-auditor`, `backend-security-coder`, `auth-implementation-patterns` | `docs/hlds/HLD-MOD14-FACTURACION-v1.0.md` v1.0 |
| 3 | `data-eng` | ídem §D1 | `database-migration`, `postgresql`, `iwana-tenant-migration`, `test-driven-development` | `docs/hlds/HLD-MOD14-FACTURACION-v1.0.md` v1.0 §3 |
| 4 | `sr-backend` | ídem §B1a | `typescript-expert`, `test-driven-development` | `docs/hlds/HLD-MOD14-FACTURACION-v1.0.md` v1.0 §4 |

**Paralelo:** 1 ∥ 2 ∥ 3 ∥ 4. Cada subagente lee los `SKILL.md` como documentación, no como tool. D1 deja la migración 170 para el final, hasta que B1a publique `BILLING_POLICY_MANAGE`.
**Cierre de ola (G1):** spec UX entregada; informe S0 con Q2 cerrada y propuesta para D-BIL-11; migraciones de ida y vuelta en verde con conteo real; contratos y calendario de shared con pruebas en tabla en verde. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · prod-ux =====
Actúa como `prod-ux`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` y tu encargo §P0 de `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.0.md`. Antes de escribir, lee los `SKILL.md` de `iwana-identity-ui-review`, `system-vocabulary-review` y `wcag-audit-patterns`. Consumes el HLD congelado `docs/hlds/HLD-MOD14-FACTURACION-v1.0.md`; si falta un dato, emite `[BLOQUEO]` y para. Cierras al entregar `docs/specs/2026-10-31-mod14-facturacion-ux.md`.

===== 2 · sec-eng =====
Actúa como `sec-eng`. Lee `AGENTS.md`, el plan y tu encargo §S0. Lee `security-auditor`, `backend-security-coder` y `auth-implementation-patterns`. Revisas en solo lectura ADR-103 y el HLD; cierras la Q2 y propones D-BIL-11. Cierras al entregar `docs/informes/INFORME-MOD14-REVISION-SEGURIDAD-DISENO-v1.0.md` con hallazgos P0–P3.

===== 3 · data-eng =====
Actúa como `data-eng`. Lee `AGENTS.md`, el plan y tu encargo §D1. Lee `database-migration`, `postgresql`, `iwana-tenant-migration` y `test-driven-development`. Confirma la numeración libre en `runner.ts` e implementa el HLD §3 sin modificarlo. Solo tus rutas; no commitees. Cierras con las migraciones aplicadas y revertidas, con conteo real.

===== 4 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan y tu encargo §B1a. Lee `typescript-expert` y `test-driven-development`. Implementa el HLD §4 en `@iwana/shared` sin modificar el contrato. No commitees. Cierras con las pruebas en tabla del calendario y los esquemas en verde, con conteo real.
