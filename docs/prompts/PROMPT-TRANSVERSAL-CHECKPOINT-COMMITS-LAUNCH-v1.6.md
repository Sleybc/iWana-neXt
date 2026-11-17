# LAUNCH — Transversal · Checkpoint de commits · F3 (push y G6.5)

**Encargo:** `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` §F3 · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Ola que lanza:** F3 · **Gates verificados:** F1 y F1b en GO (8 commits locales, auditorías en 0 bloqueantes); push ordenado por el CTO el 2026-10-31.
**Bloqueos abiertos:** D, E y F no viajan. Sin `--force`, `--no-verify`, rebase, merge ni revert.

| # | Subagente | Encargo | Skills a leer antes de actuar | Entrega |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | §F3 pasos 1 a 5 | `verification-before-completion` | Push, corrida de CI vigilada y §F3 en el informe |

**Estado real al arrancar:** `main` = `6dbdda8a`, 8 commits por delante de `origin/main` (`1ce4f263`); stash vacío; 132 rutas locales que no se publican.
**Cierre:** G6.5 en GO (CI de `main` en verde sobre `6dbdda8a`) o `[BLOQUEO]` con el job, el primer error y su ola.

---

### Bloque copiar-pegar

===== 1 · plat-ops =====
Actúa como `plat-ops`. Lee `AGENTS.md` y §F3 de `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`. Lee `verification-before-completion`. Verifica que `main` está en `6dbdda8a` y que `origin/main` no avanzó (si avanzó, `[BLOQUEO]`); haz `git push origin main` sin `--force` ni `--no-verify`; vigila con `gh run list --branch main` y `gh run watch` la corrida de `6dbdda8a` hasta su fin. Si falla, no corrijas ni reviertas: clasifica job, primer error y ola, y emite `[BLOQUEO]`. Cierras añadiendo §F3 al informe del checkpoint con SHA, corrida, veredicto de G6.5 y lo que sigue local.
