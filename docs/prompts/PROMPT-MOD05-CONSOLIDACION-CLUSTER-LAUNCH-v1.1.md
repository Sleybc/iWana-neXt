# LAUNCH — MOD05 · Consolidación del clúster · Ola 2 (R1 ∥ R2 ∥ R3 ∥ R4 ∥ G1)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` v1.0 · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §Ola 2 · Sustituye a [v1.0](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.0.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:** Q1 ✅ (RF-LC-17 y prueba real de `CONTRACT_CHANGED`: 2 suites, 34 pruebas, 0 omisiones); K2 ✅ (Prettier en 25 archivos, solo formato; typecheck de los 4 paquetes en 0). [Informe Ola 1](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-OLA1-v1.0.md).
**Bloqueos abiertos:** ninguno. Todos en solo lectura salvo G1, que solo ejecuta. Sin stash, sin staging parcial, sin commit.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `boundary-reviewer` | §R1 | `architect-review` | AGENTS.md, ADR-100, ADR-093, addendum U |
| 2 | `contract-drift-reviewer` | §R2 | `architect-review`, `typescript-expert` | `@iwana/shared`, RF-S404-50 |
| 3 | `sec-eng` | §R3 | `security-auditor`, `backend-security-coder`, `frontend-security-coder` | CA-U-04; spec E |
| 4 | `prod-ux` + `ds-owner` | §R4 | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns`, `core-components` | Addendum U, spec E |
| 5 | `gate-verifier` | §G1 | `iwana-test-evidence`, `verification-before-completion`, `turborepo-caching`, `e2e-testing-patterns` | Plan §3 Q3 |

**Paralelo:** 1 ∥ 2 ∥ 3 ∥ 4 ∥ 5. El 5 consolida en su informe los hallazgos de 1–4.
**Estado real al arrancar:** `main` = `origin/main` = `6dbdda8a`; índice vacío; sin stash; respaldos de R3-bis y R3-ter fuera del repo.
**Cierre de ola:** `docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` con gates Q3 y hallazgos P0–P3. Con P0/P1 → K3; sin ellos → C1.

---

### Bloque copiar-pegar

===== 1 · boundary-reviewer (R1) =====
Actúa como `boundary-reviewer`. Lee `AGENTS.md`, el plan y §R1 de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`. Lee `architect-review`. Solo lectura sobre el diff del clúster. Reporta con `archivo:línea` y P0–P3.

===== 2 · contract-drift-reviewer (R2) =====
Actúa como `contract-drift-reviewer`. Lee `AGENTS.md` y §R2 del mismo prompt. Lee `architect-review` y `typescript-expert`. Solo lectura: shared ↔ API ↔ portal, `confirmProfile`, alias y duplicados. Reporta con `archivo:línea`.

===== 3 · sec-eng (R3) =====
Actúa como `sec-eng`. Lee `AGENTS.md` y §R3 del mismo prompt. Lee `security-auditor`, `backend-security-coder` y `frontend-security-coder`. Solo lectura: `tax-profile/confirm`, `plan-change` y exposición de la ficha por rol. Hallazgos P0–P3.

===== 4 · prod-ux + ds-owner (R4) =====
Actúa como `prod-ux` y `ds-owner`. Lee `AGENTS.md` y §R4 del mismo prompt. Lee `iwana-identity-ui-review` (con `audit-ui.mjs`), `system-vocabulary-review`, `wcag-audit-patterns` y `core-components`. Solo lectura sobre U-ficha y el diálogo de E. Hallazgos con `archivo:línea`.

===== 5 · gate-verifier (G1) =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge» y §G1 del mismo prompt. Lee `iwana-test-evidence`, `verification-before-completion`, `turborepo-caching` y `e2e-testing-patterns`. Ejecuta los 7 puntos de §G1 sin caché y con conteo real; E2E sin entorno = `NOT_EXECUTED` con causa. Escribe `docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` (verifica ruta libre) e integra los hallazgos de R1–R4. No corriges código.
