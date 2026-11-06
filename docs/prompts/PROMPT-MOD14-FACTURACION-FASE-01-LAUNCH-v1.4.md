# LAUNCH — MOD14 · Facturación Fase 01 · Corrección B1b-R2 y cierre de G2

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` (RS-11) · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md` §B1b-R2
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.3 (entregada el 2026-11-04 con G2 NO-GO).
**Ola que lanza:** B1b-R2 · **Gates:** G1 ✅ 2026-11-03 · G2 NO-GO · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes | Cuándo |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §B1b-R2 | `typescript-expert`, `test-driven-development`, `iwana-test-evidence` | Ahora |
| 2 | `gate-verifier` | Evidencia de G2 | `iwana-test-evidence`, `verification-before-completion` | Tras 1 |

**Paralelo:** ninguno. **Rutas:** `packages/shared/src/calendar/billing-calendar.ts` y su spec, y `billing-contract-read.adapter.postgres.integration.spec.ts`.
**Cierre de ola (G2):** tabla de RS-11 en verde con anticipación 0, 5 y 15; integración del adaptador en verde con `DB_NAME=test`; `@iwana/shared` y suites de billing sin caché con conteo real. Los fallos del barrido de texto libre no bloquean esta ola: los cierra B1c-2. Nadie commitea.

```text
===== 1 · sr-backend (ahora) =====
Actúa como sr-backend. Lee AGENTS.md, tu encargo §B1b-R2 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md y RS-11 en HLD v1.1 §4. Lee typescript-expert, test-driven-development e iwana-test-evidence.
Primero la prueba en tabla, y muéstrala en rojo: ciclos 1 a 28, ANTICIPADO y VENCIDO, anticipación 0, 5 y 15, fechas de un año completo. Luego haz que resolveGenerationTarget evalúe también el mes siguiente y actualiza su comentario.
Además, billing-contract-read.adapter.postgres.integration.spec.ts:101 no puede fallar con DB_NAME=test, que usa el job ci: acepta test e iwana_it_*; con otro nombre, describe.skip con aviso visible.
Solo esas tres rutas; sin commit. Cierras con @iwana/shared sin caché y esa integración con DB_NAME=test, con conteo real y la salida del rojo inicial.

===== 2 · gate-verifier (tras 1) =====
Actúa como gate-verifier. Lee iwana-test-evidence y verification-before-completion. Ejecuta sin caché typecheck y lint de @iwana/shared y @iwana/api, la suite de @iwana/shared, las unitarias de modules/billing y billing-contract-read, y su integración con DB_NAME=test. Entrega comandos y conteos reales. No apruebas G2: entregas evidencia a AI-EM-ARCH.
```
