# LAUNCH — SISTEMA · SKILLS-CONSOLIDACION · Ola 3

**Plan:** `docs/plans/2026-11-08-skills-consolidacion-orquestacion.md` v1.2 · **Definición:** `docs/informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md` v1.2 · **Spec:** no aplica
**Ola que lanza:** Ola 3 — B2-R y luego B3a, en la misma sesión · **Gates:** G0 ✅ · G1 ✅ · G2 abierto (se cierra con B2-R) · G3: parte de B3b ✅, parte de B3a pendiente
**Bloqueos abiertos:** ninguno. P4 (CI de `main` en rojo) solo bloquea B6

| # | Subagente / rol | Encargo | Skills a leer antes de editar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | AI-EM-ARCH (sesión principal; rol) | B2-R: informe §8.3; plan §5 B2-R | `skill-creator` | Informe v1.2 §8.3 (tabla de reglas descartadas) |
| 2 | AI-EM-ARCH (misma sesión, después de 1) | B3a: informe §5.2, §8.2 y §8.3; plan §5 B3a | `skill-creator`, `docs-architect` | Informe v1.2 §4 (disparadores) |

**Paralelo:** ninguno. B3a reescribe descripciones de skills que B2-R edita.
**Cierre de ola:** G2 y G3 (plan §6), con `pnpm sync:skills:check` en «OK: 52 skills».

---

### Bloque copiar-pegar

```text
===== SKILLS-CONSOLIDACION · Ola 3 · B2-R → B3a · AI-EM-ARCH (sesión principal) =====
Actúa como AI-EM-ARCH. Lee AGENTS.md, el informe docs/informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md (§4, §5.2, §8.2, §8.3) y el plan docs/plans/2026-11-08-skills-consolidacion-orquestacion.md (§5 B2-R y B3a, §6 G2 y G3).
Antes de editar, lee los SKILL.md de skill-creator y docs-architect (como documentación). Toma la línea base con pnpm sync:skills:check y pnpm sync:agents:check.
PRIMERO B2-R: restaura en la sucesora, con el texto literal de la absorbida (siguen en disco) y sin duplicar lo que ya esté, las reglas de la tabla de §8.3. Las tres de severidad media completas; las de severidad baja, en una línea cada una. Nada más. Cierra G2.
DESPUÉS B3a: retira las invariantes repetidas (D1) y reescribe en español, con «Usar cuando / No usar para» y unas 60 palabras como máximo, las descripciones de las 43 skills de §4 (no toques las 9 que salen en B4). Incluye las filas de §5.2 pendientes y la deuda asignada a B3a en §8.2 y §8.3. tokens.md de iwana-identity-ui-review conserva sus hex (los usa audit-ui.mjs): solo se declara copia derivada de globals.css.
Edita solo .agents/skills/<nombre>/SKILL.md y sus references/; tras cada tanda, pnpm sync:skills (no uses sed sin regenerar). Valida los 52 frontmatter con un parser YAML.
Fuera de alcance: borrar o archivar skills, INDEX, MANIFEST, README, AGENTS.md, .claude/agents/, packages/ui y cualquier código. Sin Prettier. En main, sin commit.
Si una invariante no se puede retirar sin perder una regla que solo vive en esa skill, déjala, justifícala y sigue; [BLOQUEO] solo si exige cambiar AGENTS.md.
Cierras cuando G2 y G3 se cumplen y sync:skills:check da «OK: 52 skills».
Informa: B2-R, regla por regla con su destino; B3a, descripción antes y después (palabras) e invariantes retiradas o justificadas por skill; salida de los dos sync:*:check; validación YAML; deuda nueva por severidad.
```
