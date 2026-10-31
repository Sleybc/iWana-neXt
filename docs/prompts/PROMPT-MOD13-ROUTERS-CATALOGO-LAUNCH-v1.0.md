# LAUNCH — MOD13 · Retiro de «Referencia LAN anterior» del catálogo

**Plan:** `docs/plans/2026-10-28-mod13-routers-retiro-columna-lan.md` v1.0 · **Encargo:** `docs/prompts/PROMPT-MOD13-ROUTERS-CATALOGO-v1.0.md` v1.0
**Spec:** `docs/specs/2026-10-26-mod13-interfaces-ux.md` v2.2 → v2.3
**Gates:** G1–G4 cerrados y no se reabren · G2 no se reabre (sin componente, token, estado ni copy nuevos) · G6.5 pendiente del SHA final
**Bloqueos abiertos:** ninguno
**Estado al arrancar (2026-10-28):** G6 PASS sobre árbol sin commit; la columna del catálogo y el bloque del formulario siguen presentes; el detalle conserva referencia y conversión. **D6 abierto: el campo no se retira.**
**No re-despachar:** O0–O2, E7_resume, CA-R12/G6 ni el detalle del router. Esta ola es solo catálogo y formulario.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `prod-ux` | encargo §2 y §4 — spec v2.3 | `system-vocabulary-review`, `iwana-identity-ui-review`, `docs-architect` | Spec UX v2.3 |
| 2 | `fe-platform` | encargo §2, §4 y §5 — catálogo y formulario | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `tailwind-patterns`, `testing-patterns` | API v1.2, sin cambio |

**Paralelo:** 1 y 2 en paralelo; archivos disjuntos.
**Secuencia:** si `prod-ux` encuentra contradicción en 13.13 V2, emite `[CONSULTA]`; `fe-platform` no espera.
**Cierre:** spec v2.3 publicada + diff + evidencia real de la suite focalizada (`Cached: 0`) y `audit-ui.mjs`.

---

### Bloque copiar-pegar

> Actúa como AI-EM-ARCH en modo Orchestrator. Lee `AGENTS.md`, el plan `docs/plans/2026-10-28-mod13-routers-retiro-columna-lan.md` y el encargo `docs/prompts/PROMPT-MOD13-ROUTERS-CATALOGO-v1.0.md`; después despacha los dos bloques del launcher.
> Antes de escribir, cada subagente lee sus `SKILL.md` en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool.
> Alcance: retirar «Referencia LAN anterior» del catálogo y del formulario de edición; el detalle no se toca. Fuera de alcance: el campo `lan_interface`, D6, contratos, entidad, migraciones y el texto «Convertida en una interfaz registrada.».
> No reabras gates cerrados ni re-despaches O0–O2, E7_resume o CA-R12/G6.
> Cierras cuando la spec v2.3 esté publicada, el diff aplicado y la suite focalizada pase con conteo real. Reporta rutas, evidencia y deuda nueva por severidad.
