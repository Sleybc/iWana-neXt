# LAUNCH — WEB-CENTRO-CONTROL · Pulso de plataforma · Fase 2

**Plan:** `docs/plans/2026-11-21-web-centro-control-pulso-plataforma.md` · **Dirección:** v1.1 §5 P1 y P3 · **Encargo:** `docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2-v1.0.md`
**Fase:** 2 — tendencia, deltas y equipo interno · **Gates:** G6 Fase 1 · contratos P1, P3 y P3b congelados en `packages/shared`
**Bloqueos abiertos:** ninguno

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §A | `nestjs-expert`, `postgresql`, `openapi-spec-generation`, `testing-patterns` | Implementa P1, P3, P3b |
| 2 | `fe-platform` | §B | `core-components`, `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | Consume P1, P3, P3b |
| 3 | `sr-qa` | §C | `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence` | CA-PP2-01…07 |

**Secuencia:** los tres en paralelo contra los contratos congelados: §A `apps/api`, §B `apps/web/src`, §C solo `e2e/`. Descartadas: `database-migration` (sin migración), `brainstorming` (diseño aprobado).
**Cierre:** paso de cierre del encargo → `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer` → G6 → commit local, sin push.

---

### Bloque copiar-pegar

> **[1 · sr-backend]** Actúa como `sr-backend`. Lee `AGENTS.md`, el plan, la dirección y tu encargo `docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2-v1.0.md` §Contratos y §A. Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `postgresql`, `openapi-spec-generation`, `testing-patterns`. Solo schema `public`, sin migraciones ni `apps/web`. Cierras con typecheck, lint, jest e integración (`DB_NAME=test`) de `@iwana/api` con conteo real. Reporta archivos, evidencia y deuda.
>
> **[2 · fe-platform]** Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, la dirección, el prototipo y tu encargo §Contratos y §B. Antes de codificar lee los `SKILL.md` de `core-components`, `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns`. Sin `apps/api` ni `packages/shared`; P2 y P4 no se montan. Cierras con typecheck, lint y jest de `@iwana/web` con conteo real. Reporta archivos, evidencia y deuda.
>
> **[3 · sr-qa]** Actúa como `sr-qa`. Lee `AGENTS.md`, el plan, la dirección y tu encargo §Contratos, §C y CA-PP2. Antes de codificar lee los `SKILL.md` de `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence`. Solo `e2e/`. Cierras con `playwright.web.config.ts` y axe en verde con conteo real. Reporta archivos, evidencia y deuda.
