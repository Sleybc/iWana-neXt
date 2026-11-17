# Plan de orquestación — ADR-106 · Etapa 1: actor mínimo en los tres puertos

**Versión:** 1.0
**Estado:** Aprobado. G0 = aprobación de ADR-106 por el CTO (2026-11-08). Se lanza cuando P3 se confirme al arrancar (§1)
**Fecha:** 2026-11-08
**Emitido por:** AI-EM-ARCH
**Decisión:** [ADR-106](../adrs/ADR-106-Actor-Minimo-en-Puertos-y-Servicios.md) v1.0, D1–D5 y §5 etapa 1 · **Encargo:** [PROMPT-ADR106-ACTOR-MINIMO-ETAPA-1-v1.0](../prompts/PROMPT-ADR106-ACTOR-MINIMO-ETAPA-1-v1.0.md) · **Lanzador:** [PROMPT-ADR106-ACTOR-MINIMO-ETAPA-1-LAUNCH-v1.0](../prompts/PROMPT-ADR106-ACTOR-MINIMO-ETAPA-1-LAUNCH-v1.0.md)

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-08 |
| --- | --- | --- |
| P1 | G0: ADR-106 aprobado | **Cerrada** el 2026-11-08, §6 completo |
| P2 | Encargo aparte de H-EXP (ADR-106 §6.3) | **Cerrada.** `git status` no muestra cambios en `modules/inventory`, `modules/tasks`, `modules/wfm`, `common/` ni `eslint.config.js`. Los cambios sin commitear de privacidad están en otros archivos. Se vuelve a comprobar al lanzar |
| P3 | Nadie en vuelo sobre los 32 archivos de §2 | Se comprueba al lanzar |
| P4 | CI de `main` en verde | **Abierta.** `CI` en rojo sobre `1853f931` (run 42523915206); `E2E Web Admin Smoke` en verde. **No bloquea B1 ni B2**, que trabajan en local sin commit. **Bloquea B5**: no se publica sobre un `main` rojo cuya causa no esté identificada |

## 2. Superficie

Medida el 2026-11-08 con `grep` de los símbolos de los tres puertos: 32 archivos en `apps/api/src`.

| Puerto | Producción | Specs que lo nombran |
| --- | --- | --- |
| `InventoryMovementPort` | `inventory/ports/inventory-movement.port.ts` (puerto + adaptador), `inventory.module.ts`, `tasks/services/execution-order-inventory.service.ts` | `inventory/tests/inventory-movement.port.spec.ts`, `inventory/tests/inventory.module.spec.ts`, `tasks/tests/execution-order-inventory.service.spec.ts` |
| `ExecutionOrderSchedulingPort` | `tasks/ports/execution-order-scheduling.port.ts`, `tasks/services/execution-orders.service.ts` (implementa el puerto directamente), `tasks/tasks.module.ts`, `tasks/execution-order-scheduling.module.ts`, `wfm/services/schedule-events.service.ts`, `wfm/services/visit-requests.service.ts` | 4 de `tasks/tests/execution-orders.*` y 5 de `wfm/services/visit-requests.*.spec.ts` |
| `WfmOrganizationSitesReadPort` | `wfm/ports/wfm-organization-sites-read.port.ts`, `wfm/services/wfm-organization-sites.adapter.ts`, `wfm/wfm.controller.ts`, `wfm/wfm.module.ts` | `wfm-organization-sites.adapter.spec.ts` y 5 de `wfm/tests/*.spec.ts` |
| Regla ESLint | `eslint.config.js` (raíz; `apps/api` no tiene configuración propia) | — |
| Nuevo | `apps/api/src/common/actor/actor-ref.ts` | — |

`common/pagination/clamp-page-endpoints.controller.http.spec.ts` también nombra un símbolo. B1 confirma si lo toca.

## 3. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · tipo, puertos y regla | `sr-backend` | P1–P3 | Producción de §2. Specs solo si dejan de compilar |
| B2 · matriz y regresión | `sr-qa` | B1 | Matriz MOD11↔MOD12, specs de §2, rojo sembrado de la regla ESLint |
| B3 · verificación | `boundary-reviewer`, `test-change-reviewer`, `gate-verifier` | B2 | Solo lectura |
| B4 · documentos | AI-EM-ARCH, con `docs-governance` | B3 | Informe de cierre de la etapa 1. Lista de excepciones inicial de la etapa 2 como anexo del informe, no del ADR |
| B5 · publicación | AI-EM-ARCH | B4, P4 | Commit propio (sin archivos de privacidad), push y G6.5 |

**Olas:** 1 = B1; 2 = B2; 3 = B3; 4 = B4; 5 = B5. Todo es secuencial: B2 prueba lo que B1 cambia, y la superficie es pequeña. Paralelizar no ahorra nada y abre conflictos en los mismos specs.

**Ruta crítica:** B1 → B2 → B3 → B4 → P4 → B5 → G6.5.

## 4. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 `sr-backend` | `nestjs-expert`, `typescript-expert`, `test-driven-development`, `iwana-test-evidence` | `typescript-pro` (si la varianza de parámetros en clases que implementan el puerto exige tipado fino); `architect-review` (si un import de D4 no tiene un destino obvio) | `database-migration` y `postgresql` (sin cambios de esquema); `bullmq-specialist` (las colas no cambian: el processor ya pasa `{ sub }`); `openapi-spec-generation` (no cambia la API HTTP) |
| B2 `sr-qa` | `iwana-matriz-motivos`, `testing-patterns`, `iwana-test-evidence` | `systematic-debugging` (si falla una suite ajena); `iwana-queue-inspect` (si un caso de la matriz no deja recibo) | `e2e-testing-patterns` y `playwright-skill` (sin cambio visible) |
| B3 | — (verificadores auxiliares, sin skills) | — | `sec-eng` (no hay cambio de controles ni de datos; la nota de mínimo privilegio del token es un encargo aparte, ADR-106 §4); `contract-drift-reviewer` (no se toca `packages/shared`) |
| B4 | `docs-architect` | — | — |

Skills y subagentes verificados en disco el 2026-11-08.

## 5. Encargos

El detalle está en el prompt de ejecución. Aquí solo se acota. Trabajo en `main`, sin ramas, sin stash y sin commit. Cero PII. Sin Prettier en `docs/`. `[BLOQUEO]` si el código contradice ADR-106. Integración contra un PostgreSQL y un Redis propios y desechables, aprovisionados como en CI, con `DB_NAME=test`. Nunca `tenant_iwana` ni `dbiw`.

- **B1.** D2 (`ActorRef`, `ActorRefWithRole`), D1 en las firmas de los tres puertos **y en los métodos que los implementan**, D3 en `WfmOrganizationSitesReadPort`, D4 en los dos puertos impuros y D5 sobre `**/ports/**`. Cambiar `@Module` obliga a correr la suite completa de `@iwana/api`.
- **B2.** Matriz motivo → test integrado completa, contra el stack real y con conteo. Regresión de las specs de §2. Rojo sembrado de la regla ESLint con `--stdin`, sin crear archivos en el árbol.
- **B3.** `boundary-reviewer`: diff completo contra ADR-106 D1–D5. `test-change-reviewer`: cada spec cuyo fixture o expectativa cambió. `gate-verifier`: «Gates Before Merge» con `@iwana/api` completo, sin caché.

## 6. Gates

| Gate | Condición |
| --- | --- |
| G0 | **Cerrado** el 2026-11-08: ADR-106 aprobado |
| G2 | B1 con `tsc`, lint y suite completa de `@iwana/api` sin caché. Conteo no inferior a la línea base tomada al iniciar la ola |
| G3 | Matriz MOD11↔MOD12 completa en verde contra Postgres y Redis reales; regla ESLint con rojo sembrado y verde |
| G6 | B3 sin bloqueantes |
| G6.5 | CI de `main` en verde sobre el SHA publicado |

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Bivarianza de métodos en TypeScript.** El puerto declara sus métodos con sintaxis de método, así que `strictFunctionTypes` no se aplica. `ExecutionOrdersService` podría seguir recibiendo `actor: JwtPayload` mientras el puerto dice `ActorRef`, y compilaría. Un llamador que pase `{ sub }` llegaría a un helper que lee `actor.role` y obtendría `undefined` sin error | B1 tipa explícitamente como `ActorRef` (o `ActorRefWithRole`) **los métodos que implementan el puerto**, no solo la interfaz, y recorre sus helpers. Si el compilador exige `role`, se usa `ActorRefWithRole` y se documenta en el informe |
| Mover el adaptador de inventario cambia los providers de `inventory.module.ts` | Suite completa de `@iwana/api` (lección de privacy B6: una suite focal verde ocultó un CI rojo) |
| La regla ESLint captura un import legítimo que nadie previó | Rojo y verde sembrados en B2. Si aparece un caso real, `[BLOQUEO]` y enmienda del ADR, no un `eslint-disable` |
| Un fixture «obsoleto» oculta una regresión | `test-change-reviewer` revisa cada spec cuya expectativa cambió |
| Se publica mezclado con privacidad | B5 hace un commit propio con una lista explícita de rutas |

## Lanzamiento

El archivo [PROMPT-ADR106-ACTOR-MINIMO-ETAPA-1-LAUNCH-v1.0](../prompts/PROMPT-ADR106-ACTOR-MINIMO-ETAPA-1-LAUNCH-v1.0.md) es la fuente y **prevalece si divergen**. Lanza la Ola 1 (B1). Cada ola siguiente se lanza con su propio archivo cuando cierra su gate.

```text
===== ADR-106 Etapa 1 · B1 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, ADR-106 (docs/adrs/ADR-106-Actor-Minimo-en-Puertos-y-Servicios.md), el plan docs/plans/2026-11-08-adr106-actor-minimo-etapa-1-orquestacion.md (§2 y §7) y tu encargo docs/prompts/PROMPT-ADR106-ACTOR-MINIMO-ETAPA-1-v1.0.md §B1.
Antes de escribir código, lee los SKILL.md de nestjs-expert, typescript-expert, test-driven-development e iwana-test-evidence (.agents/skills/<nombre>/SKILL.md, como documentación).
Primero toma la línea base de @iwana/api sin caché de Turbo.
Alcance: los tres puertos (InventoryMovementPort, ExecutionOrderSchedulingPort, WfmOrganizationSitesReadPort), ActorRef en common/actor/ y la regla ESLint sobre **/ports/**. Fuera de alcance: otros servicios (etapa 2), privacy, billing, crm, cli/, packages/shared y las colas.
Ojo con la bivarianza: tipa como ActorRef también los métodos de ExecutionOrdersService que implementan el puerto, no solo la interfaz, y recorre sus helpers. Si alguno lee role, usa ActorRefWithRole y repórtalo.
Si el código contradice ADR-106, emite [BLOQUEO] con archivo:línea y para.
Cierras cuando tsc, el lint de la raíz y la suite completa de @iwana/api (unitaria e integración, DB_NAME=test, PostgreSQL y Redis propios) están en verde, sin caché, con conteo no inferior a la línea base.
Informa: archivos tocados, destino del adaptador, métodos con ActorRefWithRole, specs modificadas con su motivo, línea base frente al cierre y el grep de jwt-payload.interface en /ports/ vacío. En main, sin commit.
```
