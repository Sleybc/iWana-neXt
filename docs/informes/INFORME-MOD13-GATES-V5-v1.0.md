# INFORME MOD13 — Gates V5

**Versión:** 1.0 · **Fecha:** 2026-10-23 · **Bloque:** Ola 15 · **Estado:** Gates parciales; G7 sigue abierto.

## Evidencia

Las pruebas con Turbo se ejecutaron con `--force`; todas muestran `cache bypass` y cero tareas servidas desde caché. Los conteos son de la salida de Jest.

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Lint y typecheck | **cumple** | Para cada uno de `@iwana/api`, `@iwana/worker`, `@iwana/portal`, `@iwana/shared` y `@iwana/db` se ejecutaron por separado `pnpm --filter <paquete> lint` y `pnpm --filter <paquete> typecheck`; los 10 comandos terminaron con código 0. ESLint reportó 7 advertencias en API, 43 en portal y 5 en DB; 0 errores. Worker y shared sin advertencias. |
| Tests API | **falla** | `pnpm exec turbo run test --filter=@iwana/api --force`: **1 suite fallida, 4 omitidas, 412 aprobadas (417 total); 2 tests fallidos, 15 omitidos, 5.487 aprobados (5.504 total)**. Las suites omitidas son guardas de DB real en inventario (`EV1_REAL_DB`) y tenant (`TENANT_MIGRATIONS_REAL_DB`); Jest no las activó en la corrida unitaria. Falló `src/common/log-error-safety.architecture.spec.ts`: detecta un argumento de log inseguro en `network-execution-event.processor.ts:263` y ausencia de `@SanitizeFailedReason` en los procesadores `network-execution-event.processor.ts:170` y `network-provisioning-reconciler.processor.ts:121`. |
| Tests worker | **cumple** | `pnpm exec turbo run test --filter=@iwana/worker --force`: **21/21 suites y 173/173 tests aprobados**; 0 omitidos; Turbo `0 cached`. |
| Tests portal | **cumple** | `pnpm exec turbo run test --filter=@iwana/portal --force`: **322/322 suites; 3.255 aprobados, 1 omitido (3.256 total)**; Turbo `0 cached`. El único skip es `InventoryClient.spec.tsx:2244`, caso explícitamente marcado `it.skip`. |
| Tests shared | **cumple** | `pnpm exec turbo run test --filter=@iwana/shared --force`: **24/24 suites y 230/230 tests aprobados**; Turbo `0 cached`. |
| Tests DB | **cumple** | `pnpm exec turbo run test --filter=@iwana/db --force`: **76/76 suites y 421/421 tests aprobados**; incluye las specs de las migraciones 163 y 164; Turbo `0 cached`. |
| Cobertura `network` y puertos/adaptadores | **falla** | Jest con cobertura y PostgreSQL real: **14/14 suites, 74/74 tests**. El resumen agregado para `apps/api/src/modules/network` da **49,92 % statements (646/1.294), 51,16 % líneas (615/1.202), 40,85 % branches (241/590) y 38,62 % funciones (73/189)**. No alcanza el 80 %. Huecos principales: `network-catalog.service.ts` 13,41 % statements; `network-execution-event.processor.ts` 21,75 %; `service-provisioning.service.ts` 65,78 %; `network-provisioning-reconciler.processor.ts` 64,34 %; `service-provisioning-read.adapter.ts` y `service-provisioning-commercial-status.adapter.ts` 0 %. En las fronteras MOD11–MOD12, `InstalledEquipmentReadAdapter` llegó a **100 %** (15/15 statements, 3/3 funciones, 2/2 branches); los listeners de activación de CRM e Inventario quedaron en **0 %** en esta corrida. El puerto `ExecutionOrderReadPort` quedó en 100 %; los puertos tipo-only de aprovisionamiento no generan comportamiento ejecutable que medir. |
| Reversibilidad y orden de migraciones | **cumple** | 163 y 164 incluyen `up()` y `down()` y están registradas en `TENANT_MIGRATIONS`. `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --runInBand`: **1 suite, 6/6 tests aprobados**. La integración de migraciones 163/164 contra PostgreSQL real, con reversión de v2 y v3 heredada, consta como **1 suite, 3/3 tests** en [el informe de migraciones](INFORME-MOD13-MIGRACIONES-163-164-v1.0.md). No se migraron tenants durante V5. |
| OpenAPI | **cumple** | Revisión estática de los controladores de Network: `network-catalog.controller.ts` declara **14/14 rutas** con `@ApiOperation` y decorador de respuesta; `network-provisioning.controller.ts`, **7/7**. El DTO de catálogo declara campos mediante `@ApiProperty`/`@ApiPropertyOptional`. |
| Sin PII ni datos sensibles en logs | **falla** | No se añadieron llamadas `logger.*` ni `console.*` en las líneas modificadas del diff. Aun así, el guard ejecutado dentro de la suite API falla por el argumento de log en `network-execution-event.processor.ts:263` y por los dos procesadores sin sanitización de `failedReason` indicados arriba. No se declara cerrado el gate de logging. |
| Fronteras de módulos | **cumple** | Hay revisión previa en [el informe de frontera y contratos](INFORME-MOD13-REVISION-FRONTERA-CONTRATOS-v1.0.md) §Frontera. El ajuste B-fix dejó `CrmModule` dependiendo de `NetworkCommercialStatusModule`, que expone solo el puerto; la guarda de arquitectura de Network y las pruebas de frontera de Tasks pasaron en la corrida completa de API. |
| Vulnerabilidades críticas | **no aplica** | `git diff --name-only` no muestra cambios en `package.json` ni `pnpm-lock.yaml`; no se ejecutó `pnpm audit`. |
| Build del portal sin `EPERM` | **cumple** | Tras confirmación de V4-plan de **6/6 capturas** y liberación de `apps/portal/.next`, `pnpm --filter @iwana/portal build` terminó con **código 0**. Next.js compiló, completó TypeScript y generó **45/45 páginas estáticas**, sin `EPERM`. Se ejecutó directamente, sin Turbo. |

### Comandos de cobertura

- Exploración unitaria: `pnpm --filter @iwana/api exec jest src/modules/network --listTests` encontró **9 specs**.
- Cobertura focalizada de red: `pnpm --filter @iwana/api exec jest src/modules/network --coverage --runInBand ...` ejecutó **9 suites / 30 tests** y midió 40,64 % de statements en la selección unitaria; el comando terminó en código 1 porque la configuración global también exige incluir `serialized-asset-useful-life.util.ts`.
- Corrida combinada para el porcentaje informado: `pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --coverage --runTestsByPath ... --testRegex='.*\.spec\.ts$' ...`, con casos unitarios y de integración de Network e inventario. El probe confirmó PostgreSQL en `127.0.0.1:5433/dbiw`; las fixtures usaron schemas efímeros.

## Gates abiertos

- Elevar la cobertura de Network y de los listeners/adaptadores de aprovisionamiento por debajo del 80 %.
- Corregir la seguridad del logging señalada por `log-error-safety.architecture.spec.ts` y volver a pasar la suite API completa.

## Confirmación Ola 16

Esta sección actualiza los gates de API, logging y cobertura que estaban abiertos en V5. La evidencia anterior se conserva como registro histórico.

| Gate | Estado Ola 16 | Evidencia |
| --- | --- | --- |
| Logging seguro | **cumple** | `log-error-safety.architecture.spec.ts` pasó en la suite API completa. `NetworkExecutionEventProcessor.process` y `NetworkProvisioningReconcilerProcessor.process` usan `@SanitizeFailedReason`; los logs de reintento y de persistencia fallida omiten código e identificadores derivados del evento. |
| Cobertura `network` y listeners | **cumple** | Combinación de specs unitarias de `network`, integraciones PostgreSQL con schemas efímeros, listeners de activación CRM e Inventario y `InstalledEquipmentReadAdapter` en PostgreSQL: **19 suites aprobadas, 2 omitidas (21 total); 139 tests aprobados, 7 omitidos (146 total)**. Cobertura agregada: **87,05 % statements (1.204/1.383), 88,28 % líneas (1.130/1.280), 84,34 % funciones (167/198) y 70,44 % branches (429/609)**. El alcance incluye `modules/network/**/*.ts` salvo specs, los dos listeners y el adaptador de lectura de equipos instalados. El reporte se escribió en `%TEMP%`. La spec `network.wiring.postgres.integration.spec.ts`, que usa FX-v1, se excluyó de la medición final; Redis se fijó en `IWANA_REDIS_INTEGRATION_AVAILABLE=false`, por lo que las dos suites que requieren Redis quedaron omitidas. No se migró ni se alteró `tenant_iwana` ni FX-v1. |
| Tests API completos | **cumple** | `pnpm exec jest --runInBand --no-cache` desde `apps/api`: **419 suites aprobadas, 4 omitidas (423 total); 5.577 tests aprobados, 15 omitidos (5.592 total)**; duración **679,858 s**. La corrida unitaria ignora `*.postgres.integration.spec.ts` por configuración de Jest. |
| Lint y typecheck API | **cumple** | `pnpm --filter @iwana/api lint` y `pnpm --filter @iwana/api typecheck`: ambos código 0. ESLint reportó **7 advertencias y 0 errores**, en `main.ts`, `audit-export.helper.ts`, `in-memory-tenant-store.ts`, `execution-order-templates.controller.ts` y `tax-presets.seeder.ts`; ninguna corresponde a los archivos de MOD13 tocados en Ola 16. |

En una corrida exploratoria anterior a la medición final, `network.wiring.postgres.integration.spec.ts` se seleccionó una vez: el endpoint de reserva respondió 422, no devolvió un identificador de aprovisionamiento y su limpieza no tuvo una reserva que liberar. La spec se excluyó de la evidencia final para evitar más interacción con FX-v1. Las dos suites y siete tests omitidos de la medición focalizada son el total que Jest reportó para la selección combinada; las dos suites requieren Redis. La suite API completa omite cuatro suites y quince tests según el resumen real de Jest.

### Comprobación del workspace

- Las salidas de cobertura de Ola 16 quedaron bajo `%TEMP%`; no se creó caché Jest dentro del repositorio.
- No se ejecutaron specs contra el tenant compartido, no se migraron tenants y no se creó commit.
