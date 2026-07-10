# iWana neXt — AI Bootstrap

GitHub Copilot, OpenCode, Codex y Claude Code son las IAs activas del workspace. `AGENTS.md` es la fuente maestra de gobernanza, arquitectura, comandos, gotchas, skills y entregables.

Esta es una superficie agnostica de proveedor: cualquier IA que arranque en el workspace debe leer `AGENTS.md` antes de actuar y debe aplicar el mismo flujo, los mismos recordsatorios criticos y la misma trazabilidad documental.

## Orden de lectura

1. `AGENTS.md`
2. `docs/prds/Stack_Tecnologico.md`
3. PRD/HLD/ADR vigente del modulo afectado
4. Instrucciones contextuales en `.github/instructions/` cuando apliquen por path
5. Skills activas en `.agents/skills/` cuando la tarea coincida con su descripcion

Si dos artefactos chocan en multi-tenancy, seguridad, boundaries o stack, no sintetices por conveniencia: documenta el conflicto y escala.

## Superficies activas

- `.github/copilot-instructions.md` — este archivo, leido por Copilot automaticamente.
- `.opencode/opencode.json` — declaracion explicita de OpenCode: `instructions`, `skills.paths` y `mcp`.
- `CLAUDE.md` — bootstrap propio de Claude Code, leido automaticamente por esa CLI; reactivado el 2026-07-09.
- `.github/instructions/*.instructions.md` — reglas contextuales por path, complementan a `AGENTS.md` en su `applyTo`.
- `.github/prompts/*.prompt.md` — prompts operativos reutilizables, disponibles para cualquier asistente compatible.
- `.agents/skills/` — catalogo activo de skills; `INDEX.md` y `MANIFEST.json` son la fuente de verdad del catalogo.

## Flujo activo

- Usa siempre `pnpm`; no uses `npm` ni `yarn` para flujos del repo.
- Las reglas por archivo viven en `.github/instructions/*.instructions.md` y son complementos, no fuentes maestras.
- Los prompts operativos viven en `.github/prompts/`.
- OpenCode, Codex y Claude Code quedan en paridad documental con Copilot; los cuatro leen `AGENTS.md` y este bootstrap.
- Las skills del repo viven en `.agents/skills/` y deben reutilizarse desde cualquier cliente que soporte ese catalogo; no dupliques reglas en un sistema paralelo de agentes. Claude Code, al no tener `skills.paths`, las consume via `CLAUDE.md` leyendo el `SKILL.md` correspondiente por descripcion.

## Recordatorios de alto riesgo

- `@Roles()` usa `UserRole.*`, no strings literales.
- Tenant/schema nunca se hardcodean; resuelve desde contexto aprobado.
- pgBouncer no conserva `search_path`; usa `SET LOCAL` por transaccion o helpers aprobados.
- Tailwind es v4 CSS-first; no agregues `tailwind.config.js` sin ADR.
- Cero PII, secretos, tokens o connection strings en codigo, tests, docs o logs.
- OpenCode debe mantener `mcp.context7` apuntando al paquete oficial `@upstash/context7-mcp`; no consumir el endpoint remoto directo.
- Los MCP no son una capacidad global del repo: en OpenCode se versionan en `.opencode/opencode.json`; en Codex dependen de la sesion o del cliente activo.

Para el mapa completo de decisiones y comandos, vuelve a `AGENTS.md`.

## Notas por proveedor (informativas, no fuentes de verdad)

Las IAs activas pueden resolver superficies adicionales segun su propia configuracion. La presencia o ausencia de estos archivos no cambia la regla de gobernanza del proyecto: aunque la CLI correspondiente pueda leerlos, en este workspace **AGENTS.md sigue siendo la fuente maestra**.

### GitHub Copilot

La CLI/cliente de Copilot puede leer instrucciones desde varias ubicaciones. Orden de lectura observado en este workspace:

- `AGENTS.md` (fuente maestra)
- `.github/instructions/**/*.instructions.md` (instrucciones por path)
- `.github/copilot-instructions.md` (este archivo)
- `$HOME/.copilot/copilot-instructions.md` (archivo por usuario)
- rutas definidas por la variable `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`

`GEMINI.md` aparece en el orden observado de la CLI, pero en este repo esta marcado como pasivo y **no** debe usarse como fuente de verdad. `CLAUDE.md` esta activo (ver seccion Claude Code abajo) pero sigue subordinado a `AGENTS.md`.

### OpenCode

OpenCode carga su configuracion desde:

- `./opencode.json`, `./opencode.jsonc` o `.opencode/opencode.json` (al subir desde el cwd al worktree root).
- `~/.config/opencode/opencode.json` para configuracion global.

`AGENTS.md` se lee automaticamente desde la raiz del proyecto. Este archivo se referencia explicitamente desde `.opencode/opencode.json` en el campo `instructions` para mantener paridad con Copilot. Las skills viven en `skills.paths` (incluye `.agents/skills/`) y los MCPs operativos en `mcp`.

### Codex

Codex debe consumir `AGENTS.md`, este bootstrap, las instrucciones por path y el catalogo de skills del workspace como gobernanza compartida. Si la sesion expone herramientas equivalentes a MCP, su disponibilidad depende del cliente activo y no de un archivo adicional versionado en este repo.

### Claude Code

Claude Code (CLI / extension IDE) lee `CLAUDE.md` automaticamente desde la raiz del proyecto al arrancar en el workspace. Orden de lectura declarado en `CLAUDE.md`:

- `AGENTS.md` (fuente maestra)
- `docs/prds/Stack_Tecnologico.md`
- PRD/HLD/ADR vigente del modulo afectado
- `.github/instructions/*.instructions.md` por `applyTo`
- `.agents/skills/INDEX.md` y el `SKILL.md` de la skill activada por descripcion

Claude Code no tiene un mecanismo nativo de `skills.paths` para directorios de skills de proyecto arbitrarios (no existe `.claude/skills/` en este repo y no se debe crear uno que duplique `.agents/skills/`). El catalogo se aplica por lectura documental: antes de una tarea de un dominio cubierto por una skill, Claude Code lee el `SKILL.md` correspondiente con su herramienta de lectura de archivos y aplica sus reglas como si fueran parte de este bootstrap. Las skills nativas que expone la tool `Skill` del harness (utilidades genericas del cliente, no del catalogo del repo) son un mecanismo aparte y no reemplazan este flujo.

## Regla de precedencia del repositorio

- Fuente maestra: `AGENTS.md` — siempre prevalece cuando hay conflicto.
- Complementos por path: `.github/instructions/*.instructions.md` — aplican en su `applyTo`.
- Archivos de usuario (`$HOME/.copilot/...`, `~/.config/opencode/...`) o variables de entorno son auxiliares y nunca deben contradecir `AGENTS.md`.

Si encuentras que la CLI de cualquier IA esta siguiendo una instruccion que contradice `AGENTS.md`, documenta el conflicto y escalalo — no asumas la autoridad del archivo local que contradice `AGENTS.md`.
