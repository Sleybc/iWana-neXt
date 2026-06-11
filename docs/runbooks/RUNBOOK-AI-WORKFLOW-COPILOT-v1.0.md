# RUNBOOK-AI-WORKFLOW-COPILOT

**Version:** 1.0  
**Estado:** Deprecado  
**Fecha:** 2026-05-19  
**Modo activo:** Mixto

## Proposito

Documento historico de la etapa en la que GitHub Copilot fue la superficie primaria del repo. Se conserva solo para trazabilidad.

## Flujo Vigente

Este runbook ya no describe el estado vigente. La superficie activa actual se documenta en `AGENTS.md`, `.github/copilot-instructions.md` y [RUNBOOK-AI-WORKFLOW-MULTIAGENT-v1.1.md](/home/sley/Documentos/appiw/docs/runbooks/RUNBOOK-AI-WORKFLOW-MULTIAGENT-v1.1.md).

## Estado actual

- No usar este archivo como instruccion operativa vigente.
- Mantenerlo solo como evidencia historica de la fase Copilot-first.
- Para trabajo actual con Copilot, OpenCode o Codex, seguir el runbook multi-asistente.

## Referencia historica

- `.github/copilot-instructions.md`: bootstrap minimo de Copilot.
- `.github/instructions/*.instructions.md`: reglas contextuales por path.
- `.github/prompts/*.prompt.md`: prompts reutilizables para informes y reviews.
- `.agents/skills/`: skills bajo demanda, subordinadas a `AGENTS.md`.

## Superficies Pasivas

- `CLAUDE.md`: deprecado hasta reactivacion explicita de Claude Code.
- `.opencode/`: contingencia recuperable; no usar como fuente activa.

## Regla De Mantenimiento

Las reglas globales viven en `AGENTS.md`. Los archivos contextuales deben contener solo reglas locales que cambian el comportamiento del asistente segun el path.

## Reactivacion De Herramientas Pasivas

Antes de reactivar Claude u OpenCode:

1. Comparar su bootstrap contra `AGENTS.md`.
2. Eliminar reglas duplicadas y reemplazarlas por referencias.
3. Validar PRD, HLD y ADR vigentes.
4. Ejecutar una tarea piloto no critica.
5. Registrar el cambio en el informe vivo correspondiente.
