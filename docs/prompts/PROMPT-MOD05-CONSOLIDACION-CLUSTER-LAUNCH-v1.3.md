# LAUNCH — MOD05 · Consolidación del clúster · Ola 2c (K4a ∥ K4b ∥ K4c → K4d → K4e → G1)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §Ola 2c · Sustituye a [v1.2](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.2.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:** auditoría de K3 con GO condicionado; 3 P1 cerrados en el código; sin P0/P1 ni regresión ocultada ([informe](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md)). Spec de ciclo y addendum U en v1.1.
**Bloqueos abiertos:** ninguno. Sin stash, sin staging parcial, sin commit.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `fe-platform` | §K4a | `frontend-dev-guidelines`, `core-components`, `wcag-audit-patterns`, `system-vocabulary-review` | Spec de ciclo v1.1 §3; addendum U v1.1 |
| 2 | `sr-backend` | §K4b | `test-driven-development`, `backend-security-coder`, `iwana-test-evidence`, `postgresql` | Matriz K3a; ADR-102 |
| 3 | `sec-eng` | §K4c (solo lectura) | `security-auditor`, `auth-implementation-patterns` | Ley 1581 |
| 4 | `sr-qa` | §K4d, **después de 1** | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` | Spec de ciclo v1.1 |
| 5 | `test-change-reviewer` | §K4e, **después de 2 y 4** | — | Specs de K4 |
| 6 | `gate-verifier` | §G1, **después de 5**; no edita | `iwana-test-evidence`, `verification-before-completion` | Plan §3 Q3 |

**Paralelo:** 1 ∥ 2 ∥ 3, sobre archivos disjuntos.
**Estado real al arrancar:** `main` = `origin/main` = `6dbdda8a`; índice vacío; sin stash; respaldos de R3-bis y R3-ter fuera del repo.
**Cierre de ola:** G1 en GO sin ediciones de `gate-verifier`. Después, C1 (Ola 3), sin push.

---

### Bloque copiar-pegar

===== 1 · fe-platform (K4a) =====
Actúa como `fe-platform`. Lee `AGENTS.md`, §K4a de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`, la spec de ciclo v1.1 y el addendum U v1.1. Lee `frontend-dev-guidelines`, `core-components`, `wcag-audit-patterns` y `system-vocabulary-review`. Migra el menú de `ContractCard` a `DropdownMenu`, aplica el nombre «Acciones de {nombre}» y separa ciclo y próximo corte en dos datos. Pruebas por punto, `audit-ui.mjs` en 0 y suite del portal con conteo real. No toques `e2e/`. Sin stash ni commit.

===== 2 · sr-backend (K4b) =====
Actúa como `sr-backend`. Lee `AGENTS.md` y §K4b del mismo prompt. Lee `test-driven-development`, `backend-security-coder`, `iwana-test-evidence` y `postgresql`. Solo pruebas: P2-1, P2-2, P3-3 y P3-4. Si una prueba revela un defecto de producción, `[BLOQUEO]` sin corregirlo. Cierras con typecheck de api en 0 y suites tocadas con conteo real y 0 omisiones. Sin stash ni commit.

===== 3 · sec-eng (K4c) =====
Actúa como `sec-eng`. Lee `AGENTS.md` y §K4c del mismo prompt. Lee `security-auditor` y `auth-implementation-patterns`. Solo lectura: determina si `GuardBlockedTitular` rechaza toda mutación de contratos de un titular borrado. Escribe §K4c en el informe de consolidación.

===== 4 · sr-qa (K4d, después de 1) =====
Actúa como `sr-qa`. Lee `AGENTS.md` y §K4d del mismo prompt. Lee `e2e-testing-patterns`, `playwright-skill` e `iwana-test-evidence`. Corrige el comentario, el selector y la comprobación de ciclo de la E2E de ciclo, y ejecuta las dos E2E del clúster con conteo real, en tenant de pruebas. Si fallan, clasifica sin corregir producto.

===== 5 · test-change-reviewer (K4e, después de 2 y 4) =====
Actúa como `test-change-reviewer`. Lee `AGENTS.md` y §K4e del mismo prompt. Solo lectura: revisa cada spec cambiada en K4 contra su producción o contrato y escribe §K4e en el informe. Un hallazgo C bloquea G1.

===== 6 · gate-verifier (G1, después de 5) =====
Actúa como `gate-verifier`. Lee `AGENTS.md`, §G1 del mismo prompt y el plan §3 Q3. Lee `iwana-test-evidence` y `verification-before-completion`. Ejecuta los gates con conteo real. No edites pruebas ni código: un gate rojo se reporta con su causa. Actualiza la sección de G1 del informe con el veredicto.
