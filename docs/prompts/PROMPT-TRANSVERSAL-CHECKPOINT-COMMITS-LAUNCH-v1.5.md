# LAUNCH — Transversal · Checkpoint de commits · F1b (S → DH → BB → X)

**Encargo:** `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` §F1b · Correcciones aplicadas y secuencia final · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Ola que lanza:** F1b, cuatro commits documentales · **Gates verificados:** A, B, C y G commiteados; §F2 emitida; las 22 correcciones aplicadas por AI-EM-ARCH; D-CK-3 (con ajuste de secuencia) y D-CK-4 resueltas.
**Bloqueos abiertos:** D (código), E y F no se commitean. Sin push. **Regla 7:** nadie edita el árbol mientras corre la ola.

| # | Subagente | Encargo | Skills a leer antes de actuar | Entrega |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | Arma los índices S, DH, BB y X en orden | `verification-before-completion` | Commits locales y SHA en el informe |
| 2 | `gate-verifier` | Auditorías documentales sobre cada índice aislado (regla 4 enmendada) | `verification-before-completion` | GO/NO-GO con cifras por commit |

**Estado real al arrancar:** `main` 4 commits por delante de `origin/main`; 15 rutas de H staged; stash vacío.
**Cierre:** cuatro commits con GO, o `[BLOQUEO]` con los hallazgos; SHA y cifras en el informe; sin push.

---

### Bloque copiar-pegar

===== 1 · plat-ops =====
Actúa como `plat-ops`. Lee `AGENTS.md` y §F1b · Correcciones aplicadas y secuencia final de `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`. Lee `verification-before-completion`. Arma en orden los índices S, DH, BB y X con exactamente las rutas de la tabla; antes de cada `git commit` pide el GO de `gate-verifier`. No commitees código de D ni nada de E o F; sin push; no edites documentos ni descartes nada. Cierras con los SHA y las cifras en el informe del checkpoint (antes del commit X, para que entre en él).

===== 2 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md` y la regla 4 enmendada del mismo prompt. Lee `verification-before-completion`. Para cada índice: stash con la exclusión de los dos `next-env.d.ts`, `pnpm audit:adr-citations` y `pnpm audit:doc-locations` con cifras, `git stash pop`; si no es limpio, `[BLOQUEO]` y paras. GO solo con `BLOQUEANTE: 0` en ambas. No corriges documentos.
