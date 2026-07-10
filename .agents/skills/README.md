# Skills activas de iWana neXt

**Version:** 1.3  
**Estado:** Aprobado  
**Fecha:** 2026-07-09

Este directorio contiene el catalogo activo de skills del proyecto. La fuente maestra de gobernanza es `AGENTS.md`; el indice operativo del catalogo es `.agents/skills/INDEX.md`.

La disponibilidad efectiva puede variar segun el cliente:

- GitHub Copilot puede usar `skills-lock.json` como filtro adicional de disponibilidad si ese cliente lo tiene habilitado.
- OpenCode consume el catalogo del workspace desde `skills.paths`.
- Codex usa el catalogo segun el mecanismo de skills disponible en la sesion activa.
- Claude Code no tiene un mecanismo nativo de `skills.paths` para directorios de proyecto arbitrarios; aplica el catalogo por lectura documental desde `CLAUDE.md`, que remite a este `INDEX.md` y al `SKILL.md` de la skill activada por descripcion. No la invoca como tool nativa (`Skill`) salvo que el harness la exponga explicitamente.

Si una skill existe en este directorio pero un cliente no la expone en su sesion, prevalece la capacidad real del cliente, no una suposicion documental.

## Uso

1. Consulta `AGENTS.md` para precedencia, stack, comandos, boundaries y gotchas.
2. Usa `.agents/skills/INDEX.md` para elegir la skill adecuada.
3. Lee siempre el `SKILL.md` de la skill antes de aplicarla.
4. No reincorpores skills inactivas sin una decision explicita del roadmap.

## Registro historico

El repo ya no mantiene un directorio local de archivo para skills inactivas. Las decisiones historicas de descarte, hold o restauracion se conservan en `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md` y deben revalidarse antes de reincorporar una skill al catalogo activo.
