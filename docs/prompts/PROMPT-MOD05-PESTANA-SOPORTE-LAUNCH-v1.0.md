# LAUNCH — MOD05 · Pestaña Soporte del suscriptor (E6)

**Plan:** `docs/plans/2026-10-20-mod05-pestana-soporte.md` v1.0 · **PRD:** `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-07-v1.0.md` v1.0
**Olas:** 1 (P0 ∥ B0) → 2 (B1 ∥ B2 ∥ B3 tras S1; F1 ∥ F2 tras S2+S3) → 3 (V1 ∥ V2 ∥ V3 ∥ V4 → V5) → G7 · **Gate previo:** G0 (D-E6-1..6) aprobado el 2026-10-20
**Bloqueos abiertos:** ninguno. Estado al arrancar: `main` en `b6c50fef`; última migración tenant 158; E2E portal bloqueante y sin cuarentenas.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| P0 | `prod-ux` | `PROMPT-MOD05-PESTANA-SOPORTE-v1.0.md` §P0 | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | PRD §5.4, RF-SO-15 |
| B0 | `sr-backend` | §B0 | `database-migration`, `iwana-tenant-migration`, `postgresql`, `nestjs-expert`, `test-driven-development` | PRD RF-SO-07, §7 |
| B1 | `sr-backend` | §B1 | `nestjs-expert`, `postgresql`, `test-driven-development`, `openapi-spec-generation` | PRD §5.1 |
| B2 | `sr-backend` | §B2 | `nestjs-expert`, `postgresql`, `test-driven-development`, `openapi-spec-generation` | PRD §5.2 |
| B3 | `sr-backend` | §B3 | `nestjs-expert`, `test-driven-development` | PRD RF-SO-16 |
| F1 | `fe-platform` | §F1 | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `system-vocabulary-review` | S2 + spec P0 |
| F2 | `fe-platform` | §F2 | `core-components`, `frontend-dev-guidelines`, `test-driven-development` | PRD RF-SO-15 + spec P0 |
| V1 | `sr-qa` | §V1 | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` | PRD §8 |
| V2 | `sec-eng` | §V2 | `security-auditor`, `backend-security-coder`, `frontend-security-coder` | PRD RF-SO-11, §6 |
| V3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | §V3 | `architect-review` | S1 + S2 |
| V4 | `ds-owner` | §V4 | `iwana-identity-ui-review`, `core-components` | spec P0 |
| V5 | `gate-verifier` | §V5 | `iwana-test-evidence`, `turborepo-caching` | `AGENTS.md` Gates |

**Cierre:** G1-G6 en local con conteo real; G7 = commit, push y CI de `main` en verde con el job «E2E portal» bloqueante (solo AI-EM-ARCH).

---

### Bloque copiar-pegar

> Actúa como `{subagente}` para el bloque `{P0|B0|B1|B2|B3|F1|F2|V1|V2|V3|V4|V5}`. Lee `AGENTS.md`, el PRD
> `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-07-v1.0.md`, el plan
> `docs/plans/2026-10-20-mod05-pestana-soporte.md` y tu § en
> `docs/prompts/PROMPT-MOD05-PESTANA-SOPORTE-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de tu fila (como documentación, no como tool).
> Solo editas los archivos de tu fila en el prompt §2; si necesitas otro, emite `[BLOQUEO]` y para.
> No commitees. Reporta rutas, comando y conteo real de tests, RF y CA cubiertos, y deuda por severidad.
