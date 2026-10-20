# LAUNCH — TRANSVERSAL · Salud de pruebas

**Plan:** `docs/plans/2026-10-20-transversal-salud-pruebas.md` v1.0 · **Spec:** `docs/specs/2026-10-20-transversal-salud-pruebas-spec.md` v1.0
**Olas:** 1 (T0 ∥ B0 ∥ C0 ∥ Q0) → S1 matriz → 2 (E0 ∥ PA ∥ PB ∥ R0) → 3 (J0) → 4 (V1 ∥ V2 → V3) → G7 · **Gate previo:** G0 (D-SP-1..6) aprobado el 2026-10-20
**Bloqueos abiertos:** ninguno. Estado al arrancar: `main` en `cc54cf9d`; E2E portal 125/304 fallos; B5 omitida en CI.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| T0 | `e2e-triage` | `PROMPT-TRANSVERSAL-SALUD-PRUEBAS-v1.0.md` §T0 | `playwright-skill`, `e2e-testing-patterns`, `systematic-debugging` | spec §3.1 |
| B0 | `sr-backend` | §B0 | `postgresql`, `iwana-tenant-migration`, `testing-patterns`, `iwana-test-evidence` | spec §3.7 |
| C0 | `sr-qa` | §C0 | `testing-patterns`, `test-driven-development`, `iwana-test-evidence` | spec §3.8 |
| Q0 | `plat-ops` | §Q0 | `turborepo-caching`, `verification-before-completion` | spec §3.5 |
| E0 | `sr-qa` | §E0 | `playwright-skill`, `e2e-testing-patterns`, `iwana-test-evidence` | spec §3.2 |
| PA | `sr-qa` | §PA | `playwright-skill`, `e2e-testing-patterns`, `systematic-debugging`, `iwana-test-evidence` | matriz S1 |
| PB | `sr-qa` | §PB | `playwright-skill`, `e2e-testing-patterns`, `systematic-debugging`, `iwana-test-evidence` | matriz S1 + D-SP-5 |
| R0 | `fe-platform` | §R0 | `frontend-dev-guidelines`, `systematic-debugging`, `test-driven-development` | matriz S1 |
| J0 | `plat-ops` | §J0 | `turborepo-caching`, `verification-before-completion` | spec §3.6, RQ-B-03 |
| V1 | `sr-qa` | §V1 | `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | spec §4 |
| V2 | `docs-governance` | §V2 | — | `AGENTS.md` |
| V3 | `gate-verifier` | §V3 | `iwana-test-evidence`, `turborepo-caching` | `AGENTS.md` Gates |

**Cierre:** G1-G6 en local con conteo real; G7 = commit, push y CI de `main` en verde con el job «E2E portal» bloqueante (solo AI-EM-ARCH).

---

### Bloque copiar-pegar

> Actúa como `{subagente}` para el bloque `{T0|B0|C0|Q0|E0|PA|PB|R0|J0|V1|V2|V3}`. Lee `AGENTS.md`, la spec
> `docs/specs/2026-10-20-transversal-salud-pruebas-spec.md`, el plan
> `docs/plans/2026-10-20-transversal-salud-pruebas.md` y tu § en
> `docs/prompts/PROMPT-TRANSVERSAL-SALUD-PRUEBAS-v1.0.md`.
> Antes de actuar lee los `SKILL.md` de tu fila (como documentación, no como tool).
> Solo editas los archivos de tu fila en el prompt §2; no relajes aserciones para arreglar una prueba.
> No commitees ni edites `e2e/QUARANTINE.md`. Reporta rutas, comando y conteo real, y filas de cuarentena propuestas.
