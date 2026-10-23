# LAUNCH — MOD11 · Gate de cierre por familia de resultado · Ola 1 (B1) → Ola 2 (V1 ∥ V2)

**Plan:** `docs/plans/2026-10-23-mod11-gate-cierre-por-resultado.md` v1.0 · **Decisión:** ADR-099 (Aprobado, 2026-10-23)
**Gates:** G0 ✅ (E1 = (a), E2 = sí) · G3 · G5 · G6 · G7
**Estado al arrancar:** El defecto está confirmado: `NOT_EXECUTED` en una instalación v3 da 422 con 4 requisitos del trabajo ejecutado. `REQUIRES_FOLLOW_UP` es incerrable por `PROVISIONING`. El API no exige `reasonCode`.

| # | Subagente | Encargo (`PROMPT-MOD11-GATE-CIERRE-RESULTADO-v1.0.md`) | Skills a leer antes de codificar | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §B1 | `nestjs-expert`, `test-driven-development`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence`, `iwana-matriz-motivos` | CA-01 a CA-08, integración contra Postgres real con conteo > 0 (G3) |
| 2 | `boundary-reviewer` + `contract-drift-reviewer` | §V1 | `architect-review` | G5 |
| 3 | `gate-verifier` | §V2 | `iwana-test-evidence`, `turborepo-caching`, `verification-before-completion` | G6 |

**Secuencia:** 1 → (2 ∥ 3). **No tocar:** `apps/api/src/modules/network/**` ni `e2e/**`, que tienen MOD13 en curso. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-23-mod11-gate-cierre-por-resultado.md`, `docs/adrs/ADR-099-Requisitos-de-Cierre-de-OT-por-Familia-de-Resultado.md` y tu encargo `docs/prompts/PROMPT-MOD11-GATE-CIERRE-RESULTADO-v1.0.md` §B1. Antes de escribir código, lee los `SKILL.md` de `nestjs-expert`, `test-driven-development`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` e `iwana-matriz-motivos`. Empieza en rojo: una integración contra Postgres real que cierre como `NOT_EXECUTED` una instalación v3 sin CPE y falle hoy. Después crea `selectRequirementsForResult`, exige `reasonCode` en `NOT_EXECUTED`, rechaza `NOT_EXECUTED` con equipos `INSTALLED_AT_CUSTOMER` vigentes y haz que `REQUIRES_FOLLOW_UP` consulte MOD13. Solo el tenant de pruebas (`E2E_TENANT_SLUG`), nunca `tenant_iwana`. No toques `network/**`, `e2e/**` ni migraciones. No commitees. Cierras con el conteo real de unitarias e integración (más de 0 ejecutadas), la cobertura de `tasks` y la lista de consumidores de `NOT_EXECUTED` sin causa que no pudiste editar.

===== 2 · boundary-reviewer + contract-drift-reviewer =====
Actúa como `boundary-reviewer` y luego como `contract-drift-reviewer`. Lee `AGENTS.md`, ADR-099 y el encargo §V1. Lee `architect-review`. Revisa el diff de B1 en `apps/api/src/modules/tasks/**`. Verifica que no haya imports de `wfm` ni de `network` fuera del puerto de aprovisionamiento existente, que se mantenga el `tenant_id` en todas las consultas y que el contrato de cierre (DTO y OpenAPI) sea coherente con el portal, que ya envía `reasonCode`. Solo lectura. Hallazgos con `archivo:línea`.

===== 3 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md` y el encargo §V2. Lee `iwana-test-evidence`, `turborepo-caching` y `verification-before-completion`. Ejecuta, sin caché de turbo, los Gates Before Merge sobre `@iwana/api`: lint, typecheck, la suite completa y la integración de `tasks` contra Postgres real. Entrega comandos, conteos reales y la cobertura de `tasks` (≥80 %). No corrijas código.
