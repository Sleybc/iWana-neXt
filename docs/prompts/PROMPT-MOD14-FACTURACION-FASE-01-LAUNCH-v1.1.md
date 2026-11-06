# LAUNCH — MOD14 · Facturación Fase 01 · Ola 1 (re-sync v1.1)

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, re-sync v1.1) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargos:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Reemplaza a:** LAUNCH v1.0, que nunca se lanzó.
**Ola que lanza:** Ola 1, P0 ∥ S0 ∥ D1 ∥ B1a · **Gates:** G0 de la definición ✅ 2026-10-31 · **G0 del re-sync v1.1 ✅ 2026-11-03**.
**Bloqueos abiertos:** ninguno para esta ola. D-BIL-2 y D-BIL-8 siguen provisionales: bloquean G7, no esta ola. B1b, B2, B3, B4p, F1, F2 y V se lanzan en olas posteriores.

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `prod-ux` | prompt v1.1 §P0 | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | HLD v1.1 |
| 2 | `sec-eng` | §S0 (incluye §8.1, RS-6 y RS-7) | `security-auditor`, `backend-security-coder`, `auth-implementation-patterns` | HLD v1.1 |
| 3 | `data-eng` | §D1 (migraciones 173–175) | `database-migration`, `postgresql`, `iwana-tenant-migration`, `test-driven-development` | HLD v1.1 §3 |
| 4 | `sr-backend` | §B1a | `typescript-expert`, `test-driven-development` | HLD v1.1 §4 |

**Paralelo:** 1 ∥ 2 ∥ 3 ∥ 4. D1 deja la 174 (permisos) para el final, hasta que B1a publique `BILLING_POLICY_MANAGE`.
**Cierre de ola (G1):** spec UX; informe S0 sin P0 ni P1 sobre §8.1; migraciones de ida y vuelta con conteo real (la 175 excluye anonimizados); contratos y calendario en verde. Nadie commitea.

```text
===== 1 · prod-ux =====
Actúa como prod-ux. Lee AGENTS.md, el plan y tu encargo §P0 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md. Lee los SKILL.md de iwana-identity-ui-review, system-vocabulary-review y wcag-audit-patterns. Contrato: docs/hlds/HLD-MOD14-FACTURACION-v1.1.md; si falta un dato, [BLOQUEO]. Entregas docs/specs/2026-10-31-mod14-facturacion-ux.md (incluye el adquirente oculto de un titular bloqueado y el motivo de anulación SUPLANTACION).

===== 2 · sec-eng =====
Actúa como sec-eng. Lee AGENTS.md, el plan y tu encargo §S0 del prompt v1.1. Lee security-auditor, backend-security-coder y auth-implementation-patterns. Revisas en solo lectura ADR-103 y el HLD v1.1, con foco en §8.1, RS-6 y RS-7, y propones D-BIL-11. Entregas docs/informes/INFORME-MOD14-REVISION-SEGURIDAD-DISENO-v1.0.md con hallazgos P0–P3.

===== 3 · data-eng =====
Actúa como data-eng. Lee AGENTS.md, el plan y tu encargo §D1 del prompt v1.1. Lee database-migration, postgresql, iwana-tenant-migration y test-driven-development. Migraciones 173–175 con sufijos únicos de 13 dígitos (confírmalos en runner.ts); la 175 excluye los contratos de titulares anonimizados. Solo tus rutas; sin commit. Cierras con ida y vuelta y conteo real.

===== 4 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan y tu encargo §B1a del prompt v1.1. Lee typescript-expert y test-driven-development. Implementa el HLD v1.1 §4 en @iwana/shared, incluidos SUPLANTACION y PRIVACY_TITULAR_ANONYMIZED. Sin commit. Cierras con las pruebas en tabla del calendario y los esquemas en verde, con conteo real.
```
