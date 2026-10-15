# INFORME MOD05 E-3 · H4 gates

| Campo       | Valor                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                                                                           |
| Responsable | AI-GATE-VERIFIER                                                                                                                                     |
| Resultado   | **NO-GO**                                                                                                                                            |
| Alcance     | Cinco paquetes, integración API contra PostgreSQL migrado, migración 148 y cobertura D1 frente a `fb3d41ee`, incluidas líneas ejecutables cambiadas. |

## Resumen

Los 15 comandos Turbo de lint, typecheck y test terminaron con exit 0 y `Cached: 0 cached`. La integración API contra PostgreSQL también terminó con exit 0: 19 suites y 83 tests aprobados; las dos suites y 14 tests omitidos requieren sus fixtures de inventario. El tenant de integración quedó `INACTIVE` y su ledger contiene `SubscriberContactNullable1480000000000`.

La comparación D1 de las cuatro métricas agregadas de `crm/expedientes` supera la línea base `fb3d41ee` tras excluir únicamente el spec de integración nuevo que no se ejecuta en el test unitario. Sin embargo, las líneas ejecutables modificadas no alcanzan el 100 %: API **52/55**, Portal **51/51**, total **103/106**. Por este incumplimiento el resultado es **NO-GO**. Las tres líneas API sin cobertura están en `expediente.service.ts:1328, 1329, 1338`.

## 15 comandos Turbo sin caché

Se ejecutó cada comando indicado individualmente. En cada salida, Turbo reportó `Cached: 0 cached`; el total de tareas incluye las dependencias del paquete. Los warnings de lint no causaron errores ni cambiaron el exit code.

| Paquete         | Lint                                                                                                                        | Typecheck                                                                         | Test                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@iwana/api`    | `pnpm exec turbo run lint --filter=@iwana/api --force` — exit 0; 4 tareas; 0 errores, 12 warnings (API 7, DB dependencia 5) | `pnpm exec turbo run typecheck --filter=@iwana/api --force` — exit 0; 4 tareas    | `pnpm exec turbo run test --filter=@iwana/api --force` — exit 0; 376 suites aprobadas, 4 omitidas/380; 5.000 tests aprobados, 15 omitidos/5.015; 4 tareas |
| `@iwana/shared` | `pnpm exec turbo run lint --filter=@iwana/shared --force` — exit 0; 1 tarea; 0 warnings                                     | `pnpm exec turbo run typecheck --filter=@iwana/shared --force` — exit 0; 1 tarea  | `pnpm exec turbo run test --filter=@iwana/shared --force` — exit 0; 18 suites, 168 tests aprobados; 1 tarea                                               |
| `@iwana/db`     | `pnpm exec turbo run lint --filter=@iwana/db --force` — exit 0; 2 tareas; 0 errores, 5 warnings                             | `pnpm exec turbo run typecheck --filter=@iwana/db --force` — exit 0; 2 tareas     | `pnpm exec turbo run test --filter=@iwana/db --force` — exit 0; 66 suites, 395 tests aprobados; 2 tareas                                                  |
| `@iwana/portal` | `pnpm exec turbo run lint --filter=@iwana/portal --force` — exit 0; 3 tareas; 0 errores, 46 warnings                        | `pnpm exec turbo run typecheck --filter=@iwana/portal --force` — exit 0; 3 tareas | `pnpm exec turbo run test --filter=@iwana/portal --force` — exit 0; 299 suites aprobadas; 3.024 tests aprobados, 1 omitido/3.025; 2 tareas                |
| `@iwana/worker` | `pnpm exec turbo run lint --filter=@iwana/worker --force` — exit 0; 4 tareas; 0 errores, 1 warning de Worker y 5 de DB      | `pnpm exec turbo run typecheck --filter=@iwana/worker --force` — exit 0; 4 tareas | `pnpm exec turbo run test --filter=@iwana/worker --force` — exit 0; 20 suites, 169 tests aprobados; 4 tareas                                              |

Las líneas `Test Suites:` y `Tests:` de API y Portal incluyen los conteos de omitidos, no solo los aprobados. Los demás paquetes reportaron el total de suites y tests sin skips. Las salidas completas quedaron en `C:\Users\SLEYB\AppData\Local\Temp\mod05-e3-h4-gates-799166fc3af24977a30a630a06ee5a37`.

## Integración API y migración 148

Comando contra PostgreSQL local migrado. No se incluyen credenciales en el informe:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE = 'true'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '5433'
$env:DB_NAME = 'dbiw'
$env:E2E_TENANT_SLUG = 'srqa-mod05-e3-3dbb1e8f72a8'
pnpm --filter @iwana/api test:integration
```

Resultado: exit 0; **19 suites aprobadas, 2 omitidas/21; 83 tests aprobados, 14 omitidos/97**. Pasaron B5, conversión con fallo, contacto pendiente y los CLI de esta fase. Las omitidas son pruebas de inventario que requieren sus bases sintéticas dedicadas.

Una consulta de solo lectura a `dbiw` confirmó que el slug `srqa-mod05-e3-3dbb1e8f72a8` está `INACTIVE`, usa el schema `tenant_srqa_mod05_e3_3dbb1e8f72a8` y registra una vez la migración `SubscriberContactNullable1480000000000`.

Gates de migración ejecutados además del test Turbo:

```text
pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --runInBand --no-cache
exit 0; 1 suite, 6 tests aprobados.
```

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE = 'true'
$env:DB_HOST = '127.0.0.1'; $env:DB_PORT = '5433'; $env:DB_NAME = 'dbiw'
pnpm --filter @iwana/db exec jest --config jest.integration.config.js src/migrations/tenant/148_subscriber_contact_nullable.integration.spec.ts --runInBand --no-cache
```

Resultado: exit 0; 1 suite, 1 test contra PostgreSQL real, con `up/down/up` y rechazo de `down` cuando existen valores `NULL`. El orden y registro de la 148 están incluidos en los seis tests de `migration-order`.

## Cobertura D1 contra `fb3d41ee`

Se generó cobertura API fresca con Jest sin caché, ejecutada en serie. El agregado se calculó sumando `covered` y `total` por métrica en `coverage-summary.json` para `apps/api/src/modules/crm/expedientes/**`. La línea base es el commit completo `fb3d41ee2f99e8d5c53b725149b8e021230e2af2`, obtenida con el mismo Jest, reporteros y alcance. La normalización excluye exactamente el nuevo spec de integración que no se ejecuta en esa corrida unitaria; no se excluyó ningún archivo productivo.

Comando de cobertura del working tree:

```powershell
$covDir = '<directorio temporal nuevo>'
pnpm --filter @iwana/api exec jest --coverage --runInBand --no-cache --coverageDirectory="$covDir" --coverageReporters=text-summary --coverageReporters=json-summary
```

Resultado: exit 0; 376 suites aprobadas, 4 omitidas; 5.000 tests aprobados, 15 omitidos; 289,609 s. Resumen API global: statements 23.738/36.759 (64,57 %), branches 7.936/15.028 (52,80 %), functions 3.281/5.295 (61,96 %), lines 22.476/30.628 (73,38 %). La salida `coverage-summary.json` quedó en `C:\Users\SLEYB\AppData\Local\Temp\mod05-e3-h4-coverage-5272bcc571ef41b5acb0b3afa48d0196\coverage-summary.json`.

| Métrica `crm/expedientes` |   Baseline `fb3d41ee` |    Working tree bruto | Working tree comparable, sin el spec no ejecutado | Diferencia comparable |
| ------------------------- | --------------------: | --------------------: | ------------------------------------------------: | --------------------: |
| Statements                | 1.782/2.204 = 80,85 % | 1.858/2.365 = 78,56 % |                             1.858/2.256 = 82,36 % |              +1,51 pp |
| Branches                  |     501/869 = 57,65 % |     536/919 = 58,32 % |                                 536/905 = 59,23 % |              +1,58 pp |
| Functions                 |     236/311 = 75,88 % |     246/341 = 72,14 % |                                 246/316 = 77,85 % |              +1,97 pp |
| Lines                     | 1.708/2.061 = 82,87 % | 1.783/2.219 = 80,35 % |                         1.783/2.113 = **84,38 %** |              +1,51 pp |

La única exclusión es `apps/api/src/modules/crm/expedientes/tests/g1-conversion-failure.postgres.integration.spec.ts`: aparece en el collector bruto con 0/109 statements, 0/14 branches, 0/25 functions y 0/106 lines, pero Jest la ignora en la corrida unitaria. Se muestra el bruto y la exclusión para que el efecto no quede oculto. La revisión de los conteos corrigió la transcripción aritmética del informe H3: 1.783/2.113 es **84,38 %**, una diferencia de +1,51 pp frente a la línea base. El agregado comparable pasa D1 en las cuatro métricas; branches 59,23 % sigue siendo P1 antes del G7 de MOD05, conforme a la disposición D1.

### Líneas ejecutables cambiadas

La metodología suma líneas añadidas por `git diff --unified=0 fb3d41ee` y las cruza con líneas de inicio e hit count de `statementMap` de Istanbul. Para API se combinaron los mapas frescos de tests unitarios enfocados y las integraciones reales; para Portal se tomó la cobertura dirigida posterior a H2 y la línea `api-client.ts` 1/1 de la verificación anterior, sin cambios posteriores de esa línea.

| Superficie                                   |                          Líneas ejecutables cubiertas |
| -------------------------------------------- | ----------------------------------------------------: |
| API `expediente.service.ts`                  |                                                 42/45 |
| API `expediente-detail-bootstrap.service.ts` |                                                   4/4 |
| API `dto/expediente-detail-bootstrap.dto.ts` |                                                   6/6 |
| API controller                               | 0 líneas ejecutables añadidas; decoradores únicamente |
| **API**                                      |                                             **52/55** |
| Portal `page.tsx`                            |                                                 38/38 |
| Portal `ExpedienteConversionBanner.tsx`      |                                                 12/12 |
| Portal `api-client.ts`                       |                                                   1/1 |
| **Portal**                                   |                                             **51/51** |
| **Total API + Portal**                       |                                           **103/106** |

Las tres líneas sin hit son `apps/api/src/modules/crm/expedientes/expediente.service.ts:1328, 1329, 1338`, en ramas de auditoría/retorno de `retryConversionEvent` cuando no hay evento pendiente o el fallo ya no existe. El gate D1 de cobertura del 100 % de líneas ejecutables cambiadas **falla**.

Corrida dirigida API que produjo el mapa unitario válido:

```powershell
$covDir = '<directorio temporal nuevo>'
pnpm --filter @iwana/api exec jest --runInBand --no-cache --coverage --runTestsByPath src/modules/crm/expedientes/expedientes.controller.fase2.http.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/expediente-detail-bootstrap.service.spec.ts --coverageDirectory="$covDir" --coverageReporters=text-summary --coverageReporters=json --collectCoverageFrom='modules/crm/expedientes/**/*.ts' --coverageThreshold='{"global":{"statements":0,"branches":0,"functions":0,"lines":0}}'
```

Resultado: exit 0; 3 suites, 99 tests. Las integraciones se midieron también con Jest sin caché y reportero JSON, usando los tests reales de API de la corrida PostgreSQL. Las tres líneas citadas permanecieron sin hit en la combinación de ambos mapas.

### Intentos auxiliares de medición

Estos intentos no forman parte de los 15 gates Turbo ni alteran sus resultados:

- La primera corrida de cobertura dirigida de API incluyó el alcance completo del paquete: 3 suites y 99 tests aprobaron, pero el proceso terminó con exit 1 por umbrales de cobertura aplicados a archivos ajenos al cambio y diagnóstico TS6059 de `ts-jest` en `media.module.ts`. Se estrechó `collectCoverageFrom` al módulo CRM; la segunda corrida terminó con exit 0 y se usó para el mapa reportado.
- Una invocación intermedia usó un glob de cobertura con prefijo `src/` incompatible con el `rootDir` de Jest y devolvió un mapa vacío 0/0. No se tomó como evidencia; se corrigió el glob y la corrida útil reportó 3 suites/99 tests.

## Matriz de gates

| Gate                                    | Estado                        | Evidencia                                                                                                                                                                          |
| --------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint y typecheck de cinco paquetes      | **Cumple**                    | 10 comandos Turbo, exit 0; cada uno `Cached: 0 cached`.                                                                                                                            |
| Tests de cinco paquetes sin caché       | **Cumple**                    | 5 comandos Turbo, exit 0 y conteos no vacíos; cada uno `Cached: 0 cached`.                                                                                                         |
| Integración API real                    | **Cumple**                    | `pnpm --filter @iwana/api test:integration`; exit 0; 19/21 suites y 83/97 tests aprobados, con omisiones de inventario explicadas arriba.                                          |
| D1: agregado CRM/expedientes comparable | **Cumple**                    | Cuatro métricas suben frente a `fb3d41ee` al excluir únicamente el spec no ejecutado.                                                                                              |
| D1: 100 % líneas ejecutables cambiadas  | **Falla**                     | API 52/55; Portal 51/51; total 103/106; tres líneas API sin hit.                                                                                                                   |
| Migración 148 reversible y registrada   | **Cumple**                    | `migration-order` 1 suite/6 tests; integración 148 1 suite/1 test; tenant real `INACTIVE` con fila 148.                                                                            |
| OpenAPI actualizado                     | **No aplica**                 | H1 conserva la ruta existente y sus DTOs; no se agregó un endpoint.                                                                                                                |
| No PII en logs                          | **Cumple con disposición D2** | SEC G4 v1.2 y §7.1 D2 aceptan el UUID técnico; H1 registra el retry con actor y valores acotados, sin PII. La revisión sec-eng posterior a H1 queda para la etapa siguiente de H4. |
| Boundaries Modulith                     | **Sin evidencia**             | Hace falta revisión boundary posterior al diff actual; el informe sec-eng anterior deja abierta la lectura de postcondición entre servicios.                                       |
| Vulnerabilidades críticas nuevas        | **No aplica**                 | No hay cambios en manifiestos de paquetes ni `pnpm-lock.yaml`; no se añadió dependencia.                                                                                           |

## Gates abiertos

- Cubrir las líneas ejecutables añadidas sin hit para cerrar D1 en 100 %.
- Ejecutar la revisión `sec-eng` posterior a H1 sobre SEC-G4-01/02 y pedir revisión boundary del diff actual, conforme al orden de H4. Este informe no anticipa esos veredictos.
- Subir branches de `crm/expedientes` a ≥80 % antes del G7 de MOD05; la cobertura comparable actual es 59,23 %, como P1 y fuera del umbral D1 de esta ola.

La ruta `docs/informes/INFORME-MOD05-E3-GATES-v1.3.md` estaba libre antes de crear este informe. No se modificaron código, tests ni configuración y no se hizo commit.

## Validación del informe

- `pnpm exec prettier --check docs/informes/INFORME-MOD05-E3-GATES-v1.3.md`: exit 0, formato correcto.
- `git diff --no-index --check -- NUL docs/informes/INFORME-MOD05-E3-GATES-v1.3.md`: sin diagnósticos de whitespace; devuelve exit 1 porque el informe nuevo se compara como diferencia frente a `NUL`. Un escaneo adicional confirmó `TRAILING_WHITESPACE=0`.
