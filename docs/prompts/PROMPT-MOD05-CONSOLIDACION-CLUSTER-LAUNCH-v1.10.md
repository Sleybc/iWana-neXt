# LAUNCH — MOD05 · Consolidación conjunta con DT-3 · F3 (commit de registro, push y G6.5)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §Ola 3 y §C4f · Sustituye a [v1.9](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.9.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:**
- C4f en GO: commit 6 `50231284`.
- `HEAD` exportado con `git archive` y verificado en verde:
  - typecheck y lint, 12 tareas;
  - shared 278 tests;
  - db 423 tests;
  - api 5.973 tests;
  - portal 3.435 tests.
- Las 26 rutas ajenas están confirmadas con `git grep` contra `HEAD`.

**Bloqueos abiertos:** el push solo se hace con la orden expresa del CTO.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | Commit 7 de registro, push y G6.5 | `iwana-checkpoint-commit`, `verification-before-completion` | Plan §3 G6.5 |

**Estado real al arrancar:** `main` = `50231284`, 6 commits por delante de `origin/main` (`6dbdda8a`); índice vacío; sin stash.
**Cierre de ola:** el CI de `main` en verde para el SHA publicado (G6.5) y §F3 en el informe.

---

### Bloque copiar-pegar

===== 1 · plat-ops (F3) =====
Actúa como `plat-ops`. Lee `AGENTS.md`, el plan §3 (G6.5) y `iwana-checkpoint-commit` y `verification-before-completion`. El CTO ordenó el push el día del lanzamiento. (1) Commit 7 por archivo completo, `docs(mod05): record C4e and C4f`, con solo estos 5 archivos: `docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`, `docs/plans/2026-10-31-mod05-consolidacion-cluster.md`, `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`, `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.9.md` y `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.10.md`; índice = árbol. (2) `git push origin main`, sin `--force`. (3) Espera el run de CI de `main` para ese SHA con `gh run list`/`gh run watch` y registra id, conclusión y jobs. Si falla, [BLOQUEO] con el log; no reviertas ni hagas force-push. (4) Escribe §F3 en el informe (puede quedar sin commitear). No toques las 26 ajenas ni D-CK-2. Sin stash ni staging parcial.
