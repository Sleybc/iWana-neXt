# LAUNCH — PLAT · Dependencias críticas · Remediación

**Plan:** `docs/plans/2026-10-18-plat-deps-criticas.md` v1.0 · **Encargo:** `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-v1.0.md` v1.0
**Orden:** filas 0 y 1 en paralelo (solo lectura); luego filas 2, 2c y 3 a 6 en serie · **Gates verificados:** G1 aprobado (2026-10-18) · G4 emitido (encargo y launcher)
**Estado al arrancar:** `main` en `d9018071`, sin cambios de la fase. WIP de MOD05 sin commitear: no tocar ni commitear.
**Bloqueos abiertos:** ninguno. G1 aprobado por el CTO el 2026-10-18 (D1-A, D2-A, D3-A y D4-A; plan §1).

| # | Subagente | Encargo (bloque) | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 0 | `gate-verifier` | B0 línea base | `iwana-test-evidence`, `verification-before-completion` | — |
| 1 | `sec-eng` | B1 triaje y overrides (solo lectura) | `security-auditor`, `codebase-cleanup-deps-audit` | plan §2.2, §3 |
| 1 | `fe-platform` | B1b factibilidad Next (solo lectura) | `nextjs-app-router-patterns`, `frontend-dev-guidelines` | plan §3.3 |
| 2 | `plat-ops` | B2 + B3 manifiestos, overrides, lock y paso CI | `codebase-cleanup-deps-audit`, `monorepo-architect` | plan §3 |
| 2c | `plat-ops` | B2c configuración de Next en portal y web (D4-A) | `nextjs-app-router-patterns`, `architecture-decision-records` | plan §3.3, ADR-096 (propuesto) |
| 3 | `fe-platform` | B4 build y dev portal/web | `nextjs-app-router-patterns`, `frontend-dev-guidelines` | plan §4.1 |
| 4 | `gate-verifier` | B5 gates con conteo real | `iwana-test-evidence`, `verification-before-completion` | plan §4.1 |
| 5 | `sec-eng` | B6 dictamen final (solo lectura) | `security-auditor`, `backend-security-coder` | plan §6 |
| 6 | `docs-governance` | B7 informe y auditoría documental previa al commit | `iwana-cierre-fase`, `docs-architect` | plan §8 |

**Paralelo:** filas 0 y 1 (ambas) a la vez; son solo lectura. Después, 2 → 2c → 3 → 4 → 5 → 6 en serie: un solo escritor y builds no simultáneos.
**Cierre de ola:** G5 con `Cached: 0` y conteos reales; `pnpm audit --prod --audit-level critical` con código 0; dictámenes GO; informe en `docs/informes/`.
**Fuera de la ola:** push y G6.5 solo tras G5/G6 y con confirmación del CTO en ese momento (D3-A).

### Bloque copiar-pegar

> Actúa como ejecutor de la fase PLAT · Dependencias críticas y padre de consolidación.
> Lee `AGENTS.md`, el plan y el encargo indicados arriba. Antes de cualquier cambio, verifica en el plan §1 que el CTO aprobó D1, D2 y D3; si no, detente y no ejecutes nada.
> Despacha las filas de la tabla en ese orden, con el subagente de cada fila, un escritor a la vez, sobre `main` y sin ramas, worktrees ni stash.
> Cada gate se entrega con comando, código de salida y las líneas `Cached:` y `Tests:` literales. Un verde sin esas líneas no es evidencia.
> Commit solo con la lista de §8 del plan. Push y G6.5 solo con confirmación explícita del CTO.
