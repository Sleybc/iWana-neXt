# Informe de gates — MOD05 E-3 · F4

| Campo       | Valor                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                         |
| Responsable | AI-GATE-VERIFIER (verificador auxiliar)                                                            |
| Resultado   | **NO-GO**                                                                                          |
| Alcance     | Lint, typecheck, tests sin caché, integración API real, cobertura §6.2 y gates de merge aplicables |

## Resultado ejecutivo

Las 15 ejecuciones Turbo solicitadas terminaron con código 0 y `Cached: 0 cached`. La integración API contra PostgreSQL terminó con código 0, pero omitió dos suites (14 tests) que requieren la base `i4_qa_20261006_a1`. La cobertura fresca cumple el umbral de statements y cubre todas las líneas ejecutables modificadas de `expediente.service.ts`; **no cumple branches**, con 58,69% frente al 80% exigido por §6.2. Por ello la decisión global es **NO-GO**.

El E2E F2 reporta `1/1` aprobado, CA-E3-01 a CA-E3-04 aprobados y tenant sintético confirmado `INACTIVE`. La aserción condicional del banner para un fallo de conversión no se activó. AI-BOUNDARY-REV no encontró hallazgos. Sec-eng emitió NO-GO porque tres logs F1 incluyen el UUID del expediente.

## Lint, typecheck y tests por paquete

Cada comando Turbo se ejecutó por separado con `--force`. La salida de cada invocación indicó cero tareas cacheadas.

| Paquete         | Lint                                                                                                              | Typecheck                                                                                      | Test                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@iwana/api`    | `pnpm exec turbo run lint --filter=@iwana/api --force` — EXIT 0; 4 tareas, 0 cacheadas; 0 errores, 7 warnings     | `pnpm exec turbo run typecheck --filter=@iwana/api --force` — EXIT 0; 4 tareas, 0 cacheadas    | `pnpm exec turbo run test --filter=@iwana/api --force` — EXIT 0; `Test Suites: 4 skipped, 376 passed, 376 of 380 total`; `Tests: 15 skipped, 4993 passed, 5008 total`; 4 tareas, 0 cacheadas                              |
| `@iwana/shared` | `pnpm exec turbo run lint --filter=@iwana/shared --force` — EXIT 0; 1 tarea, 0 cacheadas; 0 warnings              | `pnpm exec turbo run typecheck --filter=@iwana/shared --force` — EXIT 0; 1 tarea, 0 cacheadas  | `pnpm exec turbo run test --filter=@iwana/shared --force` — EXIT 0; 18 suites, 168 tests pasaron; 1 tarea, 0 cacheadas                                                                                                    |
| `@iwana/db`     | `pnpm exec turbo run lint --filter=@iwana/db --force` — EXIT 0; 2 tareas, 0 cacheadas; 0 errores, 5 warnings      | `pnpm exec turbo run typecheck --filter=@iwana/db --force` — EXIT 0; 2 tareas, 0 cacheadas     | `pnpm exec turbo run test --filter=@iwana/db --force` — EXIT 0; 66 suites, 395 tests pasaron; 2 tareas, 0 cacheadas                                                                                                       |
| `@iwana/portal` | `pnpm exec turbo run lint --filter=@iwana/portal --force` — EXIT 0; 3 tareas, 0 cacheadas; 0 errores, 46 warnings | `pnpm exec turbo run typecheck --filter=@iwana/portal --force` — EXIT 0; 3 tareas, 0 cacheadas | `pnpm exec turbo run test --filter=@iwana/portal --force` — EXIT 0; 299 suites pasaron; `Tests: 1 skipped, 3004 passed, 3005 total`; 2 tareas, 0 cacheadas. Jest forzó la salida de un worker que no terminó limpiamente. |
| `@iwana/worker` | `pnpm exec turbo run lint --filter=@iwana/worker --force` — EXIT 0; 4 tareas, 0 cacheadas; 0 errores, 1 warning   | `pnpm exec turbo run typecheck --filter=@iwana/worker --force` — EXIT 0; 4 tareas, 0 cacheadas | `pnpm exec turbo run test --filter=@iwana/worker --force` — EXIT 0; 20 suites, 169 tests pasaron; 4 tareas, 0 cacheadas                                                                                                   |

Los warnings de lint y el aviso del worker de Jest se conservaron como salida; no cambiaron los códigos de salida ni los conteos aprobados. Los skips de Jest no se contaron como aprobados.

## Integración API con PostgreSQL

Comando ejecutado con el tenant sintético indicado, contra PostgreSQL `127.0.0.1:5433/dbiw`:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE='true'; $env:DB_HOST='127.0.0.1'; $env:DB_PORT='5433'; $env:DB_NAME='dbiw'; $env:E2E_TENANT_SLUG='srqa-mod05-e3-3dbb1e8f72a8'; pnpm --filter @iwana/api test:integration
```

EXIT 0; `Test Suites: 2 skipped, 18 passed, 18 of 20 total`; `Tests: 14 skipped, 81 passed, 95 total`. Los skips son:

- `inventory-execution-request.ola3d.postgres.integration.spec.ts`
- `execution-orders.item-usage-projection.postgres.integration.spec.ts`

Ambos requieren `DB_NAME=i4_qa_20261006_a1`; la ejecución actual no los contó como pasados ni cambió de base para ejecutarlos. Las suites de contacto pendiente, conversión B5 y CLI sí quedaron entre las que pasaron.

La reversibilidad de la migración 148 está respaldada por el informe E1: `up/down/up` y bloqueo de `down` ante `NULL`, 1 suite/1 test en PostgreSQL real con schema efímero. En F4, `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts` pasó 1 suite/6 tests; la migración 148 tiene `down()` y está registrada en `TENANT_MIGRATIONS`. El informe F2 confirma que el tenant `srqa-mod05-e3-3dbb1e8f72a8` quedó `INACTIVE`. F4 no obtuvo una lectura independiente del ledger 148 de ese schema; la evidencia de runtime de 148 corresponde a los fixtures efímeros de E1/B5.

## Cobertura fresca de §6.2

Comando ejecutado sin Turbo, con reporte JSON nuevo:

```text
pnpm --filter @iwana/api exec jest --coverage --coverageReporters=text-summary --coverageReporters=json-summary --coverageReporters=json
```

EXIT 0; 376 suites y 4.993 tests pasaron; 4 suites y 15 tests se omitieron. `apps/api/coverage/coverage-summary.json` reporta el agregado de 30 archivos `crm/expedientes`:

| Métrica    |         Cobertura fresca | Umbral §6.2 | Estado    |
| ---------- | -----------------------: | ----------: | --------- |
| Statements | 1.829/2.227 = **82,13%** |        ≥80% | Cumple    |
| Branches   |     520/886 = **58,69%** |        ≥80% | **Falla** |

Para alcanzar 80% en branches se requieren 709 ramas cubiertas; faltan 189. No se amplió el alcance para corregir esa deuda.

En `expediente.service.ts`, la corrida fresca da 78,92% líneas (760/963), 76,56% statements (781/1.020), 58,25% branches (307/527) y 82,14% functions (115/140). Las cuatro métricas aumentan frente a E4-C v1.0 (76,61%, 74,35%, 56,80% y 79,71%, respectivamente). Comparando el diff con `coverage-final.json`, las **23/23 líneas ejecutables añadidas/modificadas** registran hits. Los imports y llaves sin instrucción ejecutable no forman parte de ese conteo.

## Matriz de gates

| Gate                               | Estado            | Evidencia                                                                                                                                                                                                                                                                    |
| ---------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint y typecheck de cinco paquetes | **Cumple**        | 10 comandos Turbo separados; todos EXIT 0 y `Cached: 0 cached`. Warnings por paquete están detallados arriba.                                                                                                                                                                |
| Tests de cinco paquetes            | **Cumple**        | 5 comandos Turbo separados; salidas Jest no vacías y `Cached: 0 cached`. Ver conteos y skips por paquete arriba.                                                                                                                                                             |
| Integración API requerida          | **Sin evidencia** | EXIT 0; 18/20 suites y 81/95 tests. 2 suites/14 tests requieren `i4_qa_20261006_a1` y quedaron omitidos.                                                                                                                                                                     |
| Cobertura core §6.2                | **Falla**         | `crm/expedientes` branches 520/886 = 58,69%, menor que 80%. Statements 82,13% y líneas ejecutables cambiadas del servicio 23/23 cubiertas.                                                                                                                                   |
| Boundary Modulith                  | **Cumple**        | AI-BOUNDARY-REV reportó cero hallazgos. `b5-identity-conversion.postgres.integration.spec.ts:366-368,383-385` usa `runInTenantSchema`; el helper aplica transacción y `SET LOCAL search_path` (`packages/database/src/data-source.ts:182-220`).                              |
| OpenAPI si hay rutas nuevas        | **No aplica**     | La búsqueda en el diff no encontró decoradores nuevos `@Get/@Post/@Patch/@Put/@Delete`.                                                                                                                                                                                      |
| Migración reversible y registrada  | **Cumple**        | E1: Postgres real `up/down/up`, bloqueo de `down` con NULL (1/1); F4 migration-order (6/6); `down()` y registro de 148 comprobados.                                                                                                                                          |
| No PII en logs                     | **Falla**         | [Informe sec-eng E4 v1.1](INFORME-MOD05-E3-E4-SEC-v1.1.md): `expediente.service.ts:3018,3023,3038` interpola UUID de expediente en logs enlazables a PII. La revisión sec-eng encontró que el CLI F3 pasa A-1..A-3; `response.code` sin allowlist queda como hardening bajo. |
| Vulnerabilidades críticas nuevas   | **No aplica**     | `git status` no muestra cambios en manifiestos de dependencias ni `pnpm-lock.yaml`; por esa condición no se ejecutó `pnpm audit`.                                                                                                                                            |
| E2E real y CA-E3-01..04            | **Cumple**        | Informe F2 v1.1: Playwright real sin interceptores, 1/1 aprobado; los cuatro CA pasan; tenant confirmado `INACTIVE`.                                                                                                                                                         |
| Banner ante fallo de conversión    | **Sin evidencia** | El condicional del E2E F2 no se activó porque la conversión se resolvió; no se comprobó el banner para un fallo.                                                                                                                                                             |
| Registro 148 del tenant F2         | **Sin evidencia** | No se consultó directamente el ledger de ese schema; el PASS de E1 valida `up/down/up` en schema efímero y B5 usa fixtures sintéticos.                                                                                                                                       |
| G6.5 — CI Linux por SHA            | **Sin evidencia** | No se proporcionó una corrida CI vinculada a SHA.                                                                                                                                                                                                                            |

## Gates abiertos y decisión

- Elevar branches agregados de `crm/expedientes` a ≥80% según el criterio de §6.2.
- Completar la evidencia de las dos suites de integración que exigen `i4_qa_20261006_a1` en su entorno correspondiente.
- Retirar el UUID de los tres logs señalados en `apps/api/src/modules/crm/expedientes/expediente.service.ts:3018,3023,3038`, usando un identificador operativo no enlazable, y repetir el gate de logs.
- Obtener evidencia G6.5 de CI Linux por SHA.
- Ejercitar la aserción condicional del banner de conversión fallida si ese criterio adicional sigue vigente para el cierre.
- Confirmar directamente el registro de migración 148 en el schema del tenant F2; F4 se apoya en la integración de migración de E1 y fixtures B5, no en una lectura del ledger de ese tenant.

**Decisión F4: NO-GO.** Los gates de lint/typecheck/tests y la reversibilidad/registro de 148 tienen evidencia aprobada, pero el umbral de branches falla y quedan gates parciales o sin evidencia.

La ruta `docs/informes/INFORME-MOD05-E3-E4-GATES-v1.1.md` estaba libre antes de crear este informe. Solo se añadió este informe; no se modificaron código, tests ni configuración, y no se hizo commit.
