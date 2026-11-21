# Plan — Remediación de la auditoría de `/dashboard` (apps/web)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Estado:** G0-1 y G0-2 ✅ CTO 2026-11-21 — Ola 1 lanzable
**Fuente:** [INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md](../informes/INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md) (IDs de hallazgo del §2)

## Olas

| Ola | Objetivo | Bloques | Depende de | Gate de entrada |
| --- | --- | --- | --- | --- |
| 1 | Cifras reales (P0) y limpieza | 1A sr-backend, 1B fe-platform, 1C sr-qa, en paralelo contra `TenantStatusSummary` v1.0 | — | G0-1, G0-2 |
| 2 | `/health` mínimo e índices | 2A sr-backend (H-1…H-3, E-4, V-2), 2B plat-ops (`limit_req` en nginx para `/health`), 2C sr-qa (Q-2/Q-3 de `DashboardClient.spec` sobre el código de la Ola 1) | G6 de Ola 1 (2C); 2A y 2B no dependen de nada | G0-3 |
| 3 | Consolidación de design system web + portal | 3A ds-owner (contratos U-1…U-4, propuesta U-5), 3B sr-backend o fe-platform (U-6 formateador en `@iwana/shared`, C-1 `ListMeta`), 3C fe-platform (adopción en las dos apps) | 3C depende de 3A congelado | G0-4 para U-5 |

**Ruta crítica:** 1A → G6 de la Ola 1 → push. La Ola 2 (2A/2B) puede correr junto a la Ola 1: no comparte superficie con 1A más allá de `apps/api`, y solo toca `modules/health` y migraciones públicas.
**Restricción de secuencia:** 1A y 2A son ambos de sr-backend. Van en sesiones distintas, pero 2A no toca `modules/tenant` hasta que se publique 1A.

## Matriz de dispatch

| Bloque | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| 1A | `sr-backend` | `nestjs-expert`, `postgresql`, `openapi-spec-generation`, `testing-patterns` | `backend-security-coder` (si cambia guards) | `database-migration`: sin índices en esta ola · `bullmq-specialist`: sin colas | `pnpm --filter @iwana/api test` con Postgres real; `boundary-reviewer` |
| 1B | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | `wcag-audit-patterns` (solo landmarks y títulos) · `auth-implementation-patterns` (al tocar `AuthProvider`, L-13) | `core-components`, `tailwind-patterns`, `iwana-identity-ui-review`: sin cambio visual ni de primitives | `pnpm --filter @iwana/web typecheck lint test`; `test-change-reviewer` |
| 1C | `sr-qa` | `e2e-testing-patterns`, `wcag-audit-patterns`, `testing-patterns` | `iwana-test-evidence` (al cerrar) | `test-driven-development`: no es feature nueva | `playwright.web.config.ts` en verde |
| 2A | `sr-backend` | `nestjs-expert`, `database-migration`, `observability-engineer`, `backend-security-coder` | `postgresql` (diseño de índices) | `iwana-tenant-migration`: los índices son del schema public | `pnpm --filter @iwana/api test`; healthcheck de Docker con 503 |
| 2B | `plat-ops` | `docker-expert` | — | `monorepo-architect`: no toca turbo | `nginx -t` en el contenedor |
| 2C | `sr-qa` | `testing-patterns` | `iwana-test-evidence` | `e2e-testing-patterns`: el E2E se cerró en 1C | `pnpm --filter @iwana/web test` |
| 3A | `ds-owner` | `core-components`, `iwana-identity-ui-review`, `tailwind-patterns` | `wcag-audit-patterns` (contraste AA de los tonos) | `frontend-dev-guidelines`: no escribe pantalla | spec en `docs/specs/` congelada y, en el mismo acto, cláusulas superadas marcadas en el [contrato DS 2026-08-11](../specs/2026-08-11-web-centro-control-portada-senal-ds-contrato.md) (líneas 33, 56-58, 82 y 177) |
| 3B | `fe-platform` | `i18n-localization`, `typescript-expert` | `system-vocabulary-review` (formato de fecha visible) | `openapi-spec-generation`: C-1 lo abre sr-backend si se aprueba | `pnpm --filter @iwana/shared test` |
| 3C | `fe-platform` | `core-components`, `tailwind-patterns`, `frontend-dev-guidelines` | `iwana-identity-ui-review` (revisión P0–P3) | `brainstorming`: el diseño viene de 3A | `audit-ui` del repo, si aplica; E2E web y portal |

Todas las skills se verificaron en disco el 2026-11-21. La Ola 1 y la Ola 2 (G0-3 ✅ 2026-11-21; [encargo](../prompts/PROMPT-WEB-DASHBOARD-OLA2-v1.0.md), [launcher](../prompts/PROMPT-WEB-DASHBOARD-OLA2-LAUNCH-v1.0.md), que añade el bloque 2D de fe-platform para el consumidor web de `/health`) tienen encargo (G4) y launcher; la Ola 3 los recibe cuando 3A esté congelado.

## Lanzamiento

Espejo de [PROMPT-WEB-DASHBOARD-OLA1-LAUNCH-v1.0.md](../prompts/PROMPT-WEB-DASHBOARD-OLA1-LAUNCH-v1.0.md). **El archivo es la fuente y prevalece si divergen.**

### Bloque copiar-pegar

> **[1 · sr-backend]** Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-11-21-web-dashboard-auditoria-remediacion.md` y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA1-v1.0.md` §Contrato y §A. Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `postgresql`, `openapi-spec-generation`, `testing-patterns`. Produces `TenantStatusSummary` v1.0 tal como está congelado; si necesitas cambiarlo, `[BLOQUEO]` y para. Solo §A. Cierras cuando el servicio da conteos exactos con más de 100 empresas contra Postgres real. Reporta archivos, conteo real de tests y deuda.
>
> **[2 · fe-platform]** Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, el informe `docs/informes/INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md` §2 y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA1-v1.0.md` §Contrato y §B. Antes de codificar lee los `SKILL.md` de `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns`. Consumes `TenantStatusSummary` v1.0 con un mock derivado del tipo compartido; no lo cambies. Solo §B; no toques el aspecto visual ni `@iwana/ui`. Cierras con typecheck, lint y jest de `@iwana/web` en verde y conteo real. Reporta archivos, evidencia y deuda.
>
> **[3 · sr-qa]** Actúa como `sr-qa`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA1-v1.0.md` §Contrato y §C. Antes de codificar lee los `SKILL.md` de `e2e-testing-patterns`, `wcag-audit-patterns`, `testing-patterns`. Consumes `TenantStatusSummary` v1.0; no lo cambies. Solo §C; no edites `DashboardClient.spec.tsx`. Cierras con los specs de §C en verde y conteo real. Reporta archivos, evidencia y deuda.
