# LAUNCH — `privacy` · Habeas Data · Fase 1a · Ola 4a-bis

**Fecha:** 2026-10-14 · **Estado:** Vigente · **Plan:** `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.5 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §4 (disposición del NO-GO y A25)
**Ola que lanza:** correcciones del NO-GO de la Ola 4a (R1–R3), luego QA (R4) y re-verificación · **Gates:** G6 al cerrar
**Precondición (CTO, pendiente):** `pnpm db:backup` y `pnpm db:migrate:all` sobre `dbiw`; sin esto R4 no arranca. PostgreSQL en `127.0.0.1:5433`. D-F1A y D-POT resueltos; checkpoint commiteado.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| R1 | `sr-backend` | v1.3 §4 R1 (SEC-01 y envolturas) | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | `INFORME-PRIVACY-FASE-1A-R1-v1.0.md` |
| R2 | `sr-backend` | v1.3 §4 A25 y R2 | `nestjs-expert`, `backend-security-coder`, `postgresql` | `INFORME-PRIVACY-FASE-1A-R2-v1.0.md` |
| R3 | `fe-platform` | v1.3 §4 R3 | `frontend-dev-guidelines`, `typescript-expert` | `INFORME-PRIVACY-FASE-1A-R3-v1.0.md` |
| R4 | `sr-qa` | v1.3 §4 R4, tras R1–R3 | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion`; apoyo `e2e-testing-patterns`, `playwright-skill` | `INFORME-PRIVACY-FASE-1A-QA-v1.1.md` |

**Paralelo:** R1 ∥ R2 ∥ R3, con propiedad disjunta; R4 después. Luego la re-verificación de solo lectura (`sec-eng`, `boundary-reviewer`, `contract-drift-reviewer`, `gate-verifier`, `docs-governance`), con salida `INFORME-PRIVACY-FASE-1A-{SEC,BOUNDARY,DRIFT,GATES,DOCS}-v1.1.md`.
**Cierre de ola:** AI-EM-ARCH consolida `INFORME-PRIVACY-FASE-1A-CIERRE-G6-v1.0.md` y decide G6.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-094, el plan v1.5, los informes `docs/informes/INFORME-PRIVACY-FASE-1A-*-v1.0.md` y tu encargo `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §4 bloque `{R#}`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos fuera de lo que fija §4; si lo necesitas, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad. Fuera de alcance: Q8.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}` con conteo real sin caché y deuda nueva por severidad.
