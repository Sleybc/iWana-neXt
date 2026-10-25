# MOD11 — Gate de cierre por familia de resultado · Plan de orquestación

**Versión:** 1.0 · **Fecha:** 2026-10-23 · **Autor:** AI-EM-ARCH
**Decisión:** [ADR-099](../adrs/ADR-099-Requisitos-de-Cierre-de-OT-por-Familia-de-Resultado.md) (Aprobado, 2026-10-23)
**Encargo:** [PROMPT-MOD11-GATE-CIERRE-RESULTADO-v1.0](../prompts/PROMPT-MOD11-GATE-CIERRE-RESULTADO-v1.0.md) · **Launcher:** [PROMPT-MOD11-GATE-CIERRE-RESULTADO-LAUNCH-v1.0](../prompts/PROMPT-MOD11-GATE-CIERRE-RESULTADO-LAUNCH-v1.0.md)
**Origen:** MOD13 Fase 01, bloque V1-ci ([plan](2026-10-22-mod13-aprovisionamiento.md) §6, Ola 16)

---

## 0. Alcance

Corregir el defecto confirmado en ADR-099 §Contexto: una OT de instalación no puede cerrarse como `NOT_EXECUTED` sin registrar un CPE instalado, dos fotos y un acta. Además, aplicar en el API la causa obligatoria de ADR-077 regla 1.

**Fuera de alcance:**

- Validar el código de causa contra el catálogo de MOD09.
- Exigir en el servidor la evidencia del intento.
- Unificar el id y el código de causa en el portal.
- Cambiar el portal.
- Tocar `apps/api/src/modules/network/**` o `e2e/**`, que tienen cambios en curso de MOD13.

## 1. Decisiones del CTO antes de lanzar (G0)

| # | Pregunta | Recomendación |
| --- | --- | --- |
| E1 | ¿`REQUIRES_FOLLOW_UP` en instalación es de la familia ejecutada y consulta MOD13? Extiende ADR-098 D5 | **(a) Sí.** Si quedó a medias, la vía es `NOT_EXECUTED` + `PARTIAL_EXECUTION` |
| E2 | ¿Se rechaza `NOT_EXECUTED` si quedan consumos `INSTALLED_AT_CUSTOMER` vigentes? | **Sí.** El técnico revierte el consumo (contrato v1.7) |
| — | ADR-099 pasa de `Propuesto` a `Aprobado` | ✅ Aprobado por el CTO el 2026-10-23 con E1 = (a) y E2 = sí |

**Resuelto el 2026-10-23:** el CTO aprobó E1 = (a) y E2 = sí. El encargo v1.0 se lanza sin re-emisión.

## 2. Bloques y dependencias

| Bloque | Agente | Qué | Depende de |
| --- | --- | --- | --- |
| B1 | `sr-backend` | `selectRequirementsForResult` (función pura) · `reasonCode` obligatorio en `NOT_EXECUTED` · E2 · E1 · actualizar las pruebas y los clientes de `close()` · pruebas unitarias e integración contra Postgres real · OpenAPI del DTO | G0 |
| V1 | `boundary-reviewer` + `contract-drift-reviewer` | Sin lectura de MOD09 ni de MOD13 fuera del puerto. Contrato de cierre coherente con `@iwana/shared` y el portal | B1 |
| V2 | `gate-verifier` | Gates Before Merge en `api`, sin caché de turbo y con conteo real | B1 |

V1 ∥ V2. Después se emite el informe y se hace el commit (AI-EM-ARCH).

## 3. Matriz de dispatch (agente × skill)

| Bloque | Agente | Skills obligatorias | De apoyo (condición) | Descartadas y motivo |
| --- | --- | --- | --- | --- |
| B1 | `sr-backend` | `nestjs-expert`, `test-driven-development`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` | `iwana-matriz-motivos` (E2 añade un motivo de rechazo sobre consumos de OT); `openapi-spec-generation` (descripción del DTO) | `database-migration`: sin migración · `bullmq-specialist`: sin colas |
| V1 | `boundary-reviewer` + `contract-drift-reviewer` | `architect-review` | — | — |
| V2 | `gate-verifier` | `iwana-test-evidence`, `turborepo-caching`, `verification-before-completion` | — | — |
| Cierre | AI-EM-ARCH | `docs-architect` | — | — |

## 4. Gates

| Gate | Condición | Quién |
| --- | --- | --- |
| G0 | E1 y E2 resueltas. ADR-099 `Aprobado` | CTO |
| G3 | CA-01 a CA-08 del encargo. La integración contra Postgres real **corrió** (conteo de tests > 0, no `describe.skip`) | sr-backend |
| G5 | V1 sin violaciones de frontera ni deriva de contrato | reviewers |
| G6 | Lint, typecheck y suite completa de `api` sin caché. Cobertura de `tasks` ≥80 % en sentencias y líneas. **Funciones y ramas se miden sobre el diff** (precisado el 2026-10-23): toda línea y rama nueva cubierta. Lo que quede bajo el 80 % en archivos que el encargo no toca es deuda previa declarada, no bloqueo | gate-verifier |
| G7 | Informe `docs/informes/INFORME-MOD11-GATE-CIERRE-RESULTADO-v1.0.md`, commit de las rutas de B1 y **CI de `main` en verde**. Aviso a MOD13 para que V1-ci recupere la prueba con `NOT_EXECUTED` | AI-EM-ARCH |

## 5. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| P1 | El árbol de `main` está sucio, con MOD13 en curso en `network/**` y `e2e/**` | B1 no toca esas rutas. Commit con `git add` solo de las rutas de B1 |
| P2 | Exigir `reasonCode` rompe pruebas de MOD13 que cierran `NOT_EXECUTED` sin causa | B1 actualiza `tasks/tests/execution-orders.provisioning-gate.spec.ts` y lista, sin editarlos, los consumidores de `network/**` y `e2e/**` para avisar a MOD13 |
| P3 | La suite de integración se salta en silencio por falta de `IWANA_DB_INTEGRATION_AVAILABLE` o `E2E_TENANT_SLUG` | G3 exige ver el conteo de tests ejecutados |

## 6. Estado de ejecución · 2026-10-23

| Ola | Bloque | Estado | Evidencia |
| --- | --- | --- | --- |
| 0 | Diagnóstico · AI-EM-ARCH | ✅ Defecto confirmado con una sonda sobre `close()` (2/2). Hallazgos: E1 (`REQUIRES_FOLLOW_UP` incerrable) y `reasonCode` no exigido | ADR-099 §Contexto |
| 0 | G0 · CTO | ✅ Cerrado: ADR-099 Aprobado; E1 = (a), E2 = sí | ADR-099 §Escalaciones |
| 1 | B1 · sr-backend | ✅ Cerrado según su informe (G3): rojo inicial en el gate; integración contra Postgres real 1 suite, 4/4 tests sin omisiones (CA-02 a CA-05); unitarias enfocadas 4 suites, 152 tests; suite del API 419 suites, 5.592 tests (4 suites y 15 tests omitidos). Cobertura de `tasks`: sentencias 84,91 %, líneas 85,80 %, funciones 79,74 %, ramas 69,17 %. Lint, typecheck y build en verde (7 avisos previos). Sin migraciones; `tenant_iwana` sin tocar. En `network/**` y `e2e/**` no hay cierres `NOT_EXECUTED` sin causa, solo fixtures de eventos | Diff de 7 archivos en `apps/api/src/modules/tasks/**` + `execution-orders.close-by-result.postgres.integration.spec.ts`. Revisado por AI-EM-ARCH: coincide con §B1 |
| 2 | V1 · boundary + contract | ✅ G5 con un P3. Sin imports nuevos de `wfm` ni de `network` en producción: el servicio consume `SERVICE_PROVISIONING_READ_PORT`. Contrato sin deriva (`reasonCode` opcional en la forma, `maxLength` 64, `.strict()`, exigido por el servicio, enviado por el portal). **P3:** en la integración nueva, la consulta de intents y los borrados por `intent_id` (líneas 146–160) y de órdenes y tareas (`manager.delete`, líneas 189 y 196) no filtran por `tenant_id`. Verificado por AI-EM-ARCH: las tres tablas tienen `tenant_id` | Informe reenviado por la sesión de MOD13 (2026-10-23) |
| 2 | V2 · gate-verifier | ✅ G6 con el criterio precisado. Lint con exit 0 (7 avisos ajenos) y typecheck con exit 0. 419 suites y 5.592 tests (4 suites y 15 tests omitidos). Integración: 1 suite, 4/4. `tasks`: sentencias 84,91 %, ramas 69,17 %, funciones 79,74 %, líneas 85,80 %. Archivos de B1: servicio 82,66/70,98/79,50/83,67; evaluador 90,90/78,66/100/91,04; DTO 100 %. Las 60 líneas nuevas del servicio y las 13 del evaluador están cubiertas. La única rama sin cubrir (`execution-orders.service.ts:2275`) es anterior al encargo. **Deuda previa declarada:** ramas y funciones de `tasks` bajo el 80 % en archivos que B1 no tocó | ídem |
| 3 | B1-bis · sr-backend | ✅ Cerrado: el `afterAll` filtra por `tenant_id` en las cinco consultas y usa `In(ids)` con `tenantId`. Integración contra Postgres real 4/4, sin omisiones (re-verificado por AI-EM-ARCH); lint con 0 errores | `execution-orders.close-by-result.postgres.integration.spec.ts` |
| 4 | G7 · AI-EM-ARCH | ✅ **Cerrado el 2026-10-25.** `509237fb` publicado en `origin/main` con el push de MOD13 (`9ae4cc8f`, 2026-10-24). CI run 40096899059 en **rojo por causas ajenas a MOD11** (verificado en el log): `network.wiring` (MOD13, tenant local y API vivo), `report-subscriber-phone-readiness` (intermitente, regex sobre UUID) y 8 capturas del portal por el sidebar de MOD13. `execution-orders.close-by-result.postgres.integration.spec.ts` pasa en CI. Segundo run, 40104246528 sobre `b9f961a3` (2026-10-24), **cancelado** a las 6 h. El job de lint, typecheck, build y pruebas se colgó: `network-execution-event.wiring` (MOD13) no tiene `JWT_PRIVATE_KEY` en CI y jest no termina. La integración de MOD11 vuelve a pasar; los E2E del portal y R4.1 están en verde. La corrección es la Ola 19 de MOD13. Tercer run: CI 40195554094 y E2E Web Admin Smoke 40195554080 en **verde** sobre `70000111`, que contiene `509237fb`; la integración de MOD11 vuelve a pasar (verificado por AI-EM-ARCH con `gh run view`) | [INFORME-MOD11-GATE-CIERRE-RESULTADO-v1.0](../informes/INFORME-MOD11-GATE-CIERRE-RESULTADO-v1.0.md) |
