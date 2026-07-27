# RUNBOOK-AI-WORKFLOW-MULTIAGENT

**Version:** 1.2  
**Estado:** Aprobado  
**Fecha:** 2026-07-09  
**Modo activo:** Mixto

## Proposito

Definir la superficie activa de asistencia IA del repo para reducir drift entre Copilot, OpenCode, Codex y Claude Code, manteniendo una sola gobernanza documental.

## Flujo vigente

GitHub Copilot, OpenCode, Codex y Claude Code son asistentes activos del workspace. `AGENTS.md` es la fuente maestra para gobernanza, stack, comandos, skills, gotchas, entregables y boundaries. Claude Code fue reactivado el 2026-07-09 (ver `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`); no tiene configuracion cliente versionada propia (a diferencia de `.opencode/opencode.json`) — su bootstrap es `CLAUDE.md`, leido automaticamente por esa CLI.

## Orden de precedencia

1. `AGENTS.md`
2. `.github/copilot-instructions.md`
3. PRD, HLD y ADR vigente del modulo afectado
4. `.github/instructions/*.instructions.md`
5. `.agents/skills/INDEX.md` y la skill aplicable
6. Configuracion especifica del cliente activo

## Superficies activas

- `AGENTS.md`: gobernanza maestra del workspace.
- `.github/copilot-instructions.md`: bootstrap agnostico de proveedor.
- `CLAUDE.md`: bootstrap propio de Claude Code, leido automaticamente por esa CLI.
- `.github/instructions/*.instructions.md`: reglas contextuales por path.
- `docs/prompts/PROMPT-*.md`: todos los prompts del workspace (ejecucion por fase y operativos reutilizables). Unica carpeta de prompts desde el 2026-07-27.
- `.agents/skills/`: catalogo activo de skills del workspace.
- `.opencode/opencode.json`: configuracion versionada de OpenCode para `instructions`, `skills.paths` y `mcp`.

## Matriz de capacidades

| Capacidad | Fuente | Regla operativa |
| --- | --- | --- |
| Skills | `.agents/skills/INDEX.md` + `.agents/skills/MANIFEST.json` | Catalogo compartido del workspace; no duplicar criterios en agentes custom del cliente. Claude Code no tiene `skills.paths`: consume el catalogo por lectura documental desde `CLAUDE.md`. |
| Prompts | `docs/prompts/` | Unica carpeta de prompts, para los dos subtipos. Deben remitir a `AGENTS.md`, artefactos del modulo y restricciones reales. |
| Reglas por path | `.github/instructions/*.instructions.md` | Complementan la capa global y no deben competir con `AGENTS.md`. |
| MCP | `.opencode/opencode.json` para OpenCode | En Codex la disponibilidad depende de la sesion activa; no crear config ficticia del repo. |
| Agentes / subagentes | Skills de workflow (`brainstorming`, `writing-plans`, `architect-review`, `subagent-driven-development`) | Preferir flujos compartidos del repo antes que agentes paralelos por proveedor. |

## Reglas de mantenimiento

- Las reglas globales viven en `AGENTS.md`.
- El bootstrap debe permanecer agnostico de proveedor aunque conserve el nombre `.github/copilot-instructions.md`.
- Las skills del repo son reutilizables por cualquier asistente que soporte ese catalogo.
- Los informes historicos se conservan como evidencia, pero no deben contradecir la gobernanza activa.

## Reactivacion o desactivacion de herramientas

Antes de activar o desactivar una IA del workspace:

1. Comparar su bootstrap efectivo contra `AGENTS.md`.
2. Eliminar reglas duplicadas y reemplazarlas por referencias.
3. Verificar si necesita configuracion cliente versionada o solo consumo documental.
4. Validar PRD, HLD y ADR vigentes antes de tareas productivas.
5. Registrar el cambio en `docs/informes/` sin reescribir artefactos historicos.
