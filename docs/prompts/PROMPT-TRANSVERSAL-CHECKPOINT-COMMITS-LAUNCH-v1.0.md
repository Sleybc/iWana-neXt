# LAUNCH — Transversal · Checkpoint de commits · Ola F0

**Encargo:** `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` v1.0 · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Ola que lanza:** F0, inventario y propuesta, solo lectura · **Gates verificados:** no aplica; F0 no modifica el repositorio.
**Bloqueos abiertos:** F1 no se despacha hasta que el CTO responda D-CK-1 y D-CK-2 sobre el informe F0. F3 (push) solo con orden expresa.

| # | Subagente | Encargo | Skills a leer antes de actuar | Entrega |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` §F0 | `verification-before-completion`, `docs-architect` | `docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` |

**Estado real al arrancar:** `main` = `origin/main` = `1ce4f263`; 220 rutas sin commitear; índice vacío. Nada se descarta, revierte ni limpia.
**Cierre de ola:** informe F0 con tabla ruta → ola → gate → mezclada, orden propuesto, exclusiones y D-CK-1/D-CK-2 preparadas para el CTO.

---

### Bloque copiar-pegar

===== 1 · plat-ops =====
Actúa como `plat-ops`. Lee `AGENTS.md` y tu encargo §F0 de `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`. Lee los `SKILL.md` de `verification-before-completion` y `docs-architect` como documentación. Solo lectura: no hagas `git add`, commit, stash, checkout, clean ni borres nada. Verifica el estado de gate de cada ola en su fuente, no en la memoria. Cierras al entregar `docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` (verifica antes que la ruta esté libre) con la tabla ruta → ola → gate → mezclada, el orden de commits propuesto, las exclusiones y D-CK-1 y D-CK-2 listas para el CTO. Para ahí.
