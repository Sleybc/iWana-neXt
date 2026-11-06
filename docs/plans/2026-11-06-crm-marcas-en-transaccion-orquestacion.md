# Plan de orquestación — CRM · Marcas de privacidad en la transacción

**Versión:** 1.0
**Estado:** Aprobado. G0 del CTO el 2026-11-06. Espera el commit de MOD14 Fase 01.
**Fecha:** 2026-11-06
**Autor:** AI-EM-ARCH
**Spec:** [2026-11-06-crm-marcas-en-transaccion-spec.md](../specs/2026-11-06-crm-marcas-en-transaccion-spec.md)
**Prompt:** [PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md](../prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md)

## Gates

| Gate | Condición | Dueño |
| --- | --- | --- |
| G0 | ✅ 2026-11-06: el CTO aprobó los cinco puntos de §8 de la spec | CTO |
| Entrada | MOD14 Fase 01 commiteado: `contracts.service.ts` hoy tiene cambios sin commitear | CTO |
| G6 | CA-1 a CA-7 con evidencia propia de AI-EM-ARCH; revisiones sin P0 ni P1 | AI-EM-ARCH |
| G6.5 | CI verde sobre el SHA publicado | AI-EM-ARCH |
| G7 | Diferido a la beta | CTO |

## Matriz de dispatch

| Bloque | Agente | Skills | Depende de |
| --- | --- | --- | --- |
| B1 | `sr-backend` | `nestjs-expert`, `postgresql`, `test-driven-development`, `testing-patterns`, `iwana-test-evidence`, `verification-before-completion` | Entrada |
| R1 | `boundary-reviewer` | `architect-review` | B1 |
| R1 | `test-change-reviewer` | — | B1 |
| R1 | `gate-verifier` | `iwana-test-evidence` | Revisiones |

## Seguimiento

| Entrega | Estado |
| --- | --- |
| Spec, plan, prompt y lanzador | Emitidos el 2026-11-06 |
| Spec del catálogo comercial (punto 3) | Hecha en la [spec transversal](../specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md) §4: `createSnapshot` solo lee. Aprobada e incorporada a B1 el 2026-11-06 |
| Inventario de otros módulos (punto 4) | Hecho en la misma spec §5: sustituye las 30 llamadas por 157 puntos |
| B1 | Entregado el 2026-11-06 antes de cerrar la Entrada, por orden del CTO. AI-EM-ARCH re-ejecutó con `DB_NAME=test`: unitaria 472 / 6.274; integración 68 aprobadas, 4 omisiones declaradas, 453 tests, 0 fallos; `@iwana/db` 52 / 151; build en verde; `privacy/**` líneas 96,36 %, ramas 86,13 %. **G6 no se cierra:** faltan catálogo y media (D3), `changePlan` en CA-1, y CA-3 no prueba el rollback porque falla antes de escribir. `boundary-reviewer` y `test-change-reviewer` sin P0 ni P1 |
| B1-R | Abierto el 2026-11-06 con [LAUNCH v1.1](../prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-LAUNCH-v1.1.md) |
| B1-R y G6 | Entregado el 2026-11-06. AI-EM-ARCH re-ejecutó con `DB_NAME=test`: unitaria 474 / 6.284; integración 69 aprobadas, 4 omisiones declaradas, 463 tests; `@iwana/db` en orden de CI 52 / 151; lint con 0 errores, `tsc` y build en verde; `privacy/**` líneas 96,36 %, ramas 86,13 %. CA-3 ya prueba el rollback y catálogo y media están hechos. **G6 espera B1-R2:** la prueba deja una fila en `public.media_assets` que rompe 7 pruebas de la migración 026 si `@iwana/db` corre después. [LAUNCH v1.2](../prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-LAUNCH-v1.2.md) |
| B1-R2 y G6 | **G6 ✅ 2026-11-06.** `afterAll` borra la fila de `public.media_assets`. AI-EM-ARCH re-ejecutó sin caché con `DB_NAME=test`: integración de API, 69 aprobadas y 4 omisiones declaradas; `@iwana/db` después de la API en la misma base, 52 / 151. Sin commit: `contracts.service.ts` debe separarse de MOD14; G6.5 pendiente |

## Lanzamiento

Bloque copiar-pegar en [PROMPT-CRM-MARCAS-EN-TRANSACCION-LAUNCH-v1.0.md](../prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-LAUNCH-v1.0.md). No se lanza antes del commit de MOD14.

```text
===== 1 · sr-backend, B1 =====
Actúa como sr-backend. Lee AGENTS.md, docs/specs/2026-11-06-crm-marcas-en-transaccion-spec.md y §B1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md, con las skills nestjs-expert, postgresql, test-driven-development, testing-patterns, iwana-test-evidence y verification-before-completion. Empieza por la prueba de CA-1 en rojo. En main, sin commit.

===== 2 · boundary-reviewer =====
Actúa como boundary-reviewer. Revisa B1 según §R1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md. Solo lectura: hallazgos con archivo:línea.

===== 3 · test-change-reviewer =====
Actúa como test-change-reviewer. Revisa B1 según §R1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md. Solo lectura: clasifica cada ajuste con archivo:línea.

===== 4 · gate-verifier =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge sobre @iwana/api según §R1 de docs/prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md, sin caché y con DB_NAME=test. Entrega conteos reales.
```
