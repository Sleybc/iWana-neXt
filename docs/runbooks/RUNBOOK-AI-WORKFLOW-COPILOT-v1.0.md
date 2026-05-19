# RUNBOOK-AI-WORKFLOW-COPILOT

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-19  
**Modo activo:** Mixto

## Proposito

Definir la superficie activa de asistencia IA del repo para reducir duplicacion documental y evitar drift entre herramientas.

## Flujo Vigente

GitHub Copilot en VS Code es el asistente activo. `AGENTS.md` es la fuente maestra para gobernanza, stack, comandos, skills, gotchas, entregables y boundaries.

## Superficies Activas

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
