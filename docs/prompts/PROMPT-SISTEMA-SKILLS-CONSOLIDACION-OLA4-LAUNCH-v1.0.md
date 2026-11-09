# LAUNCH — SISTEMA · SKILLS-CONSOLIDACION · Ola 4

**Plan:** `docs/plans/2026-11-08-skills-consolidacion-orquestacion.md` v1.3 · **Definición:** `docs/informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md` v1.3 · **Spec:** no aplica
**Ola que lanza:** Ola 4 — B4, retiro y superficies · **Gates:** G0 ✅ · G1 ✅ · G2 ✅ · G3 ✅ · G4 no iniciado
**Bloqueos abiertos:** ninguno. P4 (CI de `main` en rojo) solo bloquea B6

| # | Subagente / rol | Encargo | Skills a leer antes de editar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | AI-EM-ARCH (sesión principal; rol) | Plan §5 B4; informe §8.4 (referencias vivas y deuda) | `skill-creator`, `docs-architect` | Informe v1.3 §4 (catálogo de 43) y §5.1 (sucesoras) |

**Paralelo:** ninguno. El encargo de tokens de `packages/ui` puede correr a la vez: no toca `.agents/`, `AGENTS.md` ni `.claude/agents/`.
**Cierre de ola:** G4 del plan §6. No hay prompt de ejecución aparte: el encargo es el plan §5 B4.

---

### Bloque copiar-pegar

```text
===== SKILLS-CONSOLIDACION · Ola 4 · B4 · AI-EM-ARCH (sesión principal) =====
Actúa como AI-EM-ARCH. Lee AGENTS.md, el informe docs/informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md (§4, §5.1, §5.3, §8.1 y la tabla de referencias vivas de §8.4) y el plan docs/plans/2026-11-08-skills-consolidacion-orquestacion.md (§5 B4, §6 G4).
Antes de editar, lee los SKILL.md de skill-creator (sección «Reglas del catálogo iWana») y docs-architect (como documentación). Toma la línea base con pnpm sync:skills:check y pnpm sync:agents:check.
Alcance, en este orden: 1) sustituye las referencias funcionales de la tabla de §8.4 y corrige database-migration líneas 38 y 44 según AGENTS.md:105; 2) retira del disco las 7 absorbidas, finishing-a-development-branch, ui-ux-pro-max y e2e-testing-patterns/references/playwright-skill/{run.js,package.json,lib/}; 3) INDEX y MANIFEST v1.9, README, skills-lock.json y adenda en INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md, como dice el plan §5 B4; 4) pnpm sync:skills y pnpm sync:agents.
Las líneas de procedencia («migrado de…») se conservan. La procedencia upstream de ui-ux-pro-max pasa a su fila de hold en INDEX.
Fuera de alcance: cambiar el contenido de las 43 más allá de esas referencias, packages/ui y cualquier código. Sin Prettier en docs/, AGENTS.md, .agents/ ni .claude/agents/. No edites a mano .claude/skills/, .opencode/agents/ ni .codex/agents/. En main, sin commit.
Si una referencia funcional no tiene sucesora clara, emite [BLOQUEO] con archivo:línea y para.
Cierras cuando G4 se cumple (plan §6): 43 = coreCount = punteros, los dos sync:*:check en verde y skills-lock.json sin skills retiradas.
Informa: archivos borrados y editados; diff de AGENTS.md → Skills Dispatch; tabla de sucesión de INDEX; salida de los dos sync:*:check; grep de los 9 nombres con lo que queda y por qué; deuda nueva por severidad.
```
