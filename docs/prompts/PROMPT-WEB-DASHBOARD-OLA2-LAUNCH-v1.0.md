# LAUNCH — WEB-DASHBOARD · Ola 2

**Plan:** `docs/plans/2026-11-21-web-dashboard-auditoria-remediacion.md` v1.0 · **Encargo:** `docs/prompts/PROMPT-WEB-DASHBOARD-OLA2-v1.0.md` v1.0
**Ola:** 2 — `/health` mínimo e índices · **Gates:** G0-3 ✅ CTO 2026-11-21 · G6 de Ola 1 (solo para 3 y 4) · G4 emitido, contrafirma ⏳
**Bloqueos abiertos:** ninguno

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | encargo §A | `nestjs-expert`, `database-migration`, `observability-engineer`, `backend-security-coder` | encargo §Contrato `PublicHealth` v1.0, productor |
| 2 | `plat-ops` | encargo §B | `docker-expert` | — |
| 3 | `sr-qa` | encargo §C | `testing-patterns`, `iwana-test-evidence` | — |
| 4 | `fe-platform` | encargo §D | `frontend-dev-guidelines`, `testing-patterns` | `PublicHealth` v1.0, consumidor |

**Paralelo:** 1, 2, 3 y 4 en paralelo. Superficies: §A `apps/api` (sin `modules/tenant`) + `packages/shared` + migraciones public; §B `nginx/`; §C `DashboardClient.spec.tsx`; §D `apps/web/src/lib/api-client.ts` + `web-api-mocks.ts`. 1 no arranca hasta el commit local de 1A.
**Cierre de ola:** paso de cierre del encargo, con conteo real y `Cached: 0` → G6 → commit local, sin push.

---

### Bloque copiar-pegar

> **[1 · sr-backend]** Actúa como `sr-backend`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA2-v1.0.md` §Contrato y §A. Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `database-migration`, `observability-engineer`, `backend-security-coder`. Produces `PublicHealth` v1.0 tal como está congelado; si necesitas cambiarlo, `[BLOQUEO]` y para. Solo §A; no toques `modules/tenant`. Cierras con `@iwana/api` en verde, 503 probado y `EXPLAIN` de los índices. Reporta archivos, conteo real y deuda.
>
> **[2 · plat-ops]** Actúa como `plat-ops`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA2-v1.0.md` §B. Antes de tocar nada lee el `SKILL.md` de `docker-expert`. Solo §B. Cierras con `nginx -t` correcto en el contenedor. Reporta archivos, evidencia y deuda.
>
> **[3 · sr-qa]** Actúa como `sr-qa`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA2-v1.0.md` §C. Antes de codificar lee los `SKILL.md` de `testing-patterns` e `iwana-test-evidence`. Solo §C; no cambies código de producción. Cierras con `pnpm --filter @iwana/web test` en verde y conteo real. Reporta archivos, evidencia y deuda.
>
> **[4 · fe-platform]** Actúa como `fe-platform`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-WEB-DASHBOARD-OLA2-v1.0.md` §Contrato y §D. Antes de codificar lee los `SKILL.md` de `frontend-dev-guidelines` y `testing-patterns`. Consumes `PublicHealth` v1.0; no lo cambies. Solo §D. Cierras con typecheck, lint y jest de `@iwana/web` en verde. Reporta archivos, evidencia y deuda.
