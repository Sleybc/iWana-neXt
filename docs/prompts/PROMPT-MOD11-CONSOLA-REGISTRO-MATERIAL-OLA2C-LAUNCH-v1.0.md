# LAUNCH — MOD11 · Registro compacto · Ola 2c (F3: identificación del equipo)

**Plan:** `docs/plans/2026-10-11-mod11-consola-registro-material.md` · **Encargo:** `PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`, adenda 4
**Origen:** el CTO no distingue el serial ni la MAC al registrar. El serial se muestra, pero no destaca. La MAC no se muestra nunca y no hay datos de MAC. Los dos requisitos de material comparten el botón «Registrar equipo instalado».

| # | Subagente | Encargo (adenda 4) | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `fe-platform` | §F3: serial destacado, línea de MAC, resumen en el pie y botón según la etiqueta del requisito | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `testing-patterns` |

**Siguiente:** con F3 en GO, se cierra el frente y se propone el commit.

---

### Bloque copiar-pegar — `fe-platform` (F3)

> Actúa como `fe-platform`. Lee `AGENTS.md`, la **adenda 4** de `docs/prompts/PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`, la spec UX v1.4 §16 y el contrato de `RadioCardGroup`. Lee los `SKILL.md` de la tabla.
> En `ExecutionOrderMaterialAction.tsx`:
> - la tarjeta muestra el **serial** como título en `font-mono` y con más peso, y debajo «MAC {mac}» o «MAC no registrada», antes de la referencia y de «SKU · estado»;
> - el pie fijo resume «{serial} · MAC {mac}» sobre «Registrar equipo {serial}».
> En `execution-order-actions.ts`, `requirementActionLabel` usa la etiqueta del requisito del snapshot («Registrar materiales usados en la instalación»), sin atarse a las claves. No cambies el contrato de `RadioCardGroup`.
> Specs de los cuatro puntos. Gates: jest de `operations/` con `--no-cache` y `audit-ui.mjs`. Entrega `INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F3-v1.0.md`. Sin commit.
