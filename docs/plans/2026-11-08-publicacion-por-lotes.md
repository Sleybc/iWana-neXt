# Plan de orquestación — Publicación por lotes, ADR-107

**Versión:** 1.0
**Estado:** Aprobado. [ADR-107](../adrs/ADR-107-Publicacion-por-Lotes-y-G6.5-Asincrono.md) aprobado por el CTO el 2026-11-08
**Fecha:** 2026-11-08
**Emitido por:** AI-EM-ARCH
**Lanzador:** [PROMPT-TRANSVERSAL-PUBLICACION-LOTES-LAUNCH-v1.0](../prompts/PROMPT-TRANSVERSAL-PUBLICACION-LOTES-LAUNCH-v1.0.md)
**Alcance:** adoptar D1–D7 de ADR-107: commit por ola, push por tren, G6.5 asíncrono, sin commits de registro, checkpoint ligero y CI con filtro de documentación.

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-08 |
| --- | --- | --- |
| P0 | El CTO aprueba ADR-107 §6 | **Cerrada** el 2026-11-08, sin cambios |
| P1 | La consolidación de skills publicó su cambio sobre `.agents/skills/iwana-checkpoint-commit/SKILL.md`, `AGENTS.md` y `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` | **Abierta**: los tres tienen cambios sin commitear de otras olas |
| P2 | `.github/workflows/ci.yml` sin cambios en el árbol | **Cerrada**: limpio al 2026-11-08 |
| P3 | `main` en verde antes del primer tren que lleve la Ola 2 | Se comprueba con `gh run list --branch main --limit 1` al lanzar (D5) |

## 2. Olas

| Ola | Bloque | Depende de | Archivos |
| --- | --- | --- | --- |
| 1 | ADR, plan y launcher | — | el ADR-107, este plan, el launcher. **Hecha** el 2026-11-08, sin commit |
| 1b | Normas operativas | P0, P1 | Skill de checkpoint (paso 0 «checkpoint ligero», paso 7 «push solo por tren», entrega sin commit de G6.5), regla 8 del prompt de checkpoint y `AGENTS.md` (historial y una línea en «Gates Before Merge» que remita a ADR-107) |
| 2 | CI | P0, P2 | `.github/workflows/ci.yml` |
| 3 (opcional) | CI paralelo | Medición de una semana tras la Ola 2 | `.github/workflows/ci.yml` |

La Ola 1b y la Ola 2 son independientes entre sí y pueden ir en el mismo tren.

### Ola 2 — detalle para `plat-ops`

1. Añadir `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: false }` a nivel de workflow.
2. Añadir un job `changes` que compare con el SHA anterior del push (`github.event.before`) y publique `docs_only=true|false`.
   - `docs_only=true` solo si **todas** las rutas cambiadas están bajo `docs/` y **ninguna** la leen las pruebas.
   - Las rutas que leen las pruebas se obtienen con grep sobre `scripts/**/*.test.mjs`, `apps/**/*.spec.ts`, `packages/**/*.spec.ts` y `e2e/tests/**`. Medidas el 2026-11-08: `docs/specs/2026-10-26-mod13-interfaces-api.md` (`network.openapi-contract.spec.ts`) y `docs/specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md` (`z-layer-contract.structure.spec.ts`). Las de `docs/plans/` y `docs/prompts/` que aparecen en `scripts/claude-hooks.test.mjs` son fixtures, no lecturas reales: se verifica antes de excluirlas.
   - Ante cualquier duda, `docs_only=false`.
   - Un push que crea la rama o tiene `before` nulo cuenta como `docs_only=false`.
3. `adr-citations` corre siempre. `production-images`, `ci`, `execution-orders-e2e` y `e2e-portal` llevan `needs: changes` e `if: needs.changes.outputs.docs_only != 'true'`.
4. Actualizar el comentario de duración del job `ci` (hoy dice 10:33–15:36) con lo medido: 19–23 min en noviembre.

## 3. Matriz de dispatch

| Bloque | Subagente | Skills obligatorias | De apoyo | Descartadas |
| --- | --- | --- | --- | --- |
| Ola 1 | agente padre (AI-EM-ARCH) | `architecture-decision-records`, `docs-architect` | `docs-governance` como revisión de solo lectura | `brainstorming`: no hay comportamiento nuevo de producto |
| Ola 1b | agente padre (AI-EM-ARCH) | `skill-creator` (reglas de INDEX, MANIFEST y `sync:skills`), `docs-architect` | `docs-governance` | `writing-plans`: este plan ya existe |
| Ola 2 | `plat-ops` | `monorepo-architect` | `gate-verifier` para `test:tooling` y la validación del YAML | `docker-expert`: no toca imágenes · `iwana-test-evidence`: no cambia ninguna suite |
| Ola 3 | `plat-ops` | `monorepo-architect`, `iwana-test-evidence` | `gate-verifier` | — |

## 4. Gates

| Ola | G6 | G6.5 |
| --- | --- | --- |
| 1 / 1b | `pnpm audit:adr-citations` y `pnpm audit:doc-locations` con `BLOQUEANTE: 0`. En 1b, además `pnpm sync:skills:check` | El del tren que la lleve |
| 2 | `pnpm test:tooling` en verde y YAML válido | **Síncrono** (excepción D3: ola de CI). En el tren deben salir dos corridas: una de solo documentación, en la que corren únicamente `adr-citations` y `changes`, y una con código, en la que corren los seis jobs (los cinco de antes más `changes`). Van en **dos pushes separados**, porque la detección mira todo el rango del push. Se comprueba con `gh run view <id> --json jobs` |

**Norma operativa de la concurrencia (Ola 2):** GitHub deja como máximo una corrida en espera por grupo. Un tercer push mientras hay una corrida en curso y otra esperando cancela la que espera, y ese SHA se queda sin G6.5 (ADR-069). Por eso no se publica un tren nuevo mientras haya otro en curso y uno en espera.

## 5. Medición de la adopción

La línea base sale del ADR-107 §1: 45 commits en 8 días, 8–10 commits de solo registro de G6.5 y una ruta crítica de 20–24 min.

Una semana después de la Ola 2 se miden:
- corridas por día;
- minutos de espera síncrona por ola;
- commits de solo registro, cuya meta es 0;
- duración de las corridas de solo documentación.

Con ese resultado se decide la Ola 3.
