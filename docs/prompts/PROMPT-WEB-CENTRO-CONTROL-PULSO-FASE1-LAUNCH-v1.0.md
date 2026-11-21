# LAUNCH — WEB-CENTRO-CONTROL · Pulso de plataforma · Fase 1

**Plan:** `docs/plans/2026-11-21-web-centro-control-pulso-plataforma.md` v1.0 · **Dirección:** `docs/specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md` v1.1 · **Prototipo:** `docs/prototipo/prototipo_web_centro_control.html`
**Fase:** 1 — recomposición sin backend · **Gates:** G0 D1 y D2 ✅ CTO 2026-11-21 · G4 emitido, contrafirma ⏳ de cada receptor
**Bloqueos abiertos:** ninguno

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `ds-owner` | `docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-v1.0.md` §A | `core-components`, `iwana-identity-ui-review`, `tailwind-patterns` | Produce el contrato DS v1.3 |
| 2 | `fe-platform` | mismo prompt §B | `core-components`, `frontend-dev-guidelines`, `tailwind-patterns`, `system-vocabulary-review`, `testing-patterns` | Consume v1.3 congelado |
| 3 | `sr-qa` | mismo prompt §C | `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence` | CA-PP-01…09 |

**Secuencia:** 1 primero. Con v1.3 congelado, 2 y 3 en paralelo: §B `packages/ui`, `apps/web/src`, `apps/portal/src`; §C solo `e2e/`.
**Cierre:** el paso de cierre del prompt → G6 → commit local, sin push.

---

### Bloque copiar-pegar

> **[1 · ds-owner]** Actúa como `ds-owner`. Lee `AGENTS.md`, el plan `docs/plans/2026-11-21-web-centro-control-pulso-plataforma.md`, la dirección `docs/specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md` y tu encargo `docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-v1.0.md` §Composición y §A. Antes de actuar lee los `SKILL.md` de `core-components`, `iwana-identity-ui-review`, `tailwind-patterns`. Produces la sección v1.3, aditiva, del contrato `docs/specs/2026-11-21-web-portal-dashboard-consolidacion-ds-contrato.md`. Solo §A: sin código ni tokens nuevos. Cierras con el contrato congelado y el veredicto D4. Reporta archivos, decisiones y deuda.
>
> **[2 · fe-platform]** Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, la dirección, el prototipo `docs/prototipo/prototipo_web_centro_control.html` y tu encargo `docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-v1.0.md` §Composición y §B. Antes de codificar lee los `SKILL.md` de `core-components`, `frontend-dev-guidelines`, `tailwind-patterns`, `system-vocabulary-review`, `testing-patterns`. Consumes el contrato DS v1.3 tal como está congelado; si no alcanza, `[BLOQUEO]` y para. Solo §B: sin `apps/api` ni `packages/shared`, y nada de P1–P4. Cierras con typecheck, lint y jest de `@iwana/ui`, `@iwana/web` y `@iwana/portal` en verde con conteo real. Reporta archivos, evidencia y deuda.
>
> **[3 · sr-qa]** Actúa como `sr-qa`. Lee `AGENTS.md`, el plan, la dirección y tu encargo `docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-v1.0.md` §Composición, §C y los criterios CA-PP. Antes de codificar lee los `SKILL.md` de `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence`. Solo §C: no edites `DashboardClient.spec.tsx`. Cierras con la E2E de la consola, axe `wcag22aa` y la E2E del inicio del portal en verde, con conteo real. Reporta archivos, evidencia y deuda.
