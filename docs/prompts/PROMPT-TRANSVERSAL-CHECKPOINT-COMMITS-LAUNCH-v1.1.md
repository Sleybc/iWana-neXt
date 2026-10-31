# LAUNCH — Transversal · Checkpoint de commits · Ola F1 (A → B → C → G → H)

**Encargo:** `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` §F1 y §Decisiones del CTO · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Ola que lanza:** F1 para las olas A, B, C, G y H · **Gates verificados:** F0 ✅ ([informe](../informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md)); D-CK-1 y D-CK-2 resueltas por el CTO el 2026-10-31.
**Bloqueos abiertos:** D (ciclo de facturación, Ola 4 abierta), E (cambio de plan, sin GO) y F (360°, en espera por D-CK-1) **no se commitean**. Push (F3) solo con orden expresa del CTO.

| # | Subagente | Encargo | Skills a leer antes de actuar | Entrega |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | §F1: arma el índice de cada commit en orden A → B → C → G → H | `verification-before-completion`, `turborepo-caching` | Commits locales y §F1 en el informe F0 |
| 2 | `gate-verifier` | §F1 regla 4: GO/NO-GO sobre cada índice antes de cada `git commit` | `iwana-test-evidence`, `verification-before-completion`, `turborepo-caching` | Evidencia con conteos por commit |
| 3 | `docs-governance` | §F2, después de los commits de documentos | — | Hallazgos con `archivo:línea` |

**Secuencia:** 1 y 2 alternan por commit (índice → gate → commit). 3 al final.
**Estado real al arrancar:** `main` = `origin/main` = `1ce4f263`; índice vacío. Nada se descarta, revierte ni limpia.
**Cierre de ola:** §F1 del informe con SHA, ola, rutas y evidencia por commit, más la lista de lo que queda sin commitear y por qué.

---

### Bloque copiar-pegar

===== 1 · plat-ops =====
Actúa como `plat-ops`. Lee `AGENTS.md`, `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` (§F1 y §Decisiones del CTO) y el informe F0 `docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`. Lee `verification-before-completion` y `turborepo-caching`. Arma el índice de cada commit en orden A → B → C → G → H; antes de cada `git commit` pide el GO de `gate-verifier` sobre ese índice. No commitees D, E ni F; no hagas push; no descartes, reviertas ni borres nada. Cierras añadiendo §F1 al informe F0 con SHA, ola, rutas y evidencia por commit, y lo que queda pendiente.

===== 2 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md` y la regla 4 y §F1 del mismo prompt. Lee `iwana-test-evidence`, `verification-before-completion` y `turborepo-caching`. Para cada índice: `git stash push --keep-index --include-untracked`, typecheck y suites de los paquetes tocados sin caché con conteo, `git stash pop`; si el pop no es limpio, `[BLOQUEO]` y paras. Das GO/NO-GO por commit. No corriges código.

===== 3 · docs-governance (al final) =====
Actúa como `docs-governance`. Lee `AGENTS.md` «Documentation Rules» y §F2 del mismo prompt. Solo lectura: revisa los commits de documentos de F1 y reporta hallazgos con `archivo:línea`.
