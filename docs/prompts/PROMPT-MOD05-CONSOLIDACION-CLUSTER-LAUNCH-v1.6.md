# LAUNCH — MOD05 · Consolidación conjunta con DT-3 · Ola 4 (C4a-R)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §Ola 4 · Sustituye a [v1.5](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.5.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:** opción A elegida por el usuario el 2026-11-01; C1b anulado ([dictamen](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md)). La última evidencia verde es el árbol combinado de B1-R de DT-3.
**Bloqueos abiertos:** G0 de DT-3 pendiente (bloquea solo C4e). C4b y C4c cerrados (sin hallazgos; `TaskIntakeClient` es flaky de MOD11, ajeno).

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | §C4a-R, **primero** | `verification-before-completion`, `iwana-checkpoint-commit` | Manifest + `resolved-c4a/SHA256SUMS.txt` |
| — | Sesión DT-3 | Ola 2-R (B3-R → B3 → B4), **después de 1** | según su prompt | Spec DT-3 |
| 4 | `gate-verifier` | §C4d, **después de 2, 3 y B4** | `iwana-test-evidence`, `verification-before-completion` | Plan §3 Q3 + gates DT-3 |
| 5 | `plat-ops` | §C4e, **después de 4 y del G0 DT-3** | `iwana-checkpoint-commit` | Re-inventario |

**Secuencia:** C4a-R → aviso a la sesión DT-3 → B3-R, B3, B4 → C4d → G0 → C4e. Solo C4a-R y DT-3 editan el árbol, y nunca a la vez.
**Estado real al arrancar:** `main` = `origin/main` = `6dbdda8a`; índice vacío; sin stash; snapshots y patches en `%TEMP%\iwana-mod05-separate-snapshots-2026-11-01\` (no borrar).
**Cierre de ola:** cinco commits locales por archivo completo. Sin push.

---

### Bloque copiar-pegar

===== 1 · plat-ops (C4a-R) =====
Actúa como `plat-ops`. Lee `AGENTS.md` y §C4a-R de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`. Lee `verification-before-completion` e `iwana-checkpoint-commit`. Restaura por copia de archivo completo, sin `git apply`: 6 archivos de producción y 2 specs desde `mixed/` y `mixed-specs/`, y `subscribers.service.ts` desde `resolved-c4a/` (SHA-256 `cd2d946637125919d657185002a167b4903d22e95e37f369aa0d000bfac09167`). Verifica los 9 hashes, `prettier --check` de los 9, typecheck de api/db/shared con `--force` y suites unitarias completas de api y db sin caché con conteo real; si algo falla, [BLOQUEO] sin corregir. Escribe §C4a-R en el informe. No borres snapshots. Sin stash, sin `git add`, sin commit.
