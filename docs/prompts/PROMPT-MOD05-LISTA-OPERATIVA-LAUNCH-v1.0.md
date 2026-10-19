# LAUNCH — MOD05 · Lista operativa de Suscriptores (E1 + E2)

**Plan:** `docs/plans/2026-10-19-mod05-lista-operativa.md` v1.0 · **PRD:** `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-06-v1.0.md` v1.0 · **Estado:** Aprobado
**Olas:** 1 (P0 ∥ D0 ∥ B0 ∥ Q0) → 2 (F1 tras S3 ∥ F2 tras S1+S2) → 3 (V1 ∥ V2 ∥ V3 ∥ V4 → V5) → G7 · **Gate previo:** G0 (D-F6-1..6) aprobado el 2026-10-19
**Bloqueos abiertos:** ninguno. Estado al arrancar: Fase 05 cerrada con CI verde; nada de la Fase 06 implementado.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| P0 | `prod-ux` | `PROMPT-MOD05-LISTA-OPERATIVA-v1.0.md` §P0 | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | PRD §5.3-§5.5 |
| D0 | `ds-owner` | §D0 | `core-components`, `iwana-identity-ui-review` | PRD RF-LO-21, RF-LO-22 |
| B0 | `sr-backend` | §B0 | `nestjs-expert`, `postgresql`, `test-driven-development`, `typescript-expert`, `openapi-spec-generation` | PRD §5.1, §5.2, §7 |
| Q0 | `sr-qa` | §Q0 | `testing-patterns`, `test-driven-development`, `iwana-test-evidence` | PRD RF-LO-20 |
| F1 | `fe-platform` | §F1 | `core-components`, `frontend-dev-guidelines`, `test-driven-development`, `wcag-audit-patterns` | contrato D0 |
| F2 | `fe-platform` | §F2 | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `nextjs-app-router-patterns`, `system-vocabulary-review` | S1 + spec P0 |
| V1 | `sr-qa` | §V1 | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` | PRD §8 |
| V2 | `sec-eng` | §V2 | `security-auditor`, `frontend-security-coder` | PRD RF-LO-04, RF-LO-18 |
| V3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | §V3 | `architect-review` | S1 |
| V4 | `ds-owner` | §V4 | `iwana-identity-ui-review`, `core-components` | spec P0 + contrato D0 |
| V5 | `gate-verifier` | §V5 | `iwana-test-evidence`, `turborepo-caching` | `AGENTS.md` Gates |

**Cierre:** G1-G6 en local con conteo real; G7 = commit, push y CI de `main` en verde (solo AI-EM-ARCH).

---

### Bloque copiar-pegar

> Actúa como `{subagente}` para el bloque `{P0|D0|B0|Q0|F1|F2|V1|V2|V3|V4|V5}`. Lee `AGENTS.md`, el PRD
> `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-06-v1.0.md`, el plan
> `docs/plans/2026-10-19-mod05-lista-operativa.md` y tu § en
> `docs/prompts/PROMPT-MOD05-LISTA-OPERATIVA-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de tu fila (como documentación, no como tool).
> Solo editas los archivos de tu fila en el prompt §2; si necesitas otro, emite `[BLOQUEO]` y para.
> No commitees. Reporta rutas, comando y conteo real de tests, RF y CA cubiertos, y deuda por severidad.
