# INFORME — Activacion de OpenCode en paridad con GitHub Copilot

> **Tipo:** INFORME
> **Modulo:** MOD00 — Configuracion del control plane IA
> **Fase:** Activacion
> **Version:** 1.0
> **Fecha:** 2026-06-05
> **Estado:** Aprobado
> **Alcance:** Gobernanza de herramientas IA, no codigo de producto

---

## 1. Resumen ejecutivo

Se reactiva OpenCode como segunda IA activa del workspace de iWana neXt, en paridad operativa con GitHub Copilot. Ambos asistentes quedan subordinados a `AGENTS.md` (fuente maestra) y comparten el mismo bootstrap, las mismas skills del catalogo activo y los mismos MCPs operativos.

Resultado:

- Cualquier tarea de desarrollo puede ser ejecutada por Copilot u OpenCode sin perdida de gobernanza, contexto ni cobertura de skills.
- El bootstrap pasa de ser Copilot-especifico a un archivo agnostico de IA, leido por Copilot automaticamente y referenciado por OpenCode desde `instructions`.
- Los MCPs `chrome-devtools`, `context7` y `playwright` quedan declarados en `.opencode/opencode.json` con arranque via `npx`, restaurando la cobertura operativa que existio en el setup previo (`a24fa30` los habia deshabilitado al consolidar Copilot como unica IA activa).

## 2. Contexto y motivacion

En el commit `a24fa30 chore: simplificar gobernanza IA — Copilot activo; Claude/OpenCode pasivos` se simplifico la gobernanza para dejar a GitHub Copilot como unica IA activa. OpenCode fue marcado como contingencia pasiva recuperable, con sus MCPs deshabilitados y un `.opencode/DISABLED.md` explicito.

La necesidad actual es trabajar el sistema desde la CLI / TUI / web de OpenCode sin perder:

- Las reglas de gobernanza y arquitectura (modulith, multi-tenancy por schema, seguridad).
- La cobertura de skills del catalogo activo (41 skills core en `.agents/skills/`).
- Los MCPs operativos que la version previa de OpenCode ya tenia habilitados.
- La trazabilidad documental exigida por AGENTS.md para cualquier cambio de gobernanza.

## 3. Decisiones de diseno

| Decision | Eleccion | Justificacion |
| --- | --- | --- |
| Alcance de OpenCode | Peer de Copilot bajo `AGENTS.md` | No se prefiere una IA sobre otra salvo indicacion explicita del usuario. |
| Bootstrap | Refactor de `.github/copilot-instructions.md` a archivo agnostico | Evita drift entre dos bootstraps y mantiene la URL canonica que Copilot auto-descubre. |
| MCPs | `chrome-devtools` + `context7` + `playwright` con arranque `npx` | Restaura la cobertura operativa del setup previo y la declarada en el INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO. |
| `context7` | Paquete oficial `@upstash/context7-mcp` | Mantiene el mecanismo `npx` alineado con los otros dos MCPs y evita acoplar al endpoint remoto directo. |
| Agentes custom | No restaurar los 4 del archive (architect-reviewer, mixed-governance, orchestrator, planner-em) | OpenCode queda con los agentes built-in (`build`, `plan`, `general`, `explore`). Las skills en `.agents/skills/` ya cubren los flujos (brainstorming, writing-plans, architect-review, subagent-driven-development). Evita duplicacion con AGENTS.md. |
| Precedencia | `AGENTS.md` > bootstrap > PRD/HLD/ADR > instrucciones por path > skills > config cliente | Sin cambios respecto a la version previa. OpenCode se inserta en la posicion que ya ocupaba Copilot. |
| `CLAUDE.md` | Sigue pasivo | No se reactiva Claude Code en este informe. |

## 4. Artefactos creados o modificados

| Artefacto | Estado | Cambio |
| --- | --- | --- |
| `.github/copilot-instructions.md` | Modificado | Refactor a "iWana neXt — AI Bootstrap" agnostico de proveedor; se anade seccion de notas por proveedor (Copilot, OpenCode) y se mantiene la regla de precedencia del repo. |
| `.opencode/opencode.json` | Creado | Declaracion explicita de OpenCode: `instructions` (apunta al bootstrap), `skills.paths` (incluye `.agents/skills/`) y `mcp` con los 3 servidores locales via `npx`. |
| `AGENTS.md` | Modificado | "AI Workflow Activo" pasa a declarar a Copilot y OpenCode como pares activos. Se agrega la seccion "Precedencia entre IAs y superficies" y se actualiza "Reactivacion o desactivacion de herramientas IA" para reflejar el flujo bidireccional. |

Artefactos NO modificados (validacion explicita):

- `.github/instructions/*.instructions.md` — siguen aplicando por `applyTo` para ambas IAs.
- `.github/prompts/*.prompt.md` — disponibles para ambas IAs sin cambios.
- `.agents/skills/` — el catalogo activo permanece intacto; OpenCode las descubre via `skills.paths`.
- `CLAUDE.md` — sigue pasivo.
- `.gitignore` — `.opencode/opencode.json` se versiona (no es estado local). Los artefactos transitorios de Playwright MCP (`.playwright-mcp/`) ya estaban ignorados.

## 5. Configuracion efectiva de OpenCode

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [".github/copilot-instructions.md"],
  "skills": {
    "paths": [".agents/skills"]
  },
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": ["npx", "-y", "chrome-devtools-mcp"],
      "enabled": true
    },
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp"],
      "enabled": true
    },
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp"],
      "enabled": true
    }
  }
}
```

Notas operativas:

- El JSON fue validado con `node -e "JSON.parse(...)"` antes de confirmar el archivo.
- El schema remoto `https://opencode.ai/config.json` confirma la forma de `McpLocalConfig` (requiere `type: "local"` y `command: array of string`).
- Cada MCP queda con `enabled: true` para que arranquen al iniciar OpenCode. Si alguno de los paquetes cambia de nombre en npm, se actualiza `command` sin tocar la estructura.
- `context7` queda alineado al paquete oficial `@upstash/context7-mcp` (mismo mecanismo `npx` que `playwright` y `chrome-devtools`).

## 6. Cambios en `AGENTS.md`

Diff conceptual de la seccion "AI Workflow Activo":

```diff
- **Asistentes activos:** GitHub Copilot en VS Code.
-
- **Superficies activas:**
-
- - `.github/copilot-instructions.md` — bootstrap minimo para Copilot.
- - `.github/instructions/*.instructions.md` — reglas contextuales por path.
- - `.github/prompts/*.prompt.md` — prompts operativos reutilizables.
- - `.agents/skills/` — skills bajo demanda; este archivo prevalece sobre cualquier skill individual.
-
- **Superficies pasivas por ahora:**
-
- - `CLAUDE.md` — deprecado hasta que Claude Code vuelva a ser herramienta activa.
- - `.opencode/` — contingencia recuperable, no fuente activa de gobernanza.
+ **Asistentes activos:** GitHub Copilot (VS Code) y OpenCode (CLI / TUI / web) en paridad operativa. Ambos estan subordinados a `AGENTS.md`, no se prefiere uno sobre otro salvo que el usuario lo indique explicitamente para una tarea concreta.
+
+ **Superficies activas:**
+
+ - `.github/copilot-instructions.md` — bootstrap agnostico de IA, leido por Copilot automaticamente y referenciado por OpenCode desde `instructions`. Cualquier IA que arranque en el workspace debe leerlo.
+ - `.opencode/opencode.json` — declaracion explicita de OpenCode: `instructions`, `skills.paths` y `mcp` (chrome-devtools, context7, playwright). Es la superficie de paridad con Copilot.
+ - `.github/instructions/*.instructions.md` — reglas contextuales por path; aplican en su `applyTo` para ambas IAs.
+ - `.github/prompts/*.prompt.md` — prompts operativos reutilizables; disponibles para ambas IAs.
+ - `.agents/skills/` — catalogo activo de skills. `INDEX.md` y `MANIFEST.json` son la fuente de verdad. OpenCode las descubre via `skills.paths`; Copilot las invoca por convencion del workspace.
+
+ **Superficies pasivas por ahora:**
+
+ - `CLAUDE.md` — deprecado hasta que Claude Code vuelva a ser herramienta activa. No se usa como fuente de verdad aunque el archivo exista en el repo.
```

Ademas se renombro la subseccion de "Reactivacion De Herramientas Pasivas" a "Reactivacion o desactivacion de herramientas IA" y se agrego la subseccion nueva "Precedencia entre IAs y superficies".

## 7. Validacion ejecutada

| Validacion | Resultado |
| --- | --- |
| `node -e "JSON.parse(require('fs').readFileSync('.opencode/opencode.json','utf8'))"` | JSON OK |
| Schema remoto `https://opencode.ai/config.json` | Coincide con la forma de `instructions`, `skills.paths`, `mcp[*].type/command/enabled`. |
| Comparacion contra INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO | Restaurados los 3 MCPs declarados, sin reintroducir agentes custom. |
| `git log --all -- .opencode` y `--diff-filter=D` | Confirmado el estado previo (`a24fa30` desactivo OpenCode) y los archivos de referencia en `.agents/skills-archive/.opencode/`. |
| `.agents/skills/INDEX.md` y `MANIFEST.json` | Catalogo activo intacto; no requiere re-sincronizacion con `skills-lock.json` porque OpenCode consume las skills del workspace, no del lockfile. |
| `AGENTS.md` permanece como fuente maestra | Sin cambios en precedencia, stack, security, multi-tenancy ni boundaries. |

## 8. Riesgos y mitigaciones

| Riesgo | Mitigacion |
| --- | --- |
| Drift entre el bootstrap de Copilot y el `instructions` de OpenCode | Ambos apuntan al mismo archivo fisico (`.github/copilot-instructions.md`). No hay duplicacion. |
| Paquetes `npm` de los MCPs cambian de nombre o rompen compat | `command` es un array, no un string, lo que permite reemplazar un solo elemento sin tocar el resto de la estructura. Documentado en el informe y en AGENTS.md. |
| Reactivar OpenCode revive el ruido de activacion de los 4 agentes custom archivados | Decidido no restaurar agentes custom; OpenCode queda con los 4 built-in. |
| El usuario espera que OpenCode sea la IA primaria y Copilot pase a pasivo | Decidido mantener paridad. Si el usuario quiere invertir la precedencia, se documenta un nuevo informe especifico. |
| `.opencode/opencode.json` se vuelve obsoleto si se desactiva OpenCode | AGENTS.md define el protocolo: vaciar a `$schema` o borrar, mas restaurar `.opencode/DISABLED.md`. |

## 9. Pasos posteriores sugeridos

1. Reiniciar OpenCode para que cargue la nueva configuracion (el config no se recarga en caliente).
2. Verificar que el cliente reconoce los 3 MCPs en el listado de herramientas disponibles.
3. Ejecutar una tarea pequena (por ejemplo, una consulta a `context7` sobre una libreria usada en el repo) para confirmar el flujo end-to-end.
4. Si operacion requiere cuota elevada o autenticacion para Context7, inyectar variables de entorno del cliente sin volver a tocar la estructura del config.
5. Si en el futuro Copilot deja de ser la IA primaria, abrir un nuevo informe de reordenamiento y actualizar AGENTS.md segun el protocolo definido.

## 10. Referencias

- `AGENTS.md` — fuente maestra, seccion "AI Workflow Activo" y "Precedencia entre IAs y superficies".
- `.github/copilot-instructions.md` — bootstrap agnostico de IA, vigente.
- `.opencode/opencode.json` — declaracion explicita de OpenCode, vigente.
- `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md` — addendum historico que origino los 3 MCPs que se restauran.
- `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md` — catalogo activo de skills, intacto.
- `https://opencode.ai/config.json` — schema autoritativo de la configuracion.
- `a24fa30 chore: simplificar gobernanza IA — Copilot activo; Claude/OpenCode pasivos` — commit que dejo a OpenCode en modo contingencia y que este informe revierte de forma controlada.
