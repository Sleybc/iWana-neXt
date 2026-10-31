# LAUNCH — Transversal · Checkpoint de commits · F2-bis (detalle de versionado)

**Encargo:** `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` §Resultado de F1 y Ola F1b, paso 1 · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Ola que lanza:** F2-bis, solo lectura · **Gates verificados:** commits locales A, B, C y G con GO; H en NO-GO; D-CK-3 y D-CK-4 resueltas por el CTO el 2026-10-31.
**Bloqueos abiertos:** nadie commitea ni edita el árbol en esta ola (regla 7). Los pasos 2 a 4 de F1b se lanzan después, con otro lanzador.

| # | Subagente | Encargo | Skills a leer antes de actuar | Entrega |
| --- | --- | --- | --- | --- |
| 1 | `docs-governance` | §F1b paso 1 (F2-bis) | — | §F2 en `docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` |

**Estado real al arrancar:** `main` 4 commits por delante de `origin/main` (A, B, C, G); 15 rutas de H staged; stash vacío; sin push.
**Cierre:** §F2 con cada hallazgo, `archivo:línea` y su corrección mínima; las líneas del runbook de MinIO señaladas sin reproducir valores.

---

### Bloque copiar-pegar

===== 1 · docs-governance =====
Actúa como `docs-governance`. Lee `AGENTS.md` «Documentation Rules», `.github/instructions/docs.instructions.md` y §Resultado de F1 y Ola F1b de `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`. Solo lectura sobre el código y el índice: no hagas `git add`, commit ni stash. Añade una §F2 al informe `docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` con cada hallazgo de versión/changelog en los documentos de B (`130a70ee`), C (`30b2fb01`) y G (`2b70e9d4`), las 15 rutas staged de H, `AGENTS.md` y los candidatos de D-def: `archivo:línea`, regla y corrección mínima. Incluye las líneas del runbook de MinIO de D-CK-4 sin reproducir sus valores. Para ahí.
