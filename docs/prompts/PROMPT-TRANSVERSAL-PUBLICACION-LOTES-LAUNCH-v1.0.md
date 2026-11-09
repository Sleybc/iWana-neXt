# LAUNCH — transversal · Publicación por lotes, ADR-107 · Ola 2 CI

**Plan:** `docs/plans/2026-11-08-publicacion-por-lotes.md` §2 · **ADR:** `docs/adrs/ADR-107-Publicacion-por-Lotes-y-G6.5-Asincrono.md`
**Ola que lanza:** Ola 2, un solo agente · **Precondiciones:** P0 cerrada (ADR-107 aprobado el 2026-11-08) y P2 (`ci.yml` limpio)
**Fuera de esta ola:** Ola 1b (skill, prompt de checkpoint y `AGENTS.md`), que espera a que la consolidación de skills publique.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `plat-ops` | Concurrencia y filtro de solo documentación en CI | `monorepo-architect` |

**Siguiente:** commit local de la ola → tren con orden del CTO → G6.5 síncrono (excepción D3). **Cierre:** dos corridas de prueba con los jobs esperados.
**Reglas:** `main` sin ramas, sin `--no-verify` ni `--force`, solo se toca `.github/workflows/ci.yml`, sin push sin orden.

```text
===== PUBLICACIÓN POR LOTES · Ola 2 · plat-ops =====
Actúa como plat-ops. Lee AGENTS.md, la D7 del ADR-107 y el plan docs/plans/2026-11-08-publicacion-por-lotes.md §2 «Ola 2 — detalle». Lee antes el SKILL.md de monorepo-architect.
Comprueba P2 con git status --porcelain .github/workflows/ci.yml (debe salir vacío) y P3 con gh run list --branch main --limit 1. Si alguno falla: [BLOQUEO].
1. Añade concurrency a nivel de workflow, sin cancelar corridas en curso.
2. Crea el job changes con la salida docs_only. Antes de fijar la lista de rutas de docs/ que leen las pruebas, haz el grep del plan y cita archivo:línea de cada lectura real. Distingue lecturas reales de fixtures. Ante la duda, docs_only=false.
3. Condiciona production-images, ci, execution-orders-e2e y e2e-portal a docs_only != 'true'. adr-citations corre siempre.
4. Actualiza el comentario de duración del job ci con 19–23 min, medido en noviembre de 2026.
No cambies pasos, umbrales ni gates existentes. No toques otros archivos.
Entrega: diff; pnpm test:tooling con conteo; la lista de rutas excluidas con su evidencia; y la propuesta de las dos corridas de prueba del tren (una solo de documentación y otra con código) con los jobs que deben aparecer en cada una. Commit local con rutas explícitas solo si el usuario lo ordena; push solo con orden del CTO.
```
