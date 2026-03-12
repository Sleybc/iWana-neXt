# iWana neXt — Claude Code Instructions

> Este archivo complementa AGENTS.md con formato nativo Claude Code.
> No dupliques reglas — importa y referencia.

## Instrucciones Base

@import AGENTS.md

## Reglas Modulares

Las reglas por dominio estan en `.claude/rules/`. Se cargan automaticamente segun los paths del archivo en edicion.

## Workflow

1. Lee siempre AGENTS.md primero para identidad, modos y precedencia.
2. Las reglas de `.claude/rules/` aplican por dominio (backend, frontend, testing, docs, security).
3. Usa skills locales de `.agents/skills/` antes de inventar soluciones ad-hoc.
4. Secretos y endpoints personales van en `CLAUDE.local.md` (no versionado).
5. Si generas un prompt de ejecucion por fase, usa siempre `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` como base.

## Restricciones Clave

- Nunca PII real, secretos ni tokens en outputs.
- Nunca contradigas ADRs aprobados ni el PRD del sistema.
- Nunca inicies modulo N+1 sin cerrar N (ADR-016).
- Versiones de stack: consulta `docs/prds/Stack_Tecnologico.md`, no asumas.
- Todo codigo generado debe incluir comentarios funcionales en espanol cuando aplique.
- Toda ejecucion con cambios debe cerrar actualizando un informe en `docs/informes/`; para correcciones, actualizar el existente en vez de crear uno nuevo.
- Los documentos nuevos deben seguir la convencion `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`.

## Formato de Respuesta

- Explicita el **modo activo** (EM / Architect / Mixto) al inicio.
- Incluye **referencias** a docs cuando tomes decisiones.
- Usa el formato de escalacion `[ESCALACION AL CTO]` cuando corresponda.
