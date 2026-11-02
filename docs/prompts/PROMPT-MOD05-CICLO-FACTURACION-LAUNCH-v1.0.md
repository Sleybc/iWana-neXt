# LAUNCH — MOD05 · Fase 09 Ciclo de facturación · Ola 1 (P1 ∥ B1)

**Estado:** ejecutado el 2026-10-30. Sustituido por [v1.1](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.1.md) (Ola 2).

**Plan:** `docs/plans/2026-10-30-mod05-ciclo-facturacion.md` v1.0 · **PRD:** Fase 09 v1.0 · **Decisión:** ADR-102 (Aprobado, 2026-10-30)
**Gates:** G0 ✅ · G1 ✅ · G3 · G4 · G5 · G6 · G6.5
**Bloqueos abiertos:** ninguno. G0 aprobado por el CTO el 2026-10-30 (D-F9-1 a D-F9-3 = a).
**Estado al arrancar:** solo documentación; ningún código de la fase existe. El corte automático (D6) no se construye.
**Plantilla y fuentes:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md) · [plan](../plans/2026-10-30-mod05-ciclo-facturacion.md) · [PRD](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.0.md) · [encargo](PROMPT-MOD05-CICLO-FACTURACION-v1.0.md)

| # | Subagente | Encargo (`PROMPT-MOD05-CICLO-FACTURACION-v1.0.md`) | Skills a leer antes de trabajar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `prod-ux` | §P1 | `brainstorming`, `system-vocabulary-review`, `iwana-identity-ui-review` | PRD Fase 09 v1.0 §5 |
| 2 | `sr-backend` | §B1 | `nestjs-expert`, `database-migration`, `postgresql`, `test-driven-development`, `iwana-test-evidence` | PRD Fase 09 v1.0 §7 + ADR-102 D3 |

**Paralelo:** 1 y 2 a la vez; archivos disjuntos (`docs/specs/` vs. `packages/` y `apps/api`).
**Cierre de ola:** spec UX en `docs/specs/` y CA-CF-01 a CA-CF-09 con conteo real (Postgres > 0 tests, sin caché). Luego Ola 2 (`fe-platform` §F1).

---

### Bloque copiar-pegar

===== 1 · prod-ux =====
Actúa como `prod-ux`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-30-mod05-ciclo-facturacion.md`, ADR-102, el PRD `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.0.md` y tu encargo `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §P1. Lee los `SKILL.md` de `brainstorming`, `system-vocabulary-review` e `iwana-identity-ui-review`. Escribe la spec en `docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md`: diálogo «Activar servicio», selectores de ciclo, «Próximo corte» y agenda de corte dentro de Suscriptores. Reutiliza patrones existentes; nada de primitives nuevas sin `ds-owner`. No cambies el contrato del PRD §7: si lo necesitas, `[BLOQUEO]`. No escribes código.

===== 2 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan, ADR-102, el PRD Fase 09 y tu encargo `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §B1. Lee los `SKILL.md` de `nestjs-expert`, `database-migration`, `postgresql`, `test-driven-development` e `iwana-test-evidence`. Implementa migración, contratos de `@iwana/shared`, `activate` con ciclo, catálogo y agenda, exactamente con los nombres del PRD §7. No construyas corte automático, jobs ni colas. Sin `tenant_iwana`, sin `git stash`, no toques cambios ajenos ni commitees. Cierras con CA-CF-01 a CA-CF-09 y el conteo real de tests ejecutados.
