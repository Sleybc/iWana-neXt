# LAUNCH — MOD11 · Registro compacto · Ola 2d (F3b: serial o MAC)

**Plan:** `docs/plans/2026-10-11-mod11-consola-registro-material.md` · **Encargo:** `PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`, adenda 5
**Origen:** el CTO ve «MAC no registrada» en un equipo que sí tiene serial. La tarjeta debe mostrar los identificadores que existen y no los que faltan.

| # | Subagente | Encargo (adenda 5) | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `fe-platform` | §F3b: identificadores según la tabla de 4 casos, equipos sin serial deshabilitados con motivo y fuera los selectores descendientes | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `testing-patterns` |

**Siguiente:** con F3b en GO, se cierra el frente y se propone el commit.

---

### Bloque copiar-pegar — `fe-platform` (F3b)

> Actúa como `fe-platform`. Lee `AGENTS.md`, la **adenda 5** de `docs/prompts/PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md` y el contrato `docs/specs/2026-10-11-ui-radio-card-group-contrato-componente.md`. Lee los `SKILL.md` de la tabla.
> En `ExecutionOrderMaterialAction.tsx`, la tarjeta muestra solo los identificadores que existen, según la tabla de 4 casos de la adenda: serial y MAC, solo serial, solo MAC (deshabilitado con motivo) y ninguno (deshabilitado con motivo). Elimina «MAC no registrada» y deja de ocultar los equipos sin serial. Quita los selectores descendientes de la línea 415 y usa solo las props del contrato, con los identificadores en `meta`. Si el serial necesita tipografía mono en el título, repórtalo para `ds-owner` en lugar de forzarlo. El pie fijo muestra la MAC solo si existe.
> Specs de los 4 casos, de que no aparece «MAC no registrada» y de que no quedan selectores descendientes. Gates: jest de `operations/` con `--no-cache`, typecheck global y `audit-ui.mjs`. Entrega `INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F3B-v1.0.md`. Sin commit.
