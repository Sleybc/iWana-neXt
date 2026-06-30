# INFORME — Normalizacion de gobernanza IA para Codex

> **Tipo:** INFORME
> **Modulo:** SISTEMA — Gobernanza IA
> **Fase:** Normalizacion
> **Version:** 1.0
> **Fecha:** 2026-06-09
> **Estado:** Aprobado

## 1. Objetivo

Integrar a Codex como asistente activo bajo la misma gobernanza documental del repo, sin cambiar el baseline tecnico ni crear configuraciones ficticias del cliente.

## 2. Cambios aplicados

| Artefacto | Cambio |
| --- | --- |
| `AGENTS.md` | Se agrego a Codex como asistente activo y se formalizo una matriz operativa por capacidad para skills, prompts, reglas por path, MCP y agentes/subagentes. |
| `.github/copilot-instructions.md` | Se normalizo el bootstrap como capa agnostica para Copilot, OpenCode y Codex, aclarando que los MCP son cliente-dependientes. |
| `.agents/skills/INDEX.md` | Se elimino el drift que marcaba `.opencode/` como pasivo y se aclaro el rol de `skills-lock.json` frente a OpenCode y Codex. |
| `.agents/skills/README.md` | Se separo el comportamiento por cliente para `skills-lock.json`, `skills.paths` y sesiones de Codex. |
| `docs/runbooks/RUNBOOK-AI-WORKFLOW-COPILOT-v1.0.md` | Quedo deprecado como artefacto historico. |
| `docs/runbooks/RUNBOOK-AI-WORKFLOW-MULTIAGENT-v1.1.md` | Nuevo runbook vigente para Copilot, OpenCode y Codex. |
| `docs/prompts/PROMPT-TAXATION-PARTIES-COMMERCIAL-FASE-01-v1.0.md` | Se removio la referencia operativa a `CLAUDE.md`. |
| `docs/prompts/PROMPT-PARTIES-F2-v1.0.md` | Se removio la referencia operativa a `CLAUDE.md`. |

## 3. Decisiones operativas

- `AGENTS.md` se mantiene como fuente maestra.
- `.github/copilot-instructions.md` conserva su nombre para no romper autodiscovery, pero su contenido sigue siendo agnostico de proveedor.
- Codex no recibe un archivo de configuracion propio en el repo porque no existe una superficie versionada equivalente a `.opencode/opencode.json`.
- Los MCP siguen siendo una capacidad declarada solo para OpenCode en el repo; en Codex dependen de la sesion activa.

## 4. Riesgos y limites

- Persisten referencias historicas a `CLAUDE.md`, Copilot o estados previos dentro de informes y documentos de trazabilidad; no se corrigieron porque forman parte del historial documental.
- La disponibilidad real de skills en Codex sigue dependiendo del cliente o sesion activa, aunque el catalogo fuente del workspace ya esta alineado.
- El nuevo runbook multi-asistente reduce drift futuro, pero requiere que cambios posteriores de gobernanza se reflejen tanto en `AGENTS.md` como en el bootstrap.

## 5. Validacion ejecutada

- Auditoria textual con `rg` sobre `AGENTS.md`, `.github/`, `.agents/skills/` y `docs/`.
- Verificacion de coherencia entre `AGENTS.md`, bootstrap, indice y README de skills.
- Confirmacion de que `.opencode/opencode.json` no fue alterado y mantiene su semantica actual.
