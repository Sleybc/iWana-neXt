# LAUNCH — MOD05 · Fase 09 Ciclo de facturación · Ola 2 (B1b ∥ F1)

**Estado:** ejecutado el 2026-10-30. Sustituido por [v1.2](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.2.md) (Ola 3).

**Plan:** `docs/plans/2026-10-30-mod05-ciclo-facturacion.md` v1.0 · **PRD:** Fase 09 v1.1 (enmienda E1) · **Decisión:** ADR-102 (Aprobado, 2026-10-30) · Sustituye a [v1.0](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.0.md) (Ola 1)
**Gates:** G0 ✅ · G1 ✅ · G3 ✅ (B1) · G4 · G5 · G6 · G6.5
**Bloqueos abiertos:** ninguno. Enmienda E1 aprobada por el CTO el 2026-10-30: el «Próximo corte» lo calcula el servidor.
**Estado al arrancar:** spec UX lista; backend de B1 sin commitear (migración 167, activación, catálogo, agenda). El catálogo todavía no devuelve `nextCutoffDate`.
**Plantilla y fuentes:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md) · [plan](../plans/2026-10-30-mod05-ciclo-facturacion.md) · [PRD v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) · [encargo](PROMPT-MOD05-CICLO-FACTURACION-v1.0.md)

| # | Subagente | Encargo (`PROMPT-MOD05-CICLO-FACTURACION-v1.0.md`) | Skills a leer antes de trabajar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §B1b | `nestjs-expert`, `test-driven-development`, `iwana-test-evidence` | PRD v1.1 §7 `BillingCycleOption` |
| 2 | `fe-platform` | §F1 | `frontend-dev-guidelines`, `core-components`, `nextjs-app-router-patterns`, `system-vocabulary-review`, `testing-patterns` | PRD v1.1 §7 |

**Paralelo:** 1 y 2 a la vez; archivos disjuntos (`packages/shared` y `apps/api` vs. `apps/portal`).
**Cierre de ola:** CA-CF-13 con conteo real (B1b); CA-CF-10 y CA-CF-11 en verde y `audit-ui.mjs` en 0 (F1). Luego Ola 3 (Q1 ∥ V1 ∥ V2) y V3.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan, ADR-102, el PRD `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md` (enmienda E1) y tu encargo `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §B1b. Lee los `SKILL.md` de `nestjs-expert`, `test-driven-development` e `iwana-test-evidence`; `openapi-spec-generation` para la respuesta nueva. Añade `BillingCycleOptionSchema` a `@iwana/shared` y haz que `GET /crm/billing-cycles` devuelva `nextCutoffDate`, calculado en el servidor con la fecha local del tenant. No toques `apps/portal`. Sin `tenant_iwana`, sin `git stash`, no toques cambios ajenos ni commitees. Cierras con CA-CF-13 y el conteo real de tests ejecutados.

===== 2 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, el PRD Fase 09 v1.1, la spec `docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md` y tu encargo `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §F1. Lee los `SKILL.md` de `frontend-dev-guidelines`, `core-components`, `nextjs-app-router-patterns`, `system-vocabulary-review` y `testing-patterns`; `iwana-identity-ui-review` para la agenda. Implementa el diálogo «Activar servicio», los selectores de ciclo, «Próximo corte» y la agenda. La fecha sale del `nextCutoffDate` del catálogo: no calcules fechas en el navegador ni llames a `/tenants/me/settings`. En `api-client.ts` hay una línea ajena: no la toques. No commitees. Cierras con CA-CF-10, CA-CF-11 y `audit-ui.mjs` en 0.
