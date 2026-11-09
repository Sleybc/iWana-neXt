# LAUNCH — E2E · Capturas fuera de `docs/` salvo que se pidan

**Spec:** `docs/specs/2026-11-09-e2e-evidencias-fuera-de-docs.md` v1.0 · **Origen:** `docs/informes/INFORME-TRANSVERSAL-TIEMPOS-ENTREGA-v1.0.md` §7 P5
**Ola que lanza:** única, un solo agente de otra sesión · **Gates:** spec aprobada por el usuario el 2026-11-09
**Bloqueos abiertos:** ninguno. Si alguna de las 11 specs tiene cambios ajenos sin commitear al empezar, no la toques y repórtala.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-qa` | Spec §2 y §4 | `e2e-testing-patterns`, `iwana-test-evidence` |

**Cierre de ola:** spec §4 y commit local con rutas explícitas, sin push (ADR-107 D1 y D2). El G6.5 llega con el siguiente tren.
**Reglas:** `main` sin ramas, sin stash, sin `--no-verify`. No restaures, borres ni muevas los PNG del árbol (spec §3). No ejecutes `scripts/dev.mjs` ni mates procesos por nombre: usa los servidores de desarrollo que ya estén arriba.

```text
===== E2E EVIDENCIAS · sr-qa =====
Actúa como sr-qa. Lee AGENTS.md y la spec docs/specs/2026-11-09-e2e-evidencias-fuera-de-docs.md completa. Lee antes los SKILL.md de e2e-testing-patterns e iwana-test-evidence.
Comprueba con git status --porcelain e2e/tests package.json que las 11 specs de la spec §1, package.json y e2e/tests/helpers/ no tienen cambios ajenos. Si alguna los tiene, déjala fuera y repórtala.
1. Crea e2e/tests/helpers/evidence.ts (spec §2.1) y migra las 11 specs (§2.2 y §2.3). R3_EVIDENCIA pasa a E2E_EVIDENCIA.
2. Añade scripts/e2e-evidence-guard.test.mjs a test:tooling, con un caso que bloquea y otro que pasa (§2.4).
3. Verifica la spec §4: pnpm test:tooling con conteo; el git grep; web-audit-logs-historial y portal-shell-touch-a11y sin bandera (docs/ intacto y capturas en test-results/evidencia/) y con E2E_EVIDENCIA=1, ambos con conteo real. Después devuelve los PNG de docs/ al estado en que estaban al empezar: copia de respaldo fuera del repo antes de la corrida con bandera, sin git restore.
4. Lista los 28 PNG del árbol (spec §3) con su estado y tu recomendación. No los toques.
Entrega: diff; conteos; la salida del git grep; la lista de §3. Commit local solo si el usuario lo ordena. Sin push.
```
