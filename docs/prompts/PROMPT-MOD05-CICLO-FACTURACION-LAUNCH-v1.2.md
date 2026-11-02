# LAUNCH — MOD05 · Fase 09 Ciclo de facturación · Ola 3 (Q1 ∥ V1 ∥ V2 → V3)

**Estado:** ejecutado el 2026-10-30. Sustituido por [v1.3](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3.md) (Ola 4, remediación).

**Plan:** `docs/plans/2026-10-30-mod05-ciclo-facturacion.md` v1.0 · **PRD:** Fase 09 v1.1 · **Decisión:** ADR-102 · Sustituye a [v1.1](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.1.md) (Ola 2)
**Gates:** G0 ✅ · G1 ✅ · G3 ✅ · G4 ✅ (F1) · G5 · G6 · G6.5
**Bloqueos abiertos:** ninguno.
**Estado al arrancar:** B1, B1b y F1 sin commitear en `main`; se cuentan 44 suites y 537 tests en corridas focales. Faltan: E2E, revisiones y suite completa.
**Plantilla y fuentes:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md) · [plan](../plans/2026-10-30-mod05-ciclo-facturacion.md) · [PRD v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) · [encargo](PROMPT-MOD05-CICLO-FACTURACION-v1.0.md)

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | §Q1 | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` | PRD v1.1 §8 |
| 2 | `contract-drift-reviewer` | §V1 | `architect-review` | PRD v1.1 §7 |
| 3 | `boundary-reviewer` | §V2 | `architect-review` | ADR-102 |
| 4 | `gate-verifier` | §V3, **después de 1–3** | `iwana-test-evidence`, `verification-before-completion` | AGENTS.md «Gates Before Merge» |

**Paralelo:** 1, 2 y 3 a la vez (1 escribe solo en `e2e/`; 2 y 3 no escriben). 4 corre al cerrar los tres, sin hallazgos bloqueantes abiertos.
**Cierre de ola:** CA-CF-12 en verde, V1 sin deriva, V2 sin violaciones, V3 con conteo real. Luego AI-EM-ARCH: informe de cierre, commit, push y G6.5.

---

### Bloque copiar-pegar

===== 1 · sr-qa =====
Actúa como `sr-qa`. Lee `AGENTS.md`, el plan, el PRD Fase 09 v1.1, la spec `docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md` y tu encargo `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §Q1. Lee los `SKILL.md` de `e2e-testing-patterns`, `playwright-skill` e `iwana-test-evidence`; `wcag-audit-patterns` para el diálogo. Escribe el E2E de CA-CF-12 contra la API real y la matriz CA-CF-01 a CA-CF-13 ↔ test con estado real. Además, revisa el diff de las 9 pruebas de portal en `components/crm/subscribers/` que ya existían y que F1 modificó: señala cualquier aserción debilitada o borrada. Usa el tenant de pruebas, nunca `tenant_iwana`. Sin `git stash`, no toques cambios ajenos ni commitees.

===== 2 · contract-drift-reviewer =====
Actúa como `contract-drift-reviewer`. Lee `AGENTS.md`, el PRD Fase 09 v1.1 §7 y el encargo §V1; lee el `SKILL.md` de `architect-review`. Compara `@iwana/shared` (`billing-cycle.schema.ts`, `contract.schema.ts`, `calendar/billing-cutoff.ts`) con los DTOs, el OpenAPI y la respuesta real de `crm/contracts` y `billing-cycles`, y con `apps/portal/src/lib/api-client.ts`. Comprueba tres cosas: que `billingCyclesApi` usa `returnFullResponse` según la forma en que el controlador responde (sin envoltorio `data`); que todos los que llaman a `contractsApi.activate` usan la firma nueva; y quién sigue leyendo `billingCycle` como texto libre. Solo lectura; hallazgos con `archivo:línea`.

===== 3 · boundary-reviewer =====
Actúa como `boundary-reviewer`. Lee `AGENTS.md`, ADR-102 y el encargo §V2; lee el `SKILL.md` de `architect-review`. Revisa la migración tenant 167, `apps/api/src/modules/crm/contracts/**` (incluido `ports/`) y `contracts.module.ts`. Comprueba: tabla en el schema tenant; la zona horaria se lee por puerto, sin importar el módulo `tenant`; sin acceso a tablas de otros módulos y sin imports circulares. Solo lectura; hallazgos con `archivo:línea`.

===== 4 · gate-verifier (después de 1–3) =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge», el plan y el encargo §V3; lee los `SKILL.md` de `iwana-test-evidence` y `verification-before-completion`. Sin caché de turbo, corre en `@iwana/shared`, `@iwana/database`, `@iwana/api` y `@iwana/portal`: lint, typecheck, la **suite completa** de `@iwana/api` y de `@iwana/portal`, las integraciones Postgres de la fase y el E2E de Q1. Reporta la cobertura de `ContractsService` antes y después (B1: 81,88 % líneas, 71,1 % ramas, 69,13 % funciones). Entrega comandos y cifras reales; no corrijas código.
