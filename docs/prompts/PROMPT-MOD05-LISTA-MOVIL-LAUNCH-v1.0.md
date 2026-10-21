# LAUNCH — MOD05 · Lista móvil de Suscriptores en tarjetas (E3)

**Plan:** `docs/plans/2026-10-21-mod05-lista-movil.md` v1.0 · **PRD:** `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-08-v1.0.md` v1.0
**Olas:** 1 (P0 ∥ B0) → 2 (F1 tras S1+S2 ∥ F2 tras S2) → 3 (V1 ∥ V2 ∥ V3 → V4) → G7 · **Gate previo:** G0 (D-E3-1..6) aprobado el 2026-10-21
**Bloqueos abiertos:** ninguno. Estado al arrancar: `main` en `5e55f841`; E2E portal bloqueante y sin cuarentenas.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| P0 | `prod-ux` | `PROMPT-MOD05-LISTA-MOVIL-v1.0.md` §P0 | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | PRD §5 |
| B0 | `sr-backend` | §B0 | `typescript-expert`, `test-driven-development` | PRD RF-MV-10, §7 |
| F1 | `fe-platform` | §F1 | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `tailwind-patterns` | S1 + spec P0 |
| F2 | `fe-platform` | §F2 | `core-components`, `frontend-dev-guidelines`, `wcag-audit-patterns`, `tailwind-patterns` | spec P0 |
| V1 | `sr-qa` | §V1 | `playwright-skill`, `e2e-testing-patterns`, `iwana-test-evidence`, `verification-before-completion` | PRD §8 |
| V2 | `sec-eng` | §V2 | `frontend-security-coder`, `security-auditor` | PRD RF-MV-07, RF-MV-08, §6 |
| V3 | `ds-owner` | §V3 | `iwana-identity-ui-review`, `core-components` | spec P0 |
| V4 | `gate-verifier` | §V4 | `iwana-test-evidence`, `turborepo-caching` | `AGENTS.md` Gates |

**Cierre:** G1-G5 en local con conteo real; G7 = commit, push y CI de `main` en verde con el job «E2E portal» bloqueante (solo AI-EM-ARCH).

---

### Bloque copiar-pegar

> Actúa como `{subagente}` para el bloque `{P0|B0|F1|F2|V1|V2|V3|V4}`. Lee `AGENTS.md`, el PRD
> `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-08-v1.0.md`, el plan
> `docs/plans/2026-10-21-mod05-lista-movil.md` y tu § en
> `docs/prompts/PROMPT-MOD05-LISTA-MOVIL-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de tu fila (como documentación, no como tool).
> Solo editas los archivos de tu fila en el prompt §2; sin cambios de API ni de proyección.
> No commitees. Reporta rutas, comando y conteo real de tests, RF y CA cubiertos, y deuda por severidad.
