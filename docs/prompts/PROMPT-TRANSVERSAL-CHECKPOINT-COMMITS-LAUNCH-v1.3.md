# LAUNCH — Transversal · Checkpoint de commits · F1 reanudada (R1 → B → C → G → H)

**Encargo:** `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` §F1, §Decisiones del CTO y los dos incidentes · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Ola que lanza:** recuperación R1 y continuación de F1 · **Gates verificados:** A commiteada (`55e46e9a`); gate de B en GO; R1 autorizada por el CTO el 2026-10-31.
**Bloqueos abiertos:** D, E y F no se commitean. Sin push. **Regla 7:** nadie edita el árbol mientras corre F1.

| # | Subagente | Encargo | Skills a leer antes de actuar | Entrega |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | R1 y después los commits B → C → G → H | `verification-before-completion`, `turborepo-caching` | Cifras de R1, commits locales y §F1 en el informe F0 |
| 2 | `gate-verifier` | Regla 4 enmendada sobre cada índice de C, G y H | `iwana-test-evidence`, `verification-before-completion`, `turborepo-caching` | GO/NO-GO con conteos por commit |
| 3 | `docs-governance` | §F2 al final | — | Hallazgos con `archivo:línea` |

**Estado real al arrancar:** A commiteada; índice con 14 rutas de B; el árbol ya contiene todo el stash; `stash@{0}` = `checkpoint-B-rerun` (`3fa18ca2bae529e87929ee7a601ffbaab8e5cee9`) pendiente de guardar y descartar según R1.
**Cierre:** R1 verificada con cifras; B, C, G y H commiteadas o con su NO-GO explicado; §F1 en el informe F0.

---

### Bloque copiar-pegar

===== 1 · plat-ops =====
Actúa como `plat-ops`. Lee `AGENTS.md` y `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` (§F1, §Decisiones del CTO y §Segundo incidente). Lee `verification-before-completion` y `turborepo-caching`. Ejecuta R1 tal cual: `update-ref` a `refs/checkpoint/stash-B-rerun`, reverificación vacía, `git stash drop` y cifras; si la reverificación no sale vacía, `[BLOQUEO]` y paras. Luego commitea B con su gate ya en GO y sigue C → G → H pidiendo el GO de `gate-verifier` por índice. No commitees D, E ni F; sin push; nada más se descarta. Cierras con §F1 en el informe F0.

===== 2 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md` y la regla 4 enmendada del mismo prompt. Lee `iwana-test-evidence`, `verification-before-completion` y `turborepo-caching`. Para cada índice de C, G y H: stash con la exclusión de los dos `next-env.d.ts`, typecheck y suites sin caché con conteo, `git stash pop`; si no es limpio, `[BLOQUEO]` y paras. GO/NO-GO por commit. No corriges código.

===== 3 · docs-governance (al final) =====
Actúa como `docs-governance`. Lee `AGENTS.md` «Documentation Rules» y §F2 del mismo prompt. Solo lectura: revisa los commits de documentos de F1 y reporta hallazgos con `archivo:línea`.
