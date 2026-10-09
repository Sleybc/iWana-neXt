# Claude Code bootstrap — iWana neXt

`AGENTS.md` es la fuente maestra de gobernanza y prevalece sobre este archivo.
Claude Code es un asistente activo, al mismo nivel que Copilot, OpenCode y Codex;
su activación y precedencia están documentadas en `AGENTS.md` → **AI Workflow Activo**.

## Lectura obligatoria

1. `AGENTS.md`.
2. `.github/copilot-instructions.md`.
3. `docs/prds/Stack_Tecnologico.md` y el PRD/HLD/ADR vigente del módulo.
4. Las reglas por ruta de `.github/instructions/*.instructions.md` que apliquen.
5. `.agents/skills/INDEX.md` y el `SKILL.md` cuyo dominio coincida con la tarea.

Si los artefactos discrepan en seguridad, tenancy, boundaries o stack, documentar y
escalar; no sintetizar una solución por conveniencia. Usar exclusivamente `pnpm`.

## Superficies compartidas

- `docs/prompts/` es la única ubicación para prompts.
- `.agents/skills/` es el catálogo común. `.claude/skills/` contiene **punteros
  generados** por `pnpm sync:skills` (ADR-092) para que Claude Code descubra cada
  skill; el puntero remite al `SKILL.md` canónico, que es el que se lee y aplica.
  No editar `.claude/skills/` a mano ni copiar contenido allí.
- `.agents/mcp/servers.json` es la fuente única de MCP: `.mcp.json` y la clave
  `mcp` de `.opencode/opencode.json` se generan con `pnpm sync:mcp`.
- `.claude/agents/` es la fuente canónica de los subagentes de rol.
  `.opencode/agents/` y `.codex/agents/` son generados: verificar con
  `pnpm sync:agents:check`, no editarlos a mano.

Las reglas de arquitectura, seguridad, pruebas, documentación, comandos y gates
viven en `AGENTS.md`; este bootstrap no las duplica.
