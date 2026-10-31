# LAUNCH — `privacy` · Textos legales · B8 Historial de versiones

**Plan:** `docs/plans/2026-10-29-privacy-textos-legales.md` · **Spec:** `docs/specs/2026-10-29-privacy-textos-legales.md` **v1.3** (C7) · **Encargo:** `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-HISTORIAL-v1.0.md`
**Gates:** fase con G6 y G6.5 GO (`05558a7a`); B5 cerrado en desarrollo. B8 es un ajuste de UI sin cambio de contrato.
**Bloqueos abiertos:** ninguno.
**Estado al arrancar (2026-10-30):**
- En el tenant `iwana` de desarrollo hay 3 versiones vigentes y ninguna reemplazada; las filas `v1` del ensayo se borraron.
- Para probar el historial se usan datos sintéticos en las pruebas. **No se publica nada en ningún tenant.**
- El árbol tiene documentos de B5 y obra de MOD13 sin commitear: no se tocan.

**No re-despachar:** B0–B7, ni la sección de finalidades, ni los consumidores.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| B8 | `fe-platform` | encargo §1–§7 | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `core-components`, `system-vocabulary-review`, `testing-patterns`, `iwana-test-evidence`; apoyo `wcag-audit-patterns` | spec v1.3 §3 C7 |

**Paralelo:** ninguno; es un solo bloque.
**Cierre:** CA-LT-14 a 17 + `audit-ui.mjs` sin P0/P1 + typecheck y lint con código 0 + suite completa del portal sin caché, todo en `INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md`. Después, AI-EM-ARCH verifica en el navegador y commitea.

---

### Bloque copiar-pegar

> Actúa como `fe-platform`. Lee `AGENTS.md`, la spec `docs/specs/2026-10-29-privacy-textos-legales.md` v1.3 §3 C7 y tu encargo `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-HISTORIAL-v1.0.md`.
> Antes de codificar lee los `SKILL.md` de `frontend-dev-guidelines`, `iwana-identity-ui-review`, `core-components`, `system-vocabulary-review`, `testing-patterns` e `iwana-test-evidence` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Solo cambias `LegalTextsSurface` y sus pruebas. Reutilizas `SectionAccordion` de `@iwana/ui`. No toques el API, `packages/shared`, `@iwana/ui`, los consumidores ni las finalidades. Si C7 no cabe así, emite `[BLOQUEO]` y para.
> No publiques textos en ningún tenant, no commitees ni toques los cambios sin commitear de MOD13 y B5.
> Reporta en `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md` (verifica que la ruta esté libre), con la suite completa del portal sin caché y conteo real.
