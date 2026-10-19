# LAUNCH — MOD05 · Ciclo de vida y suspensión unificada (E4)

**Plan:** `docs/plans/2026-10-19-mod05-ciclo-vida-suspension.md` v1.0 · **PRD:** `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.0.md` v1.0
**Olas:** 1 (P0 ∥ B0) → 2 (B1; tras S1, B2 ∥ B3) → 3 (V1 ∥ V2 ∥ V3 ∥ V4 → V5) · **Gate previo:** G0 (D-E4-1..6) aprobado el 2026-10-19
**Bloqueos abiertos:** ninguno. Estado al arrancar: `main` en `d5b5c92d`, quick wins cerrados, nada de E4 implementado.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| P0 | `prod-ux` | `PROMPT-MOD05-CICLO-VIDA-v1.0.md` §P0 | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | PRD §5.7 |
| B0 | `sr-backend` | §B0 | `database-migration`, `iwana-tenant-migration`, `postgresql`, `test-driven-development` | PRD §7 |
| B1 | `sr-backend` | §B1 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `typescript-expert`, `openapi-spec-generation` | PRD §5.1-§5.6 |
| B2 | `sr-backend` | §B2 | `nestjs-expert`, `test-driven-development` | S1 |
| B3 | `fe-platform` | §B3 | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `system-vocabulary-review` | S1 + spec P0 |
| V1 | `sr-qa` | §V1 | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` | PRD §8 |
| V2 | `sec-eng` | §V2 | `security-auditor`, `backend-security-coder` | PRD §6 |
| V3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | §V3 | `architect-review` | S1 |
| V4 | `ds-owner` | §V4 | `iwana-identity-ui-review`, `core-components` | spec P0 |
| V5 | `gate-verifier` | §V5 | `iwana-test-evidence`, `turborepo-caching` | `AGENTS.md` Gates |

**Cierre de ola:** G1-G6 del plan §4 con conteo real; commit solo de AI-EM-ARCH (G7).

---

### Bloque copiar-pegar

> Actúa como `{subagente}` para el bloque `{P0|B0|B1|B2|B3|V1|V2|V3|V4|V5}`. Lee `AGENTS.md`, el PRD
> `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.0.md`, el plan
> `docs/plans/2026-10-19-mod05-ciclo-vida-suspension.md` y tu § en
> `docs/prompts/PROMPT-MOD05-CICLO-VIDA-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de tu fila (como documentación, no como tool).
> Solo editas los archivos de tu fila en el prompt §2; si necesitas otro, emite `[BLOQUEO]` y para.
> No commitees. Reporta rutas, comando y conteo real de tests, RF y CA cubiertos, y deuda por severidad.
