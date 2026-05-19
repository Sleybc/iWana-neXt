# OpenCode — Pasivo

**Version:** 1.0  
**Estado:** Deprecado  
**Fecha:** 2026-05-19

OpenCode no es una herramienta activa del workspace. Se conserva como contingencia recuperable, pero no debe usarse como fuente de gobernanza mientras GitHub Copilot sea el asistente principal.

## Fuente Vigente

- Fuente maestra: `AGENTS.md`
- Flujo activo: `docs/runbooks/RUNBOOK-AI-WORKFLOW-COPILOT-v1.0.md`

## Reactivacion

Antes de reactivar OpenCode:

1. Comparar `.opencode/agents/*.md` contra `AGENTS.md`.
2. Validar que los MCPs de `.opencode/opencode.json` sigan disponibles.
3. Volver a habilitar MCPs solo si se necesita navegador, Context7 o Playwright desde OpenCode.
4. Ejecutar una tarea piloto no critica.
5. Actualizar el informe vivo correspondiente.
