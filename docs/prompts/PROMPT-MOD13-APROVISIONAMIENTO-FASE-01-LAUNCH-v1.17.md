# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 16 (B-cov ∥ V1-ci2)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.17 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G3 ✅ · G5 ✅ · G4 ⏳ (V1-ci2) · G6 ⏳ (logging y cobertura)
**Estado al arrancar:**
- V4-plan está cerrado (6/6 capturas con el plan PCQ).
- V5 cumple lint y typecheck en los 5 paquetes, y pasan las suites de worker, portal, shared y db, además del build del portal.
- Abiertos: el guard de logging (2 tests) y la cobertura de `network` (49,92 %).
- V1-ci está bloqueado por un defecto de MOD11 previo y ajeno: no se puede cerrar como `NOT_EXECUTED` sin CPE. Se trata aparte.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer antes de codificar | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §Ola 16 y §B-cov | `backend-security-coder`, `observability-engineer`, `test-driven-development`, `iwana-test-evidence` | Guard de logging en verde; cobertura de `network` ≥80 % (≥70 % en branches) |
| 2 | `sr-qa` | §Ola 16 y §V1-ci2 | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | Spec autocontenido y estricto en dos corridas seguidas (G4) |

**Paralelo:** 1 ∥ 2. Archivos disjuntos: B-cov toca `apps/api` y sus pruebas; V1-ci2 solo `e2e/`.
**Cierre:** G4 y G6 en verde con conteo real. Después viene G7. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 16 y §B-cov, y `docs/informes/INFORME-MOD13-GATES-V5-v1.0.md`. Antes de escribir código, lee los `SKILL.md` de `backend-security-coder`, `observability-engineer`, `test-driven-development` e `iwana-test-evidence`. Corrige los tres puntos del guard de logging y sube la cobertura de `network` a ≥80 % (≥70 % en branches), listeners incluidos, sin cambiar el contrato ni el comportamiento. La suite completa del API debe quedar en verde. No toques `tenant_iwana`, no imprimas secretos ni dejes cachés de jest en el repo. No commitees. Cierras con el conteo real y el desglose de cobertura.

===== 2 · sr-qa =====
Actúa como `sr-qa`. Lee `AGENTS.md`, el plan, tu encargo §Ola 16 y §V1-ci2 del mismo prompt, y `docs/informes/INFORME-MOD13-PRUEBAS-V1-v1.0.md`. Lee `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` y `verification-before-completion`. Escribes tests y fixtures, nunca código de producto. Haz el spec autocontenido y estricto; prueba la liberación de la IP cancelando o anulando una segunda OT, no con `NOT_EXECUTED`. No registres instalaciones falsas. Pásalo dos veces seguidas en verde, solo en el tenant de pruebas y sin imprimir secretos.
