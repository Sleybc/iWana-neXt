# CLAUDE.md

**Version:** 1.1  
**Estado:** Deprecado  
**Fecha:** 2026-05-19

Claude Code no es una herramienta activa para este workspace en la fase actual. El flujo operativo aprobado usa GitHub Copilot como asistente principal.

## Fuente Vigente

- Fuente maestra: `AGENTS.md`
- Bootstrap activo para Copilot: `.github/copilot-instructions.md`
- Instrucciones contextuales activas: `.github/instructions/*.instructions.md`
- Prompts operativos activos: `.github/prompts/*.prompt.md`

## Reglas Para Reactivar Claude

1. Comparar este archivo contra `AGENTS.md` antes de usarlo.
2. Crear reglas reales en `.claude/rules/` solo si Claude Code vuelve a ser herramienta activa.
3. No duplicar tablas de skills, comandos, gotchas ni arquitectura: referenciar `AGENTS.md`.
4. Validar que las referencias a PRD, HLD y ADR vigentes no hayan cambiado.

Hasta que se reactive formalmente, cualquier conflicto se resuelve a favor de `AGENTS.md`.
