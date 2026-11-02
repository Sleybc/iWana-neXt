# LAUNCH — MOD05 · Consolidación del clúster D + E + F + U · Ola 1 (K1 ∥ K2)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` v1.0 · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Ola que lanza:** Ola 1 — K1 ∥ K2 · **Gates verificados:** investigaciones cerradas (sin más corrupción; RF-LC-17 es de fixture); decisión del CTO del 2026-10-31: consolidar sin partir y documentar U ([addendum](../specs/2026-10-31-mod05-ficha-suscriptor-addendum-u.md)).
**Bloqueos abiertos:** ninguno. Prohibidos el staging parcial y `git stash`. Las Olas 2 y 3 se lanzan después.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §K1 | `test-driven-development`, `systematic-debugging`, `iwana-test-evidence`, `postgresql` | Plan E:32, spec E:56 |
| 2 | `fe-platform` | §K2, archivos del portal y e2e | `frontend-dev-guidelines` | Solo formato |
| 3 | `sr-backend` | §K2, archivos de api, shared y db, **después de 1** | `typescript-expert` | Solo formato |

**Paralelo:** 1 ∥ 2, sobre archivos disjuntos. 3 tras 1, porque comparten la API.
**Estado real al arrancar:** `main` = `origin/main` = `6dbdda8a`; índice vacío; sin stash; respaldos de R3-bis y R3-ter fuera del repo (no borrar).
**Cierre de ola:** RF-LC-17 y la prueba real de `CONTRACT_CHANGED` en verde, con 0 omisiones; formato aplicado y typecheck en 0. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend (K1) =====
Actúa como `sr-backend`. Lee `AGENTS.md` y §K1 de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`. Lee `test-driven-development`, `systematic-debugging`, `iwana-test-evidence` y `postgresql`. Corrige el fixture de RF-LC-17 leyendo el `updated_at` real de la fila y añade la prueba real de `CONTRACT_CHANGED` en `_transition`. No toques código de producción. Sin stash ni commit. Cierras con las integraciones de ciclo de vida y contratos con conteo real y 0 omisiones.

===== 2 · fe-platform (K2 portal) =====
Actúa como `fe-platform`. Lee `AGENTS.md` y §K2 del mismo prompt. Lee `frontend-dev-guidelines`. Aplica solo Prettier a los archivos del portal y e2e del clúster que no pasan `--list-different` (excluye `next-env.d.ts`) y verifica que el cambio sea solo de formato. Sin stash ni commit. Cierras con la lista de archivos y typecheck del portal en 0.

===== 3 · sr-backend (K2 api/shared/db, después de 1) =====
Actúa como `sr-backend`. Lee `AGENTS.md` y §K2 del mismo prompt. Lee `typescript-expert`. Aplica solo Prettier a los archivos de api, shared y db del clúster que no pasan `--list-different` y verifica que el cambio sea solo de formato. Sin stash ni commit. Cierras con typecheck de api, shared y db en 0.
