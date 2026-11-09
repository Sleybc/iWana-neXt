# LAUNCH — transversal · Publicación por lotes, ADR-107 · Ola 3 CI en jobs paralelos

**Plan:** `docs/plans/2026-11-08-publicacion-por-lotes.md` v1.1 §2 · **Spec:** `docs/specs/2026-11-09-plat-ops-ci-jobs-paralelos.md` v1.0
**Ola que lanza:** Ola 3, un solo agente de otra sesión · **Precondiciones:** spec §4. P1 (rojo de `d09397ee` clasificado y §10.3 de la spec de integración cerrado) y P2 (`main` en verde) **se comprueban al lanzar**
**Bloqueos abiertos:** si P1 o P2 no se cumplen, no se lanza.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `plat-ops` | Spec §2 y §3 sobre `.github/workflows/ci.yml` | `monorepo-architect`, `iwana-test-evidence` |

**Cierre de ola:** spec §3.1 en local y commit local. El push y el G6.5 son **síncronos** (ola de CI, ADR-107 D3) y salen con orden del usuario.
**Reglas:** `main` sin ramas, sin `--no-verify` ni `--force`, sin stash (aislamiento A o B de la skill `iwana-checkpoint-commit`). No cambies pasos, umbrales ni gates. No mates procesos por nombre.

```text
===== PUBLICACIÓN POR LOTES · Ola 3 · plat-ops =====
Actúa como plat-ops. Lee AGENTS.md, la spec docs/specs/2026-11-09-plat-ops-ci-jobs-paralelos.md completa y el plan docs/plans/2026-11-08-publicacion-por-lotes.md §2. Lee antes los SKILL.md de monorepo-architect e iwana-test-evidence.
Comprueba la spec §4:
- P1: el rojo de la corrida 42704957642 está clasificado y la spec 2026-11-09-plat-ops-ci-integracion-api-tiempo.md tiene cerrado su §10.3;
- P2: gh run list --branch main --limit 1 está en success;
- P3: git status --porcelain .github/workflows/ci.yml package.json sale vacío.
Si alguna falla: [BLOQUEO] y para.
1. Reparte el job «Lint + Typecheck + Build + Unit tests» en static, unit (matriz api / portal / resto) e integration según la spec §2, respetando sus seis restricciones. Mueve los pasos sin reescribirlos.
2. Divide por pata la verificación de cobertura (0 cached y denominador > 0, más su fila en el resumen).
3. Verifica en local: YAML válido, pnpm test:tooling con conteo y una simulación de cada pata de unit con turbo --filter --only y su conteo de suites y tests, comparado con la corrida 42678231774 (api 489, portal 347 y el resto del log).
Entrega: diff; conteos por pata frente a la línea base; YAML y tooling; propuesta de timeout-minutes; riesgos. Commit local con rutas explícitas solo si el usuario lo ordena. Sin push sin orden.
```
