# LAUNCH — MOD05 · Consolidación del clúster · Ola 3 (C1a → aprobación → C1b)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §C1a, §C1b y §Ola 3 · Sustituye a [v1.3](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.3.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:** Q2 GO; Q3 GO, siete de siete (gate 4 4/4 tras §K4f) ([informe](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md)). R-ER fuera como DT-3; DT-4 en triage después de C1.
**Bloqueos abiertos:** ninguno. Prohibidos el staging parcial, `git stash` y el push.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | §C1a (solo lectura) y para | `verification-before-completion`, `iwana-checkpoint-commit` | Plan §3 Q4; D-CK-2 |
| 2 | `plat-ops` | §C1b, **solo tras aprobación de AI-EM-ARCH** | `verification-before-completion`, `docs-architect` | Lista aprobada en C1a |

**Estado real al arrancar:** `main` = `origin/main` = `6dbdda8a`; índice vacío; sin stash; respaldos de R3-bis y R3-ter fuera del repo; worker, API y portal de desarrollo levantados (no afectan a C1).
**Cierre de ola:** cuatro commits locales por archivo completo, el índice igual al árbol en cada uno, lint-staged sin cambios de contenido y §C1 en el informe. Sin push: F3 y G6.5 necesitan orden del CTO.

---

### Bloque copiar-pegar

===== 1 · plat-ops (C1a) =====
Actúa como `plat-ops`. Lee `AGENTS.md`, el plan §3 Q4 y §C1a de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`. Lee `verification-before-completion` e `iwana-checkpoint-commit`. Solo lectura: clasifica cada ruta de `git status --short` en commit 1–4, excluida D-CK-2, ajena o dudosa, con evidencia de `git diff` e importaciones. Escribe §C1a en el informe de consolidación, con totales que cuadren con `git status` y la lista de dudosas. No hagas `git add` ni commit: para y espera la aprobación.
