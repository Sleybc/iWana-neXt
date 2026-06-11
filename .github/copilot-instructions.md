# iWana neXt — AI Bootstrap

GitHub Copilot, OpenCode y Codex son las IAs activas del workspace. `AGENTS.md` es la fuente maestra de gobernanza, arquitectura, comandos, gotchas, skills y entregables.

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
- `.github/instructions/*.instructions.md` — reglas contextuales por path, complementan a `AGENTS.md` en su `applyTo`.
- `.github/prompts/*.prompt.md` — prompts operativos reutilizables, disponibles para cualquier asistente compatible.
- `.agents/skills/` — catalogo activo de skills; `INDEX.md` y `MANIFEST.json` son la fuente de verdad del catalogo.

`CLAUDE.md` queda pasivo por ahora; no se usa como fuente de verdad aunque el archivo exista en el repo.

## Flujo activo

- Usa siempre `pnpm`; no uses `npm` ni `yarn` para flujos del repo.
- Las reglas por archivo viven en `.github/instructions/*.instructions.md` y son complementos, no fuentes maestras.
- Los prompts operativos viven en `.github/prompts/`.
- OpenCode y Codex quedan en paridad documental con Copilot; los tres leen `AGENTS.md` y este bootstrap.
- Las skills del repo viven en `.agents/skills/` y deben reutilizarse desde cualquier cliente que soporte ese catalogo; no dupliques reglas en un sistema paralelo de agentes.

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

`CLAUDE.md` y `GEMINI.md` aparecen en el orden observado de la CLI, pero en este repo estan marcados como pasivos y **no** deben usarse como fuentes de verdad.

### OpenCode

OpenCode carga su configuracion desde:

- `./opencode.json`, `./opencode.jsonc` o `.opencode/opencode.json` (al subir desde el cwd al worktree root).
- `~/.config/opencode/opencode.json` para configuracion global.

`AGENTS.md` se lee automaticamente desde la raiz del proyecto. Este archivo se referencia explicitamente desde `.opencode/opencode.json` en el campo `instructions` para mantener paridad con Copilot. Las skills viven en `skills.paths` (incluye `.agents/skills/`) y los MCPs operativos en `mcp`.

### Codex

Codex debe consumir `AGENTS.md`, este bootstrap, las instrucciones por path y el catalogo de skills del workspace como gobernanza compartida. Si la sesion expone herramientas equivalentes a MCP, su disponibilidad depende del cliente activo y no de un archivo adicional versionado en este repo.

## Regla de precedencia del repositorio

- Fuente maestra: `AGENTS.md` — siempre prevalece cuando hay conflicto.
- Complementos por path: `.github/instructions/*.instructions.md` — aplican en su `applyTo`.
- Archivos de usuario (`$HOME/.copilot/...`, `~/.config/opencode/...`) o variables de entorno son auxiliares y nunca deben contradecir `AGENTS.md`.

Si encuentras que la CLI de cualquier IA esta siguiendo una instruccion que contradice `AGENTS.md`, documenta el conflicto y escalalo — no asumas la autoridad del archivo local que contradice `AGENTS.md`.
