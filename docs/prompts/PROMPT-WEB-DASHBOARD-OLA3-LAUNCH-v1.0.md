# LAUNCH — WEB-DASHBOARD · Ola 3

**Plan:** `docs/plans/2026-11-21-web-dashboard-auditoria-remediacion.md` v1.0 · **Encargo:** `docs/prompts/PROMPT-WEB-DASHBOARD-OLA3-v1.0.md` v1.0
**Ola:** 3 — consolidación DS · **Gates:** 3A congelado ✅ · G0-4 ✅ CTO 2026-11-21 · G4 emitido, contrafirma ⏳
**Bloqueos abiertos:** ninguno

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `fe-platform` | encargo §B | `i18n-localization`, `typescript-expert`, `testing-patterns` | encargo §`formatRelativeTime` v1.0 |
| 2 | `fe-platform` | encargo §C | `core-components`, `tailwind-patterns`, `frontend-dev-guidelines`, `iwana-identity-ui-review` | `docs/specs/2026-11-21-web-portal-dashboard-consolidacion-ds-contrato.md` v1.0 |

**Paralelo:** 1 y 2 en paralelo. §B toca `packages/shared` y las funciones de fecha relativa; §C toca `packages/ui`, `globals.css` y el resto de los consumidores. §C no toca las líneas de formato de fecha.
**Cierre de ola:** el paso de cierre del encargo, con conteo real y `Cached: 0` → G6 → commit local, sin push.

---

### Bloque copiar-pegar

> **[1 · fe-platform §B]** Actúa como `fe-platform`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA3-v1.0.md` §Contratos y §B. Antes de codificar lee los `SKILL.md` de `i18n-localization`, `typescript-expert`, `testing-patterns`. Produces `formatRelativeTime` v1.0 tal como está congelado; si necesitas cambiarlo, `[BLOQUEO]` y para. Solo §B. Cierras con `@iwana/shared`, `@iwana/web` y `@iwana/portal` en verde y conteo real. Reporta archivos, evidencia y deuda.
>
> **[2 · fe-platform §C]** Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA3-v1.0.md` §C y el contrato `docs/specs/2026-11-21-web-portal-dashboard-consolidacion-ds-contrato.md`. Antes de codificar lee los `SKILL.md` de `core-components`, `tailwind-patterns`, `frontend-dev-guidelines`, `iwana-identity-ui-review`. Consumes el contrato DS v1.0 sin cambiarlo; si no alcanza, `[BLOQUEO]` y para. Solo §C. Cierras con `@iwana/ui`, `@iwana/web` y `@iwana/portal` en verde y conteo real. Reporta archivos, evidencia y deuda.
