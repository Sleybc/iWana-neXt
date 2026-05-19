# Skills activas de iWana neXt

**Version:** 1.1  
**Estado:** Aprobado  
**Fecha:** 2026-05-19

Este directorio contiene el catalogo activo de skills del proyecto. La fuente maestra de gobernanza es `AGENTS.md`; el indice operativo del catalogo es `.agents/skills/INDEX.md`.

La disponibilidad efectiva para GitHub Copilot se controla adicionalmente desde `skills-lock.json`. Si una skill existe en este directorio pero no aparece en ese lockfile, se considera fuera del set operativo habilitado para la sesion actual.

## Uso

1. Consulta `AGENTS.md` para precedencia, stack, comandos, boundaries y gotchas.
2. Usa `.agents/skills/INDEX.md` para elegir la skill adecuada.
3. Lee siempre el `SKILL.md` de la skill antes de aplicarla.
4. No reincorpores skills inactivas sin una decision explicita del roadmap.

## Registro historico

El repo ya no mantiene un directorio local de archivo para skills inactivas. Las decisiones historicas de descarte, hold o restauracion se conservan en `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md` y deben revalidarse antes de reincorporar una skill al catalogo activo.
