# ADR-092: Superficies de IA generadas desde fuente única — skills y MCP

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** usuario titular del repositorio — 2026-10-09 (decisiones abiertas 2 y 4 de `INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0`)
**Fecha:** 2026-10-09
**Modo activo:** ejecutor
**Autor:** Claude Code
**Relacionado:** `scripts/sync-agents.mjs` (precedente: subagentes generados desde `.claude/agents/`) · [INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0](../informes/INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md)

---

## Contexto

El repo opera con varias IAs activas (Copilot, OpenCode, Codex, Claude Code) y ya resolvió un problema análogo para los subagentes: `.claude/agents/` es canónico y `pnpm sync:agents` genera `.opencode/agents/` y `.codex/agents/`, verificado en CI. Quedaban dos superficies sin ese tratamiento:

1. **Skills.** El catálogo vive en `.agents/skills/` (49 skills, gobernadas por `INDEX.md` y `MANIFEST.json`). OpenCode lo descubre por `skills.paths`, pero Claude Code solo expone como `/comando` las skills de `.claude/skills/`. `CLAUDE.md` prohibía copiar el catálogo allí, con razón: dos copias divergen. El resultado era que Claude Code aplicaba las skills solo por lectura documental.
2. **MCP.** `.opencode/opencode.json` declaraba 4 servidores (`npx` sin versión) y `.mcp.json`, creado el 2026-10-08, otros 3 con versiones fijadas. Dos listas escritas a mano, con formatos distintos, para lo mismo.

## Decisión

### D1. `.claude/skills/` se genera como punteros, no como copias

`pnpm sync:skills` (`scripts/sync-skills.mjs`) genera `.claude/skills/<skill>/SKILL.md` por cada skill del catálogo con:

- el **frontmatter original** (para que la descripción dispare la skill igual que en el catálogo), precedido de un comentario `GENERADO`;
- un cuerpo que ordena leer y aplicar `.agents/skills/<skill>/SKILL.md` y resolver sus rutas relativas desde allí.

No se copia el contenido: el catálogo sigue teniendo una sola copia. Los punteros huérfanos se retiran; una skill propia escrita a mano en `.claude/skills/` (sin el marcador) no se toca.

### D2. `.agents/mcp/servers.json` es la fuente única de MCP

`pnpm sync:mcp` (`scripts/sync-mcp.mjs`) genera `.mcp.json` completo y **solo la clave `mcp`** de `.opencode/opencode.json` (el resto de ese archivo sigue siendo editable). Cada servidor declara `clients` y uno de `package` (npm con versión exacta, lanzado con `pnpm dlx`), `command` o `url`. `{env:VAR}` se traduce a `${VAR}` para Claude Code. La salida pasa por Prettier con la configuración del repo, así que lint-staged no la reescribe.

### D3. Mismo régimen que los subagentes

- Los generados no se editan a mano; el hook `guard-paths` de Claude Code lo bloquea y el hook `sync-surfaces` regenera al editar la fuente.
- CI ejecuta `pnpm sync:skills:check` y `pnpm sync:mcp:check` junto a `sync:agents:check`.
- `scripts/sync-surfaces.test.mjs` cubre la traducción en `pnpm test:tooling`.

## Consecuencias

- Claude Code descubre las 49 skills del catálogo como `/comando` y por descripción, sin duplicar su contenido.
- OpenCode pasa de `npx` sin versión a `pnpm dlx` con versión fija (alineado con «solo pnpm» de `AGENTS.md`) y recibe `postgres-dev`.
- Si un cliente que ya lee `.agents/skills/` también descubre `.claude/skills/` (algunas versiones de OpenCode y Copilot lo hacen por compatibilidad), verá la skill por dos rutas; como el puntero remite al mismo `SKILL.md` canónico, el comportamiento no cambia. No verificado por cliente.
- Alta, baja o cambio de una skill exige `pnpm sync:skills` además de la trazabilidad de `INDEX.md`/`MANIFEST.json`; CI lo exige.
- Los `package` de Claude Code se lanzan con `cmd /c` porque el repo se opera en Windows nativo. Si se sumara un puesto Linux o macOS, el generador necesitaría una variante por plataforma.

## Alternativas descartadas

| Alternativa | Motivo |
| --- | --- |
| Copiar el catálogo completo a `.claude/skills/` | Dos copias divergentes; es justo lo que `CLAUDE.md` prohibía |
| Symlink `.claude/skills` → `.agents/skills` | Frágil en Windows (requiere privilegios o modo desarrollador) y git lo versiona de forma distinta por plataforma |
| `.mcp.json` como fuente y derivar OpenCode | El formato de Claude no tiene dónde declarar servidores exclusivos de otro cliente (`github`, `chrome-devtools`) |

## Referencias

- `scripts/sync-agents.mjs`, `scripts/sync-skills.mjs`, `scripts/sync-mcp.mjs`, `scripts/lib/generated-surface.mjs`
- `.agents/skills/INDEX.md`, `.agents/mcp/servers.json`
- `AGENTS.md` → AI Workflow Activo · `CLAUDE.md` → Superficies compartidas
