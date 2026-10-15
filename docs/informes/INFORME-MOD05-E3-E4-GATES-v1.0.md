# Informe de gates — MOD05 E-3 · E4-C

| Campo       | Valor                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                            |
| Responsable | AI-GATE-VERIFIER (verificador auxiliar)                                                               |
| Resultado   | **NO-GO — gates abiertos**                                                                            |
| Alcance     | Lint, typecheck, pruebas sin caché, integraciones PostgreSQL, cobertura core y gates de merge de E-3. |

## Resultado ejecutivo

Las 15 ejecuciones Turbo (lint, typecheck y test para cinco paquetes) terminaron con código 0 y `Cached: 0 cached`. Las pruebas unitarias reportaron conteos distintos de cero. La migración 148 pasó `up/down/up` en Postgres real y la comprobación de orden/registro.

El gate total permanece **NO-GO** por tres motivos: `expediente.service.ts` está debajo de 80% en cobertura; la integración API omitió dos suites (14 tests) que exigen una base distinta; y boundary-reviewer encontró una observación abierta en el uso de `SET search_path` fuera de transacción. E4-A también permanece bloqueado: el E2E real no alcanzó las aserciones CA-E3-01 a CA-E3-04. E4-B emitió GO para el alcance de seguridad revisado.

## Lint, typecheck y pruebas sin caché

Cada comando Turbo indicado abajo se ejecutó por separado con `--force`; cada salida informó cero tareas cacheadas. Los conteos de test se copian del resumen de Jest.

| Paquete         | Lint                                                                                                              | Typecheck                                                                                      | Test                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@iwana/api`    | `pnpm exec turbo run lint --filter=@iwana/api --force` — EXIT 0; 0 errores, 7 warnings; 4 tareas, 0 cacheadas     | `pnpm exec turbo run typecheck --filter=@iwana/api --force` — EXIT 0; 4 tareas, 0 cacheadas    | `pnpm exec turbo run test --filter=@iwana/api --force` — EXIT 0; `Test Suites: 4 skipped, 375 passed, 375 of 379 total`; `Tests: 15 skipped, 4983 passed, 4998 total`; 4 tareas, 0 cacheadas |
| `@iwana/shared` | `pnpm exec turbo run lint --filter=@iwana/shared --force` — EXIT 0; 0 warnings; 1 tarea, 0 cacheadas              | `pnpm exec turbo run typecheck --filter=@iwana/shared --force` — EXIT 0; 1 tarea, 0 cacheadas  | `pnpm exec turbo run test --filter=@iwana/shared --force` — EXIT 0; 18 suites y 168 tests pasaron, 0 omitidos; 1 tarea, 0 cacheadas                                                          |
| `@iwana/db`     | `pnpm exec turbo run lint --filter=@iwana/db --force` — EXIT 0; 0 errores, 5 warnings; 2 tareas, 0 cacheadas      | `pnpm exec turbo run typecheck --filter=@iwana/db --force` — EXIT 0; 2 tareas, 0 cacheadas     | `pnpm exec turbo run test --filter=@iwana/db --force` — EXIT 0; 66 suites y 395 tests pasaron, 0 omitidos; 2 tareas, 0 cacheadas                                                             |
| `@iwana/portal` | `pnpm exec turbo run lint --filter=@iwana/portal --force` — EXIT 0; 0 errores, 46 warnings; 3 tareas, 0 cacheadas | `pnpm exec turbo run typecheck --filter=@iwana/portal --force` — EXIT 0; 3 tareas, 0 cacheadas | `pnpm exec turbo run test --filter=@iwana/portal --force` — EXIT 0; 299 suites, 3.004 tests pasaron, 1 test omitido; 2 tareas, 0 cacheadas                                                   |
| `@iwana/worker` | `pnpm exec turbo run lint --filter=@iwana/worker --force` — EXIT 0; 0 errores, 1 warning; 4 tareas, 0 cacheadas   | `pnpm exec turbo run typecheck --filter=@iwana/worker --force` — EXIT 0; 4 tareas, 0 cacheadas | `pnpm exec turbo run test --filter=@iwana/worker --force` — EXIT 0; 20 suites y 169 tests pasaron, 0 omitidos; 4 tareas, 0 cacheadas                                                         |

Los warnings de lint no son errores y no hicieron fallar los comandos. Los tests omitidos de las suites unitarias son los reflejados literalmente en la tabla; no se contaron como aprobados.

## Integración PostgreSQL y aislamiento del tenant

Antes de ejecutar la integración se inspeccionó metadata sin leer datos personales. En `dbiw` no había schemas `tenant_i4_qa_%`; se usó el tenant sintético desechable `srqa-mod05-e3-8fd22bc0b2c0`, creado por E4-A. La metadata confirmó estado `INACTIVE`, fila de migración `SubscriberContactNullable1480000000000` y nulabilidad de `subscribers.email_encrypted`, `subscribers.phone_encrypted` y `party_contact.value`. El tenant no se reactivó.

Comando ejecutado:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE='true'; $env:DB_HOST='127.0.0.1'; $env:DB_PORT='5433'; $env:DB_NAME='dbiw'; $env:E2E_TENANT_SLUG='srqa-mod05-e3-8fd22bc0b2c0'; pnpm --filter @iwana/api test:integration
```

Resultado: EXIT 0, `Test Suites: 2 skipped, 17 passed, 17 of 19 total`; `Tests: 14 skipped, 76 passed, 90 total`. Se ejecutaron suites no omitidas, incluidas las de contacto pendiente y backfill. Los dos skips son `inventory-execution-request.ola3d` y `execution-orders.item-usage-projection`, que requieren `DB_NAME=i4_qa_20261006_a1`. No se eligió ni se modificó otro tenant o base para intentar satisfacer ese requisito. Por ello, el gate de integración queda **BLOCKED/parcial**, aunque los 17 specs que sí corrieron pasaron.

Después de la corrida, metadata confirmó que el tenant seguía `INACTIVE` y con la migración 148 registrada. Los conteos post-cleanup fueron `execution_orders=0`, `schedule_events=0`, `inventory_categories=0`, `inventory_items=0`; `execution_order_templates=1` quedó como fila de fixture/base. La verificación consultó conteos y metadata, no valores personales ni secretos.

La migración también se ejercitó de forma aislada:

- `pnpm --filter @iwana/db test:integration -- --runInBand --runTestsByPath src/migrations/tenant/148_subscriber_contact_nullable.integration.spec.ts` — EXIT 0; 1 suite/1 test pasó. Contra PostgreSQL real verificó `up/down/up` y que `down` rechaza columnas `NULL`.
- `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --runInBand` — EXIT 0; 1 suite/6 tests pasaron, incluidos registro, orden, ausencia de nombres duplicados y concordancia nombre/clase.

## Cobertura de módulos core

Comando de cobertura fresca, sin Turbo:

```text
pnpm --filter @iwana/api exec jest --coverage --coverageReporters=text-summary --coverageReporters=json-summary
```

EXIT 0; misma corrida API: 375 suites y 4.983 tests pasaron, 4 suites/15 tests omitidos. `apps/api/coverage/coverage-summary.json` fue generado por Jest y está ignorado por Git. Cobertura general API: **74,73% líneas; 65,62% statements; 53,47% branches; 63,02% functions**.

| Módulo core revisado                                              | Líneas | Statements | Branches | Functions | Evaluación ≥80% |
| ----------------------------------------------------------------- | -----: | ---------: | -------: | --------: | --------------- |
| `modules/crm/expedientes/expediente.service.ts`                   | 76,61% |     74,35% |   56,80% |    79,71% | **Falla**       |
| `modules/crm/subscribers/subscribers.service.ts`                  | 94,94% |     95,02% |   81,15% |    91,48% | Cumple          |
| `modules/crm/subscribers/subscriber-creation.service.ts`          | 96,77% |     96,84% |   82,89% |    90,90% | Cumple          |
| `modules/crm/subscribers/subscriber-status-transition.service.ts` | 98,66% |     98,71% |   94,59% |      100% | Cumple          |
| `modules/crm/subscribers/subscriber-projection.ts`                |   100% |       100% |     100% |      100% | Cumple          |
| `modules/crm/subscribers/subscriber-contact.util.ts`              |   100% |       100% |     100% |      100% | Cumple          |
| `modules/parties/services/party-contact.service.ts`               |   100% |       100% |   88,88% |      100% | Cumple          |
| `modules/parties/party-pii.util.ts`                               |   100% |       100% |     100% |      100% | Cumple          |
| `modules/parties/adapters/party-write.adapter.ts`                 |   100% |       100% |   94,11% |      100% | Cumple          |

El criterio del plan y `AGENTS.md` exige ≥80% en módulos core; por tanto, el gate de cobertura queda **FAIL** mientras `expediente.service.ts` continúe por debajo del umbral.

## Matriz de gates

| Gate                                        | Estado                          | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint y typecheck de los cinco paquetes      | **Cumple**                      | 10 comandos Turbo, todos EXIT 0; cero cache hits; warnings de lint detallados arriba.                                                                                                                                                                                                                                                                                                                      |
| Tests de los cinco paquetes                 | **Cumple con skips declarados** | 5 comandos `pnpm exec turbo run test ... --force`; salidas con conteos no cero y cero cache hits.                                                                                                                                                                                                                                                                                                          |
| Integración API exigida                     | **BLOCKED/parcial**             | EXIT 0 con 17/19 suites y 76/90 tests; 2 specs/14 tests requieren `i4_qa_20261006_a1` y no se ejecutaron. Tenant sintético comprobado `INACTIVE`.                                                                                                                                                                                                                                                          |
| Cobertura ≥80% de módulos core              | **Falla**                       | Cobertura fresca muestra `expediente.service.ts` en 76,61% líneas, 74,35% statements, 56,80% branches y 79,71% functions.                                                                                                                                                                                                                                                                                  |
| Sin violaciones de boundary                 | **Falla/observación abierta**   | Boundary-reviewer reporta `apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts:366`: `QueryRunner` ejecuta `SET search_path TO ${target}` fuera de una transacción; puede persistir al devolver la conexión al pool y contraviene `SET LOCAL` por transacción. No reportó cruces productivos de boundary ni schema/tenant hardcodeados. E4-C no modifica el hallazgo. |
| OpenAPI actualizado si hay endpoints nuevos | **No aplica**                   | Diff revisado: `ADDED_ROUTE_DECORATORS=0`; no se agregaron decoradores de rutas.                                                                                                                                                                                                                                                                                                                           |
| Migración 148 reversible y registrada       | **Cumple**                      | Integración Postgres real `up/down/up` (1/1), rechazo de `down` ante `NULL`; migration-order 6/6.                                                                                                                                                                                                                                                                                                          |
| Sin PII en logs y respuestas revisadas      | **Cumple en el alcance E4-B**   | [Informe E4-B](INFORME-MOD05-E3-E4-SEC-v1.0.md) emite GO para CLI, `contactPending`, errores 422 y búsqueda de escritores de placeholders/centinela.                                                                                                                                                                                                                                                       |
| Sin vulnerabilidades críticas nuevas        | **No aplica**                   | No hay cambios de manifiestos/lockfile de dependencias en el diff; no se ejecutó `pnpm audit`.                                                                                                                                                                                                                                                                                                             |
| E2E real y criterios CA-E3-01 a CA-E3-04    | **Falla**                       | [Informe E4-A](INFORME-MOD05-E3-E4-QA-v1.0.md): 1 test descubierto, 0 aprobado/1 fallido; conversión no creó suscriptor y los cuatro criterios quedaron sin ejecutar o verificar.                                                                                                                                                                                                                          |
| G6.5 (CI Linux por SHA)                     | **Sin evidencia**               | Este encargo ejecutó verificaciones locales; no se recibió una corrida Linux de GitHub Actions identificada por SHA.                                                                                                                                                                                                                                                                                       |

## Relación E4-A y E4-B

E4-A queda **BLOQUEADO** y no se considera que las suites unitarias o las integraciones API sustituyan el E2E portal real. E4-B queda **GO** únicamente para la revisión estática de seguridad especificada. Estos estados no cierran los gates de cobertura, integración omitida ni boundary.

## Gates abiertos y decisión

- Elevar la cobertura de `expediente.service.ts` a ≥80% según las métricas aplicables.
- Resolver el requisito de base `i4_qa_20261006_a1` o acordar una ejecución aislada y segura para las dos suites omitidas; no se usó ni modificó otra base/tenant en E4-C.
- Revisar y corregir, fuera del alcance de este verificador, el `SET search_path` observado por boundary-reviewer.
- Desbloquear E4-A y ejecutar aserciones CA-E3-01 a CA-E3-04 en el E2E real.
- G6.5 requiere evidencia CI Linux por SHA conforme al protocolo.

**Decisión E4-C: NO-GO.** No se declara completitud de gates ni merge readiness.

La ruta `docs/informes/INFORME-MOD05-E3-E4-GATES-v1.0.md` estaba libre antes de crear este informe. No se corrigió código, tests ni configuración, y no se realizó commit.
