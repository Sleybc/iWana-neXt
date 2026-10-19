# LAUNCH — MOD05 · Ciclo de vida y suspensión unificada (E4)

**Versión:** 1.1 · **Plan:** `docs/plans/2026-10-19-mod05-ciclo-vida-suspension.md` v1.1 · **PRD:** `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.1.md`
**Olas:** 1 (P0 ∥ B0) → 2 (B1; tras S1, B2 ∥ B3 ∥ B4 ∥ B5; B3 espera S2; B1 integra tras S3) → 3 (V1 ∥ V2 ∥ V3 ∥ V4 → V5) · G0 aprobado el 2026-10-19
**Aclaraciones aprobadas:** RF-LC-11 exige `action`; cancelación exige `reasonCode`; avisos usan puertos MOD12/MOD11 vía ADR-097. Arranque real: `main` en `a3c5539e`, quick wins cerrados, E4 sin implementar.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| P0 | `prod-ux` | prompt v1.1 §P0 | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | PRD §5.7 |
| B0 | `sr-backend` | §B0 | `database-migration`, `iwana-tenant-migration`, `postgresql`, `test-driven-development` | PRD §7 |
| B1 | `sr-backend` | §B1 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `typescript-expert`, `openapi-spec-generation` | S1 + S3 + PRD §§5.1-5.6 |
| B2 | `sr-backend` | §B2 | `nestjs-expert`, `test-driven-development` | S1 |
| B3 | `fe-platform` | §B3 | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `system-vocabulary-review` | S1 + spec P0 |
| B4 | `sr-backend` | §B4 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development` | MOD12 port |
| B5 | `sr-backend` | §B5 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development` | MOD11 port |
| V1 | `sr-qa` | §V1 | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` | PRD §8 |
| V2 | `sec-eng` | §V2 | `security-auditor`, `backend-security-coder` | PRD §6 |
| V3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | §V3 | `architect-review` | S1 |
| V4 | `ds-owner` | §V4 | `iwana-identity-ui-review`, `core-components` | spec P0 |
| V5 | `gate-verifier` | §V5 | `iwana-test-evidence`, `turborepo-caching` | `AGENTS.md` Gates |

**Cierre de ola:** G1-G6 del plan §4 con conteo real; commit solo de AI-EM-ARCH (G7). Skills completas en plan §3.

---

### Bloque copiar-pegar

> Actúa como `{subagente}` para `{P0|B0|B1|B2|B3|B4|B5|V1|V2|V3|V4|V5}`. Lee `AGENTS.md`, PRD
> `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.1.md`, el plan
> `docs/plans/2026-10-19-mod05-ciclo-vida-suspension.md` y tu bloque en
> `docs/prompts/PROMPT-MOD05-CICLO-VIDA-v1.1.md`; antes de codificar lee skills del plan §3.
> Antes de escribir código lee los `SKILL.md` de tu fila (como documentación, no como tool).
> Edita solo tus archivos de §2; B4/B5 no tocan CRM y B1 integra los puertos tras S3. No leas tablas ajenas.
> No commitees. Reporta rutas, comando y conteo real de tests, RF y CA cubiertos, y deuda por severidad.

**Plantilla y fuentes:** [plantilla](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) · [plan](../plans/2026-10-19-mod05-ciclo-vida-suspension.md) · [PRD](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.1.md) · [encargo](PROMPT-MOD05-CICLO-VIDA-v1.1.md)
