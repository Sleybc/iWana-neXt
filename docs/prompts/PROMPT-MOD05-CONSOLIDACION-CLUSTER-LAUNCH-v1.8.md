# LAUNCH — MOD05 · Consolidación conjunta con DT-3 · Ola 4 (C4e, commits)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §C4e · Sustituye a [v1.7](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.7.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:**
- C4d en GO el 2026-11-02 ([informe](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md) §C4d):
  - suites completas de los 4 paquetes;
  - 13 integraciones PG con 116 PASS y 0 omitidas;
  - E2E 8/8;
  - cobertura de ramas por servicio sobre la línea base;
  - auditorías en 0 bloqueantes.
- `contracts.service.ts` = `33e5cf71…`.
- G0 de la spec DT-3 v1.2 aprobado por el CTO el 2026-11-02.

**Bloqueos abiertos:** ninguno. Prohibidos el staging parcial, `git stash` y el push.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | §C4e, puntos 0–4 | `iwana-checkpoint-commit`, `verification-before-completion` | Plan §3 Q4; D-CK-2 |

**Estado real al arrancar:** `main` = `origin/main` = `6dbdda8a`; índice vacío; sin stash. Los snapshots de `%TEMP%` se conservan hasta G6.5.
**Cierre de ola:** cinco commits locales y §C4e en el informe. Sin push: F3 y G6.5 necesitan la orden del CTO.

---

### Bloque copiar-pegar

===== 1 · plat-ops (C4e) =====
Actúa como `plat-ops`. Lee `AGENTS.md` y §C4e de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` (incluido el punto 0). Lee `iwana-checkpoint-commit` y `verification-before-completion`. (0) Borra solo el esquema `tenant_plan_change_f0f328f25d1d4ae6a251d29566d0c800` de `dbiw`, tras comprobar nombre exacto, que no es `tenant_iwana` y que ninguna fila de `public.tenants` lo referencia. (1) Re-inventario de `git status --short` en cinco commits más D-CK-2 y ajenas; las dudosas, [BLOQUEO]. El commit 5 lleva la spec, el plan, el prompt, los lanzadores v1.0–v1.9 y los tres informes `PRIVACY-DT3-*`. El commit 4 incluye los lanzadores v1.0–v1.8 de la consolidación, la spec de ciclo v1.1 y el addendum U v1.1. Gobernanza, checkpoint y otras iniciativas quedan fuera. (2) Antes de cada commit, índice = árbol en sus archivos y SHA de `contracts.service.ts` = `33e5cf71…`; después, lint-staged sin cambios de contenido. (3) El cuerpo del commit 2 declara MOD05 (D, E, F, U, K1–K4) y DT-3 (B1–B3-H2), y lista los archivos mezclados. Escribe §C4e en el informe con SHA y rutas por commit y lo que queda sin commitear. Sin stash, sin staging parcial, sin push.
