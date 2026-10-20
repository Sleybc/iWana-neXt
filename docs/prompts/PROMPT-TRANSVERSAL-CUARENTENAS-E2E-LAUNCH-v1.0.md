# LAUNCH — TRANSVERSAL · Resolución de las cuarentenas E2E

**Plan:** `docs/plans/2026-10-20-transversal-cuarentenas-e2e.md` v1.0 · **Spec:** `docs/specs/2026-10-20-transversal-cuarentenas-e2e-spec.md` v1.0
**Olas:** 1 (K1 ∥ W1) → 2 (K2 tras K1 ∥ W2 tras W1) → Z (orquestador) → 3 (V1 ∥ V2 condicional → V3) → G7 · **Gate previo:** G0 (D-CQ-1..3) aprobado el 2026-10-20
**Plazo:** CI de `main` en verde con tope de cuarentena 0 **antes del 2026-11-19**.
**Bloqueos abiertos:** ninguno. Estado al arrancar: `main` en `e39d9bd3`; 2 cuarentenas que vencen el 2026-11-19.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| K1 | `prod-ux` | `PROMPT-TRANSVERSAL-CUARENTENAS-E2E-v1.0.md` §K1 | `iwana-identity-ui-review` | spec §3.1 |
| K2 | `sr-qa` | §K2 | `playwright-skill`, `e2e-testing-patterns`, `iwana-test-evidence` | spec MOD11 v1.5 §6 |
| W1 | `fe-platform` | §W1 | `systematic-debugging`, `test-driven-development`, `frontend-dev-guidelines` | spec §3.2 |
| W2 | `sr-qa` | §W2 | `playwright-skill`, `iwana-test-evidence` | spec RQ-W-04 |
| V1 | `sr-qa` | §V1 | `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | spec §3.3 |
| V2 | `ds-owner` (si cambió `@iwana/ui`) | §V2 | `core-components`, `iwana-identity-ui-review` | contrato de `DatePicker` |
| V3 | `gate-verifier` | §V3 | `iwana-test-evidence`, `turborepo-caching` | `AGENTS.md` Gates |

**Z (orquestador):** retirar las dos filas de `e2e/QUARANTINE.md`, tope `0` en `e2e/quarantine-cap.json`, anotar el CA-3 de agosto como superado y reclasificar en el triaje.
**Cierre:** G1-G6 en local con conteo real; G7 = commit, push y CI de `main` en verde (solo AI-EM-ARCH).

---

### Bloque copiar-pegar

> Actúa como `{subagente}` para el bloque `{K1|K2|W1|W2|V1|V2|V3}`. Lee `AGENTS.md`, la spec
> `docs/specs/2026-10-20-transversal-cuarentenas-e2e-spec.md`, el plan
> `docs/plans/2026-10-20-transversal-cuarentenas-e2e.md` y tu § en
> `docs/prompts/PROMPT-TRANSVERSAL-CUARENTENAS-E2E-v1.0.md`.
> Antes de actuar lee los `SKILL.md` de tu fila (como documentación, no como tool).
> Solo editas los archivos de tu fila en el prompt §2; no relajes aserciones.
> No commitees ni edites `e2e/QUARANTINE.md`. Reporta rutas, comando y conteo real, y deuda por severidad.
