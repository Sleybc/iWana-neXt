# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 1

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.0 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md` v1.0
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 1 — P0 ∥ S0 ∥ D1 ∥ B1a · **Gates:** G0 ✅ (CTO, 2026-10-22)
**Bloqueos abiertos:** ninguno. B1b, B2, B3, F1, F2 y V no se despachan en esta ola.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `prod-ux` | `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.0.md` §P0 | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | HLD v1.0 |
| 2 | `sec-eng` | ídem §S0 | `security-auditor`, `backend-security-coder`, `auth-implementation-patterns` | HLD v1.0 |
| 3 | `data-eng` | ídem §D1 | `database-migration`, `postgresql`, `iwana-tenant-migration`, `test-driven-development` | HLD v1.0 §3 |
| 4 | `sr-backend` | ídem §B1a | `typescript-expert`, `test-driven-development` | HLD v1.0 §4 y §7 |

**Paralelo:** 1 ∥ 2 ∥ 3 ∥ 4. D1 deja la migración 162 para el final si B1a aún no publicó las claves de permiso.
**Cierre de ola (G1):** spec UX entregada; informe S0 con Q2 cerrada; migraciones 160–162 de ida y vuelta en verde con conteo real; contratos shared con tests en verde. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · prod-ux =====
Actúa como `prod-ux`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md` y tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.0.md` §P0. Antes de escribir, lee los `SKILL.md` de `iwana-identity-ui-review`, `system-vocabulary-review` y `wcag-audit-patterns`. Consumes el contrato congelado `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md`: si un flujo pide un campo que no está, emite `[BLOQUEO]` y para. Cierras al entregar `docs/specs/2026-10-22-mod13-aprovisionamiento-ux.md`.

===== 2 · sec-eng =====
Actúa como `sec-eng`. Lee `AGENTS.md`, el plan y tu encargo §S0 del mismo prompt. Lee `security-auditor`, `backend-security-coder` y `auth-implementation-patterns`. Revisas en solo lectura ADR-098 y el HLD; cierras Q2. Cierras al entregar `docs/informes/INFORME-MOD13-REVISION-SEGURIDAD-DISENO-v1.0.md` con hallazgos P0–P3.

===== 3 · data-eng =====
Actúa como `data-eng`. Lee `AGENTS.md`, el plan y tu encargo §D1. Lee `database-migration`, `postgresql`, `iwana-tenant-migration` y `test-driven-development`. Implementa el HLD §3.1 a 3.3 sin modificarlo; cierra Q1. Solo tus rutas; no commitees. Cierras con las migraciones aplicadas y revertidas, con conteo real.

===== 4 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan y tu encargo §B1a. Lee `typescript-expert` y `test-driven-development`. Implementa el HLD §4 y las claves del §7 en `@iwana/shared`, sin modificar el contrato. No commitees. Cierras con los tests de los esquemas en verde, con conteo real.
