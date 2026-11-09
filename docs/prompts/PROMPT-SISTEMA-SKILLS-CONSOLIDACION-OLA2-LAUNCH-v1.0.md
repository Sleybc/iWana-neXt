# LAUNCH — SISTEMA · SKILLS-CONSOLIDACION · Ola 2

**Plan:** `docs/plans/2026-11-08-skills-consolidacion-orquestacion.md` v1.1 · **Definición:** `docs/informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md` v1.1 · **Spec:** no aplica
**Ola que lanza:** Ola 2 — B2 (fusiones) ∥ B3b (inventario de `@iwana/ui`) · **Gates:** G0 ✅ · G1 ✅ (informe §8) · G2 y G3 no iniciados
**Bloqueos abiertos:** ninguno. P4 (CI de `main` en rojo) solo bloquea B6

| # | Subagente / rol | Encargo | Skills a leer antes de editar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | AI-EM-ARCH (sesión principal; rol) | B2: informe §5.1; plan §5 B2 | `skill-creator`, `writing-skills` | Informe v1.1 §4 y §5.1 |
| 2 | `ds-owner` | B3b: plan §5 B3b | `core-components`, `iwana-identity-ui-review` | Informe v1.1 §4.2 (`core-components` dueña de los tokens) |

**Paralelo:** 1 y 2 a la vez; no comparten archivos. `ds-owner` solo lee `iwana-identity-ui-review`, que edita B2.
**Cierre de ola:** G2 y la parte de B3b de G3 (plan §6), con `pnpm sync:skills:check` en «OK: 52 skills».

---

### Bloque copiar-pegar

```text
===== SKILLS-CONSOLIDACION · Ola 2 · B2 · AI-EM-ARCH (sesión principal) =====
Actúa como AI-EM-ARCH. Lee AGENTS.md, el informe docs/informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md (§4, §5.1, §8) y el plan docs/plans/2026-11-08-skills-consolidacion-orquestacion.md (§3, §5 B2, §6 G2).
Antes de editar, lee los SKILL.md de skill-creator y writing-skills (como documentación).
Toma la línea base con pnpm sync:skills:check y pnpm sync:agents:check.
Alcance: las 7 fusiones de §5.1 (typescript-expert ← typescript-pro; e2e-testing-patterns ← playwright-skill; frontend-dev-guidelines ← nextjs-app-router-patterns; iwana-identity-ui-review ← senior-ui-systems-designer; monorepo-architect ← turborepo-caching; executing-plans ← subagent-driven-development; skill-creator ← writing-skills), con los añadidos del plan §5 B2: descripción de la sucesora, executing-plans sin «main/master» ni commits del subagente, y la sección «Reglas del catálogo iWana» en skill-creator.
Fuera de alcance: editar o borrar las 7 absorbidas (siguen en disco hasta B4), core-components (es de B3b), INDEX, MANIFEST, AGENTS.md y cualquier código. Sin Prettier. En main, sin commit.
Si una sección única no tiene destino claro en §5.1, emite [BLOQUEO] con archivo:línea y para.
Cierras cuando G2 se cumple y sync:skills:check da «OK: 52 skills».
Informa, por fusión: secciones migradas (con destino) y descartadas (con motivo); archivos tocados; salida de los dos sync:*:check; deuda nueva por severidad.

===== SKILLS-CONSOLIDACION · Ola 2 · B3b · ds-owner =====
Actúa como ds-owner. Lee AGENTS.md, el informe docs/informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md (§2.1 D7 y §4.2) y el plan docs/plans/2026-11-08-skills-consolidacion-orquestacion.md (§5 B3b).
Antes de editar, lee los SKILL.md de core-components e iwana-identity-ui-review (como documentación).
Alcance: solo el cuerpo de .agents/skills/core-components/SKILL.md. Sustituye «Estado actual de @iwana/ui (Sprint 1)» por el inventario real de lo que exporta hoy packages/ui/src (index.ts, components/, hooks/, tokens/), y declara la skill dueña única de los tokens, citándolos desde packages/ui sin copiar valores.
Fuera de alcance: la descripción de core-components (es de B3a), cualquier otra skill y packages/ui. Sin Prettier. En main, sin commit.
Cierras cuando cada componente listado existe como exportación de packages/ui/src y ninguna exportación pública falta.
Informa: componentes añadidos, retirados y renombrados frente a la versión anterior; dónde viven los tokens; deuda nueva por severidad.
```
