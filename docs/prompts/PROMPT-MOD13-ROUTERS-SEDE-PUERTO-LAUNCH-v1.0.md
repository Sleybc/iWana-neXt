# LAUNCH — MOD13 · Consumidor WFM del puerto de Organización

**Plan:** `docs/plans/2026-10-28-mod13-routers-retiro-columna-lan.md` v1.1 §6 · **Encargo:** `docs/prompts/PROMPT-MOD13-ROUTERS-SEDE-PUERTO-v1.0.md`
**Gates:** G1–G4 de MOD13 cerrados y no se reabren; G6 no se reabre. Este bloque destraba el typecheck de API, que exigen G6.5 de MOD13 y G6 de privacy · textos legales.
**Bloqueos abiertos:** ninguno.
**Estado al arrancar (2026-10-29):** `pnpm --filter @iwana/api typecheck` sale con código 2 por un único `TS2352` en `wfm-organization-sites.adapter.spec.ts:7`. El puerto con `findRouterSummariesByIds` (§8.8, sin commitear) es el contrato vigente. El árbol también tiene la obra de privacy sin commitear: no se toca.
**No re-despachar:** B1 y B2 de este plan, §8.8, ni nada de privacy.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| B3 | `sr-backend` | encargo §1–§6 | `nestjs-expert`, `testing-patterns`, `iwana-test-evidence` | `OrganizationSiteReadPort` tal como está en el árbol (§8.8) |

**Paralelo:** ninguno; es un solo bloque.
**Cierre:** typecheck de API con código 0 + specs de WFM, `organization` y `network-catalog` sin caché + §8.9 del informe MOD13.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-28-mod13-routers-retiro-columna-lan.md` v1.1 §6 y tu encargo `docs/prompts/PROMPT-MOD13-ROUTERS-SEDE-PUERTO-v1.0.md`.
> Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `testing-patterns` e `iwana-test-evidence` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Solo completas el mock de WFM del puerto de Organización. No cambies el puerto, su adaptador, `network` ni privacy, y no relajes el tipo del mock. Si el typecheck revela otro error, emite `[BLOQUEO]` y para.
> No commitees ni reviertas cambios ajenos. Añade la §8.9 al informe `docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md` con el código de salida del typecheck y el conteo real sin caché.
