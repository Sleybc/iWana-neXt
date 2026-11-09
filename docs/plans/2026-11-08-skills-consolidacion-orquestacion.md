# Plan de orquestación — Consolidación del catálogo de skills (52 → 43)

**Versión:** 1.4
**Estado:** Aprobado. G0 el 2026-11-08; Olas 1 a 5 ejecutadas (G1 a G5 ✅, informe §8.5); B6 listo
**Cambio v1.0 → v1.1 (2026-11-08):** G0 y G1 cerrados (informe §8); B3b deja de depender de B2 y sube a la Ola 2; la deuda de B1 entra en B2; el lanzamiento pasa a la Ola 2
**Cambio v1.1 → v1.2 (2026-11-08):** registro de la Ola 2 (informe §8.3); nuevo bloque B2-R, que restaura tres reglas únicas perdidas en el recorte y abre la Ola 3 antes de B3a; B3a recibe la deuda de la Ola 2; B4 retira los auxiliares npm de `playwright-skill`
**Cambio v1.2 → v1.3 (2026-11-08):** G2 y G3 cerrados (informe §8.4); B4 recibe el inventario de referencias vivas y la deuda de `database-migration`; G5 admite las líneas de procedencia
**Cambio v1.3 → v1.4 (2026-11-09):** G4 y G5 cerrados tras B4-R (informe §8.5); P4 cerrada con CI verde
**Fecha:** 2026-11-09
**Emitido por:** AI-EM-ARCH
**Definición:** [INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0](../informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md) v1.1 · **Lanzadores:** [Ola 1](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-LAUNCH-v1.0.md) (cerrada) · [Ola 2](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA2-LAUNCH-v1.0.md) (ejecutada) · [Ola 3](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA3-LAUNCH-v1.0.md) (ejecutada) · [Ola 4](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA4-LAUNCH-v1.0.md)

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-08 |
| --- | --- | --- |
| P1 | G0: el CTO resuelve G0-1 a G0-4 (informe §6) | **Cerrada** el 2026-11-08: aprobación en bloque; rigen las recomendaciones de §6 (informe §8.1) |
| P2 | Nadie en vuelo sobre `.agents/`, `.claude/agents/`, `AGENTS.md`, `.github/`, `.opencode/`, `.codex/` | **Cerrada.** `git status` solo muestra `.claude/launch.json` sin seguimiento, ajeno. Se vuelve a comprobar al lanzar |
| P3 | Línea base de sincronización | Se toma al lanzar B1: `pnpm sync:skills:check` y `pnpm sync:agents:check` |
| P4 | CI de `main` en verde | **Cerrada** el 2026-11-09: `CI` y `E2E Web Admin Smoke` en verde sobre `7926ba9b` (run 42556844542) |

## 2. Superficie

| Zona | Archivos |
| --- | --- |
| Skills que se refactorizan | 16 `SKILL.md` del informe §5.2 |
| Skills sucesoras | 7: `typescript-expert`, `e2e-testing-patterns`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `monorepo-architect`, `executing-plans`, `skill-creator` (más sus `references/`) |
| Skills que salen | 9 directorios del informe §5.1 |
| Gobierno del catálogo | `.agents/skills/INDEX.md`, `MANIFEST.json`, `README.md` |
| Superficies externas | `AGENTS.md` → Skills Dispatch; `.claude/agents/fe-platform.md`; `.github/instructions/frontend.instructions.md` |
| Generados (no se editan a mano) | `.claude/skills/*` (`pnpm sync:skills`); `.opencode/agents/`, `.codex/agents/` (`pnpm sync:agents`) |
| Historial | Adenda en [INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0](../informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md) |

No se reescriben `docs/plans/` ni `docs/prompts/` históricos: la tabla «Skills fusionadas → sucesora» de INDEX v1.9 resuelve sus referencias.

## 3. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · correcciones de ruteo sin renombrar | AI-EM-ARCH (sesión principal) | P1–P3 | `brainstorming`, `database-migration`, `postgresql`, `iwana-tenant-migration` (si G0-3), `verification-before-completion`, `requesting-code-review`, `dispatching-parallel-agents`; en `executing-plans` y `subagent-driven-development`, solo la sub-skill obligatoria; borrar `ui-ux-pro-max/scripts/__pycache__/` |
| B2 · fusiones | AI-EM-ARCH | B1 | Las 7 sucesoras y sus `references/`; las 7 absorbidas quedan en disco hasta B4 |
| B2-R · restauración de reglas únicas | AI-EM-ARCH | B2 | `e2e-testing-patterns`, `frontend-dev-guidelines`, `executing-plans`, `monorepo-architect`, `iwana-identity-ui-review/references/direccion-visual.md` (informe §8.3) |
| B3a · deduplicación y descripciones | AI-EM-ARCH | B2-R, B3b | Invariantes → cita a `AGENTS.md`; descripciones «Usar cuando / No usar para» en las 43; `testing-patterns`, `docs-architect`, `tailwind-patterns`, `nestjs-expert` y las 4 de seguridad |
| B3b · inventario de `@iwana/ui` | `ds-owner` | G0 | Solo el cuerpo de `core-components/SKILL.md`, contrastado con `packages/ui/src`. La descripción es de B3a |
| B4 · retiro y superficies | AI-EM-ARCH | B3a, B3b | Borrar las 7 absorbidas y `finishing-a-development-branch` (si G0-2); retirar `e2e-testing-patterns/references/playwright-skill/{run.js,package.json,lib/}`; `ui-ux-pro-max` a hold (si G0-1); INDEX/MANIFEST/README v1.9; `AGENTS.md`; `fe-platform.md`; `frontend.instructions.md`; `pnpm sync:skills`; `pnpm sync:agents` |
| B5 · verificación | `docs-governance` + AI-EM-ARCH | B4 | Solo lectura (§6, G5) |
| B6 · publicación | AI-EM-ARCH | B5, P4 | Commit propio con lista explícita de rutas; push; G6.5 |

**Olas:** 1 = B1 (cerrada); 2 = B2 ∥ B3b (ejecutada); 3 = B2-R → B3a, en la misma sesión y en ese orden; 4 = B4; 5 = B5; 6 = B6. B2 y B3b corren en paralelo porque no comparten archivos: ninguna fusión toca `core-components`, y B3b solo **lee** `iwana-identity-ui-review`, que B2 edita. B3a va después de B2 y de B3b, porque reescribe las descripciones de las 43, incluidas las de las sucesoras y la de `core-components`. B4 retira lo que B2 absorbió.

**Ruta crítica:** G0 → B1 → B2 → B2-R → B3a → B4 → B5 → P4 → B6 → G6.5. B3b va fuera de la ruta crítica.

## 4. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `writing-skills`, `skill-creator` | `iwana-checkpoint-commit` (solo para leer su alcance al redirigir la sub-skill de cierre) | `brainstorming` (la definición ya está aprobada en G0); skills de código (no se toca código) |
| B2 | `skill-creator`, `writing-skills` (todavía en disco) | Las 7 absorbidas, leídas como fuente de lo que se migra | `ui-ux-pro-max` (se archiva, no se fusiona) |
| B2-R | `skill-creator` | Las absorbidas `playwright-skill`, `nextjs-app-router-patterns`, `subagent-driven-development`, `turborepo-caching` y `senior-ui-systems-designer`, como fuente literal | — |
| B3a | `skill-creator`, `docs-architect` | `system-vocabulary-review` (si una descripción expone términos internos al usuario) | `architect-review` (no cambia arquitectura) |
| B3b `ds-owner` | `core-components`, `iwana-identity-ui-review` | `tailwind-patterns` (si un componente expone variantes CVA) | `ui-ux-pro-max` (se archiva) |
| B4 | `docs-architect` | `iwana-checkpoint-commit` (no se usa aún: solo se prepara la lista de rutas) | `finishing-a-development-branch` (se da de baja) |
| B5 `docs-governance` | — (verificador auxiliar, sin skills) | — | `gate-verifier` (no hay código ni suites que correr) |
| B6 | `iwana-checkpoint-commit` | — | — |

Skills y subagentes verificados en disco el 2026-11-08. Claude Code **lee** los `SKILL.md` como documentación antes de editar; no los invoca como tool.

## 5. Encargos

El detalle por skill está en el informe §5. Trabajo en `main`, sin ramas, sin stash y sin commit hasta B6. Sin Prettier en `docs/`, `AGENTS.md`, `.agents/` ni `.claude/agents/`. No se editan a mano los generados. `[BLOQUEO]` si un cambio exige alterar una regla de `AGENTS.md` fuera de Skills Dispatch.

- **B1.** Cambios de ruteo de §5.2 que no renombran nada, más las dos acciones previas de §5.4. No se borra contenido de ninguna skill: solo se acota el disparador o se sustituye por una remisión. La caché `__pycache__/` es generada y no cuenta como contenido.
- **B2.** Por cada fusión: copiar a la sucesora lo que el informe §5.1 lista; lo demás se descarta por duplicado. La sucesora conserva su nombre y su `name:` de frontmatter. Reportar, por fusión, las secciones migradas y las descartadas. Además:
  - **Descripción de la sucesora.** Se amplía solo lo necesario para cubrir el alcance absorbido, en español y con el formato «Usar cuando / No usar para». B3a la revisa con las demás.
  - **`executing-plans` fusionada.** Sin «Never start implementation on main/master» (el repo trabaja en `main`); el subagente implementador no commitea: implementa, prueba y se autorrevisa; el commit es de `iwana-checkpoint-commit` y solo a pedido del usuario (deuda de B1, informe §8.2).
  - **`skill-creator` fusionada.** Sección «Reglas del catálogo iWana»: se edita solo `.agents/skills/<nombre>/SKILL.md`; `.claude/skills/` es generado (`pnpm sync:skills`, hook `sync-surfaces.mjs`); frontmatter con `name` y `description`; toda alta, baja o fusión actualiza INDEX, MANIFEST, README y `INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`, y pasa la política de admisión estricta de INDEX.
  - **Absorbidas.** No se editan ni se borran: siguen en disco hasta B4.
- **B2-R.** Restaurar en la sucesora, con el texto de la absorbida y sin duplicar lo que ya esté, las reglas de la tabla del informe §8.3: las tres de severidad media completas y las de severidad baja en una línea cada una. Nada más.
- **B3a.** Retirar invariantes repetidas (D1) y reescribir las 43 descripciones con el formato de §4.1 regla 5, en español. Una descripción no supera unas 60 palabras. Las 9 skills que salen en B4 no se tocan. Incluye las filas de §5.2 que B1 no cubrió (`testing-patterns`, las cuatro de seguridad, `nestjs-expert`, `tailwind-patterns`, `docs-architect`, descripción de `core-components`) y la deuda que el informe §8.2 y §8.3 asigna a B3a: idioma de las descripciones de B1, restos de `database-migration` (líneas 11 y 148), descripción de `iwana-identity-ui-review`, `references/tokens.md` declarado copia derivada de `globals.css`, y el ejemplo de `turbo.json` de `monorepo-architect` sustituido por una remisión al real.
- **B3b.** Inventario real de `@iwana/ui` (componentes exportados hoy por `packages/ui/src`), que sustituye la sección «Estado actual de @iwana/ui (Sprint 1)», y declarar `core-components` dueña única de los tokens, citándolos desde su fuente en `packages/ui` sin copiar valores. No toca la descripción ni otras skills.
- **B4.** Retirar del disco las 7 absorbidas, `finishing-a-development-branch` y `ui-ux-pro-max` (a hold: sale del disco y figura en «Skills en hold» de INDEX con su procedencia upstream), y `e2e-testing-patterns/references/playwright-skill/{run.js,package.json,lib/}`. Sustituir las referencias funcionales de la tabla del informe §8.4 (incluidas `writing-plans`, `AGENTS.md`, `fe-platform.md`, `frontend.instructions.md`, `skills-lock.json` e INDEX); las líneas de procedencia («migrado de…») se conservan. Corregir `database-migration` líneas 38 y 44 según `AGENTS.md:105`. INDEX v1.9 con listas de 43, tabla «Skills fusionadas → sucesora», hold y bajas; MANIFEST v1.9 (`coreCount` 43, `specializedOnDemand` reconciliado con INDEX); README. Adenda «Estado posterior» en `INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`. Regenerar con `pnpm sync:skills` y `pnpm sync:agents`.

## 6. Gates

| Gate | Condición |
| --- | --- |
| G0 | **Cerrado** el 2026-11-08: aprobación en bloque, recomendaciones de §6 (informe §8.1) |
| G1 | **✅ 2026-11-08** (informe §8.2). B1: ninguna skill exige `finishing-a-development-branch`; `brainstorming` no commitea; `database-migration` remite a `iwana-tenant-migration` |
| G2 | **✅ 2026-11-08** (informe §8.4). Se cerró con B2-R, cuando `e2e-testing-patterns` tiene «Datos y seguridad», `frontend-dev-guidelines` la regla de tenant y permisos, y `executing-plans` la prohibición de implementadores en paralelo. B2: por cada fusión, lista de secciones migradas y descartadas; ninguna sección única queda sin destino; `executing-plans` sin «main/master» ni commits del subagente; `skill-creator` con «Reglas del catálogo iWana»; `pnpm sync:skills:check` «OK: 52 skills» |
| G3 | **✅ 2026-11-08** (informe §8.3 y §8.4). B3b (Ola 2): inventario de `core-components` = las 138 exportaciones de `packages/ui/src` (informe §8.3). B3a (Ola 3): cada skill que `grep -il 'multi-tenant por schema\|zero-trust pii'` devuelva trata la tenancy o la PII como tema propio (p. ej. `postgresql`, `security-auditor`), y el informe de B3a lo justifica una por una; las 43 descripciones parsean como YAML, están en español y no pasan de unas 60 palabras |
| G4 | B4: 43 directorios en `.agents/skills/` = `coreCount` = 43 punteros en `.claude/skills/`; `pnpm sync:skills:check` y `pnpm sync:agents:check` en verde; `skills-lock.json` sin entradas de skills retiradas |
| G5 | B5: `docs-governance` sin bloqueantes; grep de los 9 nombres retirados vacío fuera de `docs/informes/`, `docs/plans/`, `docs/prompts/`, la tabla de sucesión, las filas de hold y bajas de INDEX y las líneas de procedencia («migrado de…»); tabla intención → skill del informe §4 comparada con las 43 descripciones, una sola primaria por intención |
| G6.5 | CI de `main` en verde sobre el SHA publicado |

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una fusión pierde contenido único | G2 exige la lista de secciones migradas y descartadas por fusión |
| Un plan vigente (p. ej. la etapa 1 del actor mínimo en puertos, que cita `typescript-pro` y `playwright-skill`) se lanza tras B4 | La tabla de sucesión de INDEX v1.9 redirige; el lanzador de cada ola verifica skills contra disco |
| `ds-owner` y AI-EM-ARCH editan `core-components` a la vez | B3b (Ola 2) es dueño del cuerpo; B3a (Ola 3) solo toca su descripción |
| Se publica mezclado con privacidad | B6 con `iwana-checkpoint-commit` y lista explícita de rutas |

## Lanzamiento

El archivo [PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA4-LAUNCH-v1.0](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA4-LAUNCH-v1.0.md) es la fuente y **prevalece si divergen**. Lanza la Ola 4 (B4). Olas anteriores: [Ola 1](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-LAUNCH-v1.0.md) (G1 ✅), [Ola 2](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA2-LAUNCH-v1.0.md) y [Ola 3](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA3-LAUNCH-v1.0.md) (G2 y G3 ✅). Cada ola siguiente se lanza con su propio archivo cuando cierra su gate.

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
