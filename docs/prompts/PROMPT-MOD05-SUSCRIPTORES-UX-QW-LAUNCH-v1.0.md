# LAUNCH — MOD05 · Suscriptores · Quick wins de UX

**Plan:** `docs/plans/2026-10-18-mod05-suscriptores-ux-quick-wins.md` v1.0 · **Spec:** `docs/specs/2026-10-18-mod05-suscriptores-ux-rediseno-spec.md` v1.0
**Ola que lanza:** Ola 1 (F1 ∥ F2 ∥ F3) y, tras G1, Ola 2 (V1 ∥ V2 ∥ V3 → V4) · **Gate previo:** G0 (D-UX1..3) aprobado el 2026-10-18
**Consumido:** Olas 1 y 2 ejecutadas; el cierre se reanudó con la [v1.1](PROMPT-MOD05-SUSCRIPTORES-UX-QW-LAUNCH-v1.1.md).

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| F1 | `fe-platform` | `PROMPT-MOD05-SUSCRIPTORES-UX-QW-v1.0.md` §F1 | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `frontend-security-coder` | spec §3 QW1 v1.0 |
| F2 | `fe-platform` | §F2 | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `nextjs-app-router-patterns` | spec §3 QW2, QW3, QW5 v1.0 |
| F3 | `fe-platform` | §F3 | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review` | spec §3 QW4, QW5, QW6 v1.0 |
| V1 | `sr-qa` | §V1 | `testing-patterns`, `wcag-audit-patterns`, `playwright-skill`, `iwana-test-evidence` | spec §5 |
| V2 | `ds-owner` | §V2 | `iwana-identity-ui-review`, `core-components` | spec §3 |
| V3 | `sec-eng` | §V3 | `frontend-security-coder`, `security-auditor` | spec R1.5 |
| V4 | `gate-verifier` | §V4 | `iwana-test-evidence`, `turborepo-caching` | `AGENTS.md` Gates |

**Paralelo:** F1 ∥ F2 ∥ F3 con archivos disjuntos (prompt §2); V1 ∥ V2 ∥ V3; V4 al final.
**Cierre de ola:** G1-G5 del plan §4 con conteo real de tests; commit solo de AI-EM-ARCH (G6).

---

### Bloque copiar-pegar

> Actúa como `{subagente}` para el bloque `{F1|F2|F3|V1|V2|V3|V4}`. Lee `AGENTS.md`, el plan
> `docs/plans/2026-10-18-mod05-suscriptores-ux-quick-wins.md`, la spec
> `docs/specs/2026-10-18-mod05-suscriptores-ux-rediseno-spec.md` y tu § en
> `docs/prompts/PROMPT-MOD05-SUSCRIPTORES-UX-QW-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de tu fila de la tabla (como documentación, no como tool).
> Solo editas los archivos de tu fila en el prompt §2. No toques `packages/shared`, `apps/api`,
> `packages/ui` ni `api-client.ts`: si lo necesitas, emite `[BLOQUEO]` y para. No commitees.
> Cierras cuando se cumple el «Cierras cuando» de tu §. Reporta rutas, comando y conteo real de tests,
> reglas y CA cubiertos, y deuda nueva por severidad.
