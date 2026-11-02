# LAUNCH — MOD05 · Consolidación conjunta con DT-3 · Ola 4

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §Ola 4 · Sustituye a [v1.4](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.4.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:** opción A elegida por el usuario el 2026-11-01; C1b anulado ([dictamen](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md)). La última evidencia verde es el árbol combinado de B1-R de DT-3.
**Bloqueos abiertos:** Docker y Postgres caídos (los levanta el usuario antes de C4a); G0 de DT-3 pendiente (bloquea solo C4e).

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | §C4a, **primero** | `verification-before-completion`, `iwana-checkpoint-commit` | Manifest de snapshots |
| 2 | `boundary-reviewer` + `test-change-reviewer` | §C4b, **después de 1** | `architect-review` | AGENTS.md (boundaries) |
| 3 | `sr-qa` | §C4c (solo lectura) | `iwana-test-evidence` | — |
| — | Sesión DT-3 | Ola 2-R (B3-R → B3 → B4), **después de 1** | según su prompt | Spec DT-3 |
| 4 | `gate-verifier` | §C4d, **después de 2, 3 y B4** | `iwana-test-evidence`, `verification-before-completion` | Plan §3 Q3 + gates DT-3 |
| 5 | `plat-ops` | §C4e, **después de 4 y del G0 DT-3** | `iwana-checkpoint-commit` | Re-inventario |

**Paralelo:** 2 ∥ 3 ∥ DT-3, tras 1. Solo C4a y DT-3 editan el árbol, y nunca a la vez.
**Estado real al arrancar:** `main` = `origin/main` = `6dbdda8a`; índice vacío; sin stash; snapshots y patches en `%TEMP%\iwana-mod05-separate-snapshots-2026-11-01\` (no borrar).
**Cierre de ola:** cinco commits locales por archivo completo. Sin push.

---

### Bloque copiar-pegar

===== 1 · plat-ops (C4a) =====
Actúa como `plat-ops`. Lee `AGENTS.md` y §Ola 4 / §C4a de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`. Lee `verification-before-completion` e `iwana-checkpoint-commit`. Comprueba primero que Docker y Postgres en 5433 estén arriba; si no, [BLOQUEO]. Restaura B1: 8 archivos al original exacto de `mixed/`/`mixed-specs/` verificado por hash; en `subscribers.service.ts` adapta solo el hunk de la línea 95 para conservar `CrmQuoteReadPort`, guardando el patch adaptado aparte. Typecheck de api, db y shared en 0. Escribe §C4a en el informe. Sin stash, sin `git add`, sin commit.

===== 2 · boundary-reviewer + test-change-reviewer (C4b, después de 1) =====
Actúa como `boundary-reviewer` y luego como `test-change-reviewer`. Lee `AGENTS.md` y §C4b del mismo prompt. Solo lectura: revisa el cambio de boundary de C1b (`CrmQuoteReadPort`, adapter, módulos) y sus specs. Escribe §C4b en el informe. Un P0/P1 o un hallazgo C bloquea C4d.

===== 3 · sr-qa (C4c) =====
Actúa como `sr-qa`. Lee `AGENTS.md` y §C4c del mismo prompt. Solo lectura: clasifica el fallo de `TaskIntakeClient.spec.tsx` e identifica qué cambio lo provoca y a qué iniciativa pertenece. Escribe §C4c en el informe. No corrijas nada.
