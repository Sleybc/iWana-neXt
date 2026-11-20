# ADR-113: Retiro de GitHub Copilot como asistente activo

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** usuario titular del repositorio — 2026-11-20
**Fecha:** 2026-11-20
**Modo activo:** ejecutor
**Autor:** Claude Code
**Relacionado:** [ADR-092](ADR-092-Superficies-IA-Generadas-desde-Fuente-Unica.md) · `AGENTS.md` → AI Workflow Activo · [RUNBOOK-AI-WORKFLOW-MULTIAGENT-v1.1](../runbooks/RUNBOOK-AI-WORKFLOW-MULTIAGENT-v1.1.md)

---

## Contexto

`AGENTS.md` declara cuatro asistentes activos: GitHub Copilot, OpenCode, Codex y Claude Code. El titular del repositorio solo trabaja con Claude Code, Codex y OpenCode (decisión del 2026-11-20). Mantener Copilot cuesta:

- Texto de gobernanza que habla de un cliente que no se usa (`AGENTS.md`, `CLAUDE.md`, runbooks, ADR-092, `.gitignore`, `scripts/sync-agents.mjs`).
- El bootstrap se llama `.github/copilot-instructions.md` aunque es agnóstico de proveedor y lo leen OpenCode (`.opencode/opencode.json` → `instructions`) y Claude Code (`CLAUDE.md`, lectura 2). El nombre induce a borrarlo como "cosa de Copilot" y romper a los otros dos.

Inventario del 2026-11-20: 80 menciones en 23 archivos. Ningún script ni workflow de CI lee el bootstrap por ruta; sí lo listan `.agents/skills/MANIFEST.json` (líneas 8 y 247) e `INDEX.md`.

## Decisión

### D1. Tres asistentes activos

Claude Code, Codex y OpenCode. Copilot sale de `AGENTS.md` → AI Workflow Activo, de la precedencia y de `CLAUDE.md`.

### D2. El bootstrap se mueve a ruta neutral

`.github/copilot-instructions.md` → `.agents/BOOTSTRAP.md` (`git mv`, contenido sin cambios salvo la lista de asistentes). Se actualizan en el mismo commit: `.opencode/opencode.json` (`instructions`), `CLAUDE.md`, `AGENTS.md`, `.agents/skills/MANIFEST.json`, `.agents/skills/INDEX.md` y el runbook multiagente. No se deja un archivo puente en la ruta vieja.

### D3. Se retira lo exclusivo de Copilot

- `docs/runbooks/RUNBOOK-AI-WORKFLOW-COPILOT-v1.0.md` → estado Deprecado, con remisión a este ADR (no se borra).
- `.agents/skills/README.md`: se quita la nota de `skills-lock.json` para Copilot.
- Comentarios de `.gitignore` y `scripts/sync-agents.mjs`: listan tres asistentes.
- ADR-092: nota de enmienda en su cabecera; el cuerpo histórico no se reescribe.

### D4. Fuera de alcance

- `.github/instructions/*.instructions.md`: reglas por ruta que exige `CLAUDE.md` para todas las IAs. Se quedan donde están; moverlas es otra decisión.
- `https://api.githubcopilot.com/mcp/` en `.agents/mcp/servers.json`: es el endpoint del MCP oficial de GitHub, no el asistente.
- Informes, planes y prompts ya cerrados: registro histórico, no se tocan.

## Consecuencias

### Positivas

- La gobernanza describe los clientes que se usan.
- El bootstrap deja de parecer exclusivo de un proveedor.

### Costos y tradeoffs

- Sesiones o prompts viejos que citen `.github/copilot-instructions.md` apuntarán a una ruta inexistente; la remisión vive en este ADR y en `AGENTS.md`.
- Si alguien abre el repo con Copilot, ya no carga el bootstrap automáticamente (Copilot solo lee `.github/copilot-instructions.md`). Aceptado: no es cliente soportado.

### Verificación

- `pnpm sync:agents:check`, `pnpm sync:skills:check` y `pnpm sync:mcp:check` en verde.
- `grep -ri copilot` sobre superficies vigentes (excluye `docs/informes`, `docs/plans`, `docs/prompts` y `api.githubcopilot.com`) devuelve solo este ADR, la nota de ADR-092 y el runbook deprecado.
- OpenCode arranca y carga `.agents/BOOTSTRAP.md` desde `instructions`.

## Referencias

- AGENTS.md → AI Workflow Activo
- CLAUDE.md
- ADR-092
- docs/runbooks/RUNBOOK-AI-WORKFLOW-MULTIAGENT-v1.1.md
- docs/runbooks/RUNBOOK-AI-WORKFLOW-COPILOT-v1.0.md
