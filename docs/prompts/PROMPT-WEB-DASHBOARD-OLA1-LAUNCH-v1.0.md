# LAUNCH — WEB-DASHBOARD · Ola 1

**Plan:** `docs/plans/2026-11-21-web-dashboard-auditoria-remediacion.md` v1.0 · **Informe:** `docs/informes/INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md` v1.0 · **Spec:** `docs/specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md` v1.0 (aclaración 2026-11-21)
**Ola:** 1 — cifras reales y limpieza · **Gates:** G0-1 y G0-2 ✅ CTO 2026-11-21 · G4 emitido, contrafirma ⏳ de cada receptor al verificar el DoR
**Bloqueos abiertos:** ninguno

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-WEB-DASHBOARD-OLA1-v1.0.md` §A | `nestjs-expert`, `postgresql`, `openapi-spec-generation`, `testing-patterns` | `docs/prompts/PROMPT-WEB-DASHBOARD-OLA1-v1.0.md` §Contrato `TenantStatusSummary` v1.0, productor |
| 2 | `fe-platform` | mismo prompt §B | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | ídem, consumidor (mock) |
| 3 | `sr-qa` | mismo prompt §C | `e2e-testing-patterns`, `wcag-audit-patterns`, `testing-patterns` | ídem, consumidor (mock) |

**Paralelo:** 1, 2 y 3 en paralelo contra el contrato. Superficies disjuntas: §A `apps/api` + `packages/shared`; §B `apps/web/src`, salvo `SystemStatusPanel.spec`; §C `e2e/` + `SystemStatusPanel.spec`. Si §A cambia el contrato, `[BLOQUEO]` a AI-EM-ARCH.
**Cierre de ola:** el paso de cierre del prompt, con conteo real y `Cached: 0`; chips = `GROUP BY status` en vivo → G6 → commit local, sin push (push en el tren, ADR-107 D2).

---

### Bloque copiar-pegar

> **[1 · sr-backend]** Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-11-21-web-dashboard-auditoria-remediacion.md` y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA1-v1.0.md` §Contrato y §A. Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `postgresql`, `openapi-spec-generation`, `testing-patterns`. Produces `TenantStatusSummary` v1.0 tal como está congelado; si necesitas cambiarlo, `[BLOQUEO]` y para. Solo §A. Cierras cuando el servicio da conteos exactos con más de 100 empresas contra Postgres real. Reporta archivos, conteo real de tests y deuda.
>
> **[2 · fe-platform]** Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, el informe `docs/informes/INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md` §2 y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA1-v1.0.md` §Contrato y §B. Antes de codificar lee los `SKILL.md` de `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns`. Consumes `TenantStatusSummary` v1.0 con un mock derivado del tipo compartido; no lo cambies. Solo §B; no toques el aspecto visual ni `@iwana/ui`. Cierras con typecheck, lint y jest de `@iwana/web` en verde y conteo real. Reporta archivos, evidencia y deuda.
>
> **[3 · sr-qa]** Actúa como `sr-qa`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA1-v1.0.md` §Contrato y §C. Antes de codificar lee los `SKILL.md` de `e2e-testing-patterns`, `wcag-audit-patterns`, `testing-patterns`. Consumes `TenantStatusSummary` v1.0; no lo cambies. Solo §C; no edites `DashboardClient.spec.tsx`. Cierras con los specs de §C en verde y conteo real. Reporta archivos, evidencia y deuda.
