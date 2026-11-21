# LAUNCH — WEB-CENTRO-CONTROL · Pulso de plataforma · Fase 3

**Plan:** `docs/plans/2026-11-21-web-centro-control-pulso-plataforma.md` · **Dirección:** v1.1 §5 P2 · **Encargo:** `docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3-v1.0.md`
**Fase:** 3 — disponibilidad de 30 días y colas · **Gates:** G6 Fase 2 (0f6d1341) · contrato P2 congelado en `packages/shared/src/dto/platform-health-history.dto.ts`
**Bloqueos abiertos:** ninguno

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §A | `nestjs-expert`, `database-migration`, `bullmq-specialist`, `postgresql`, `testing-patterns` | Implementa P2 |
| 2 | `plat-ops` | §B, solo si §A lo pide | `docker-expert` | Variables y red worker→API |
| 3 | `fe-platform` | §C | `core-components`, `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | Consume P2 |
| 4 | `sr-qa` | §D | `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence` | CA-PP3-01…05 |

**Secuencia:** 1, 3 y 4 en paralelo contra el contrato congelado (§A `apps/api`, `apps/worker`, `packages/database`; §C `apps/web/src`; §D `e2e/`). 2 se despacha si §A emite `[CONSULTA]` de infraestructura. Descartadas: `brainstorming` (diseño aprobado), `iwana-tenant-migration` (la tabla es de `public`).
**Cierre:** paso de cierre del encargo → `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer` → G6 → commit local, sin push.

---

### Bloque copiar-pegar

> **[1 · sr-backend]** Actúa como `sr-backend`. Lee `AGENTS.md`, el plan, la dirección y tu encargo `docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3-v1.0.md` §Diseño, §Contrato y §A. Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `database-migration`, `bullmq-specialist`, `postgresql`, `testing-patterns`. Sin datos de empresa ni `apps/web`. Si hace falta variable o red nueva, `[CONSULTA]` a AI-EM-ARCH para `plat-ops`. Cierras con typecheck, lint, jest e integración (`DB_NAME=test`) de `@iwana/database`, `@iwana/api` y `@iwana/worker` con conteo real.
>
> **[2 · plat-ops]** Actúa como `plat-ops`. Lee `AGENTS.md` y el encargo §B. Antes de actuar lee el `SKILL.md` de `docker-expert`. Solo la variable o red que pida §A, en Compose y `.env.example`. Reporta archivos y verificación.
>
> **[3 · fe-platform]** Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, la dirección, el prototipo y tu encargo §Contrato y §C. Antes de codificar lee los `SKILL.md` de `core-components`, `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns`. Sin `apps/api` ni `packages/shared`; P4 no se monta. Cierras con typecheck, lint y jest de `@iwana/web` con conteo real.
>
> **[4 · sr-qa]** Actúa como `sr-qa`. Lee `AGENTS.md`, el plan y tu encargo §Contrato, §D y CA-PP3. Antes de codificar lee los `SKILL.md` de `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence`. Solo `e2e/`. Cierras con `e2e/playwright.web.config.ts` y axe con conteo real.
