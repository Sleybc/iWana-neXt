# LAUNCH — MOD05 · Fase 09 Ciclo de facturación · Ola 4 remediación (R1 ∥ R2 → V3b)

**Plan:** `docs/plans/2026-10-30-mod05-ciclo-facturacion.md` v1.0 · **PRD:** Fase 09 v1.1 · **Decisión:** ADR-102 · Sustituye a [v1.2](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.2.md) (Ola 3)
**Gates:** G0 ✅ · G1 ✅ · G3 ✅ · G4 ✅ · G5 ✅ (V2 dispuesto por AI-EM-ARCH, informe §14) · G6 parcial · G6.5
**Bloqueos abiertos:** ninguno.
**Estado al arrancar:** Q1, V1, V2 y V3 ejecutados. Faltan CA-CF-08 con la agenda sin `date` y la prueba de rechazo por mora que F1 quitó.
**Plantilla y fuentes:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md) · [plan](../plans/2026-10-30-mod05-ciclo-facturacion.md) · [informe §13–§14](../informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md) · [encargo](PROMPT-MOD05-CICLO-FACTURACION-v1.0.md)

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §R1 | `test-driven-development`, `iwana-test-evidence` | PRD v1.1 CA-CF-08 |
| 2 | `fe-platform` | §R2 | `testing-patterns`, `frontend-dev-guidelines` | Spec UX §1 |
| 3 | `gate-verifier` | §V3b, **después de 1 y 2** | `iwana-test-evidence`, `verification-before-completion` | AGENTS.md «Gates Before Merge» |

**Paralelo:** 1 y 2 a la vez; archivos disjuntos (`apps/api` vs. `apps/portal`). 3 corre al cerrar ambos.
**Cierre de ola:** CA-CF-08 completo, mora cubierta, V3b en verde. Luego AI-EM-ARCH cierra: informe, commit, push y G6.5.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el PRD Fase 09 v1.1 (CA-CF-08) y tu encargo `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §R1. Lee los `SKILL.md` de `test-driven-development` e `iwana-test-evidence`. Añade la prueba de `getCutoffAgenda` sin `date` con reloj fijo a las 21:00 de Bogotá: `date` debe ser el día de Bogotá, no el de UTC. No cambies código de producción salvo que la prueba muestre un defecto; si lo muestra, repórtalo. No toques `apps/portal`. Sin `tenant_iwana`, sin `git stash`, no toques cambios ajenos ni commitees. Cierras con el conteo real de la suite tocada.

===== 2 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, la spec `docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md` §1 y tu encargo `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §R2. Lee los `SKILL.md` de `testing-patterns` y `frontend-dev-guidelines`. Restituye en `ActivateServiceDialog` la prueba del 409 `SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY`: título, botón «Dejar como borrador» y contrato en borrador. Revisa si las ramas de mora de `ServiciosTab.tsx:209` y `ContractDetailDrawer.tsx:568` quedaron sin uso: si es así, elimínalas con sus pruebas; si no, nombra la transición que las usa. No debilites aserciones. No toques `apps/api`, sin `git stash`, no commitees.

===== 3 · gate-verifier (después de 1 y 2) =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge» y el encargo §V3b; lee los `SKILL.md` de `iwana-test-evidence` y `verification-before-completion`. Sin caché de turbo: lint y typecheck de `@iwana/api` y `@iwana/portal`, la suite completa de `@iwana/portal`, la suite de `crm/contracts` de `@iwana/api` y `pnpm audit --prod --audit-level critical`. Entrega comandos y cifras reales; no corrijas código.
