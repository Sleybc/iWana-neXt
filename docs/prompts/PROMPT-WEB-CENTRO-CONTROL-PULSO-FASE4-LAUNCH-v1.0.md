# LAUNCH — WEB-CENTRO-CONTROL · Pulso de plataforma · Fase 4

**Plan:** `docs/plans/2026-11-21-web-centro-control-pulso-plataforma.md` · **ADR:** `docs/adrs/ADR-114-Uso-por-Empresa-en-la-Consola-de-Plataforma.md` (aprobado 2026-11-21) · **Encargo:** `docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4-v1.0.md`
**Fase:** 4 — uso por empresa · **Gates:** D3 y ADR-114 ✅ CTO · contrato P4 congelado en `packages/shared/src/dto/tenant-usage.dto.ts`
**Bloqueos abiertos:** ninguno

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §A | `nestjs-expert`, `database-migration`, `bullmq-specialist`, `backend-security-coder`, `testing-patterns` | Implementa P4 |
| 2 | `fe-platform` | §B | `core-components`, `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | Consume P4 |
| 3 | `sr-qa` | §C | `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence` | CA-PP4-01…04 |
| 4 | `sec-eng` | Verificación de §7 | `security-auditor` | Condiciones 1–7 |

**Secuencia:** 1, 2 y 3 en paralelo contra el contrato; 4 al terminar 1. Descartadas: `iwana-tenant-migration` (tabla de `public`), `brainstorming`.
**Cierre:** paso de cierre del encargo → G6 → commit local, sin push.

---

### Bloque copiar-pegar

> **[1 · sr-backend]** Actúa como `sr-backend`. Lee `AGENTS.md`, ADR-114 completo (§7 incluido) y tu encargo §Contrato y §A. Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `database-migration`, `bullmq-specialist`, `backend-security-coder`, `testing-patterns`. Si CRM no puede exponer el conteo sin romper su boundary, `[BLOQUEO]`. Cierras con typecheck, lint, jest e integración de `@iwana/db`, `@iwana/api`, `@iwana/worker` con conteo real.
>
> **[2 · fe-platform]** Actúa como `fe-platform`. Lee `AGENTS.md`, la dirección, el prototipo y tu encargo §Contrato y §B. Antes de codificar lee los `SKILL.md` de `core-components`, `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns`. Solo `apps/web/src`. Cierras con typecheck, lint y jest de `@iwana/web` con conteo real.
>
> **[3 · sr-qa]** Actúa como `sr-qa`. Lee `AGENTS.md` y tu encargo §C y CA-PP4. Antes de codificar lee los `SKILL.md` de `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence`. Solo `e2e/`. Cierras con `e2e/playwright.web.config.ts` y axe con conteo real.
>
> **[4 · sec-eng]** Actúa como `sec-eng`. Lee ADR-114 §7 y el diff de §A. Antes de dictaminar lee el `SKILL.md` de `security-auditor`. Verifica las condiciones 1–7 con archivo:línea y emite veredicto.
