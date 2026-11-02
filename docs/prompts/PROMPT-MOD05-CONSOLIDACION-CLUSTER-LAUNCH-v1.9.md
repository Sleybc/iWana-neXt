# LAUNCH — MOD05 · Consolidación conjunta con DT-3 · Ola 4 (C4f)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §C4f · Sustituye a [v1.8](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.8.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:** C4e hizo cinco commits locales (`78d3e4fb` a `ee7f89f3`). AI-EM-ARCH comprobó que `HEAD` depende de `timezone` en `SettingsPriorityTenantSnapshot`, un cambio que sigue sin commitear.
**Bloqueos abiertos:** el push queda prohibido hasta que C4f esté en GO y lo ordene el CTO.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | §C4f | `iwana-checkpoint-commit`, `verification-before-completion`, `iwana-test-evidence` | Plan §3 Q4 |

**Estado real al arrancar:** `main` = `ee7f89f3`, 5 commits por delante de `origin/main` (`6dbdda8a`); índice vacío; sin stash.
**Cierre de ola:** commit 6 hecho y `HEAD` exportado en verde. Sin push.

---

### Bloque copiar-pegar

===== 1 · plat-ops (C4f) =====
Actúa como `plat-ops`. Lee `AGENTS.md` y §C4f de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`. Lee `iwana-checkpoint-commit`, `verification-before-completion` e `iwana-test-evidence`. (1) Commit 6 por archivo completo con los 5 archivos de settings-priority (port, adapter y 3 specs), comprobando que el índice coincide con el árbol y que el diff es solo `timezone`. (2) Exporta `HEAD` con `git archive` a un directorio nuevo en `%TEMP%`, `pnpm install --frozen-lockfile --prefer-offline`, y ahí corre typecheck, lint y suites unitarias completas de shared, db, api y portal sin caché con conteo real. Sin `git worktree` ni ramas. (3) Re-clasifica las ajenas con `git grep` contra `HEAD`. Si aparece otra dependencia, [BLOQUEO]. Escribe §C4f en el informe. Sin stash, sin staging parcial, sin push.
