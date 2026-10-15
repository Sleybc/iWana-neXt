# INFORME MOD05 E-3 · H6 gates

| Campo       | Valor                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                                                 |
| Responsable | AI-GATE-VERIFIER                                                                                                           |
| Resultado   | **GO para el delta D1 de E-3**                                                                                             |
| Alcance     | API Turbo sin caché, líneas ejecutables cambiadas respecto de `fb3d41ee` y cuatro métricas agregadas de `crm/expedientes`. |

## Resultado

El delta cierra el único incumplimiento D1 de GATES v1.3. La API ejecutó sus 380 suites listadas sin caché; las tres líneas que faltaban ahora tienen hit. La cobertura comparable de `crm/expedientes` sigue por encima de `fb3d41ee` en las cuatro métricas. Las líneas cambiadas quedan en **API 55/55 y Portal 51/51**.

## Test API sin caché

Inventario previo:

```powershell
pnpm --filter @iwana/api exec jest --listTests
```

Resultado: **380 rutas de test**.

Comando solicitado:

```powershell
pnpm exec turbo run test --filter=@iwana/api --force
```

Resultado: exit 0; `Test Suites: 4 skipped, 376 passed, 376 of 380 total`; `Tests: 15 skipped, 5002 passed, 5017 total`; `Tasks: 4 successful, 4 total`; `Cached: 0 cached, 4 total`.

## Cobertura agregada de `crm/expedientes`

Se obtuvo un mapa nuevo con Jest, `--runInBand` y `--no-cache`, usando el alcance y reporteros de GATES v1.3:

```powershell
$coverageDirectory = 'C:\Users\SLEYB\AppData\Local\Temp\mod05-e3-h6-coverage-9b8164deed8447f5b7379841dc449f9f'
pnpm --filter @iwana/api exec jest --coverage --runInBand --no-cache --coverageDirectory="$coverageDirectory" --coverageReporters=text-summary --coverageReporters=json-summary
```

Exit 0; 376 suites y 5.002 tests pasaron, 4 suites y 15 tests omitidos. El resumen global de API fue 23.742/36.759 statements (64,58 %), 7.938/15.028 branches (52,82 %), 3.281/5.295 functions (61,96 %) y 22.480/30.628 lines (73,39 %). El resumen del módulo se calculó sumando `covered` y `total` de cada archivo bajo `apps/api/src/modules/crm/expedientes/**` en `coverage-summary.json`.

La única exclusión para la comparación es `tests/g1-conversion-failure.postgres.integration.spec.ts`: el collector lo incluye con cero hits, pero no lo ejecuta el test unitario. Sus conteos brutos son 0/109 statements, 0/14 branches, 0/25 functions y 0/106 lines. La tabla muestra tanto el working tree bruto como el comparable, con esa exclusión explícita. La línea base es el commit completo `fb3d41ee2f99e8d5c53b725149b8e021230e2af2` y los conteos de GATES v1.3, medidos con el mismo Jest y alcance.

| Métrica    |   Baseline `fb3d41ee` |    Working tree bruto | Comparable sin spec no ejecutado | Diferencia comparable |
| ---------- | --------------------: | --------------------: | -------------------------------: | --------------------: |
| Statements | 1.782/2.204 = 80,85 % | 1.862/2.365 = 78,73 % |        1.862/2.256 = **82,54 %** |              +1,69 pp |
| Branches   |     501/869 = 57,65 % |     538/919 = 58,54 % |            538/905 = **59,45 %** |              +1,80 pp |
| Functions  |     236/311 = 75,88 % |     246/341 = 72,14 % |            246/316 = **77,85 %** |              +1,97 pp |
| Lines      | 1.708/2.061 = 82,87 % | 1.787/2.219 = 80,53 % |        1.787/2.113 = **84,57 %** |              +1,70 pp |

El working tree comparable supera la baseline en las cuatro métricas. Branches en 59,45 % sigue registrado como P1 para antes del G7 de MOD05, según la disposición D1; no es el umbral del delta de esta fase.

## Líneas ejecutables cambiadas

Se conserva el método de GATES v1.3: líneas añadidas por `git diff --unified=0 fb3d41ee` cruzadas con `statementMap` y hits de Istanbul. La v1.3 registró API 52/55 y Portal 51/51. La cobertura dirigida fresca de H5, ejecutada de nuevo sobre los dos casos nuevos, informó un hit para cada una de las líneas `expediente.service.ts:1328`, `:1329` y `:1338`. El H5 solo añadió specs, sin cambios productivos. Por ello, el mapa API combinado queda 55/55. El Portal no tuvo cambios desde H4 y conserva su mapa de 51/51.

Comando de cobertura H5 ejecutado en este delta:

```powershell
$coverageDirectory = 'C:\Users\SLEYB\AppData\Local\Temp\mod05-e3-h6-retry-lines-1cb6da77221f4b198f6ae0477819ef77'
pnpm --filter @iwana/api exec jest --runInBand --no-cache --coverage --runTestsByPath src/modules/crm/expedientes/tests/expediente.service.spec.ts --testNamePattern='audita sin evento ni reintento|audita el evento sin reintento' --coverageDirectory="$coverageDirectory" --coverageReporters=json --collectCoverageFrom='modules/crm/expedientes/expediente.service.ts' --coverageThreshold='{"global":{"statements":0,"branches":0,"functions":0,"lines":0}}'
```

Resultado: 1 suite, 2 tests aprobados y 87 omitidos por filtro; `coverage-final.json` marcó hit 1 para cada línea indicada.

| Superficie                                   |       Líneas ejecutables cubiertas |
| -------------------------------------------- | ---------------------------------: |
| API `expediente.service.ts`                  |                              45/45 |
| API `expediente-detail-bootstrap.service.ts` |                                4/4 |
| API `dto/expediente-detail-bootstrap.dto.ts` |                                6/6 |
| API controller                               | 0 añadidas; decoradores únicamente |
| **API**                                      |                          **55/55** |
| Portal `page.tsx`                            |                              38/38 |
| Portal `ExpedienteConversionBanner.tsx`      |                              12/12 |
| Portal `api-client.ts`                       |                                1/1 |
| **Portal**                                   |                          **51/51** |
| **Total API + Portal**                       |                        **106/106** |

## Matriz del delta H6

| Gate                                                 | Estado     | Evidencia                                                                              |
| ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| API Turbo sin caché                                  | **Cumple** | Exit 0; 376/380 suites, 5.002/5.017 tests; `Cached: 0 cached`.                         |
| D1: líneas API cambiadas al 100 %                    | **Cumple** | 55/55, con tres hits frescos H5 sobre 1328, 1329 y 1338 sumados al mapa de GATES v1.3. |
| D1: líneas Portal cambiadas al 100 %                 | **Cumple** | 51/51; sin cambios de Portal después de H4.                                            |
| D1: agregado comparable de `crm/expedientes` no baja | **Cumple** | Statements, branches, functions y lines superan baseline; tabla anterior.              |
| **Delta D1 / G6 E-3**                                | **GO**     | Se cerró el único fallo de cobertura identificado en GATES v1.3.                       |

Este informe verifica el delta H6 descrito; no vuelve a ejecutar los quince gates por paquete ni la integración PostgreSQL de GATES v1.3.

## Cierre

- La ruta `docs/informes/INFORME-MOD05-E3-E4-GATES-v1.4.md` estaba libre antes de crear este informe.
- `pnpm exec prettier --check docs/informes/INFORME-MOD05-E3-E4-GATES-v1.4.md`: exit 0.
- `git diff --no-index --check` comparando el informe no rastreado con un archivo vacío temporal: sin errores de whitespace; Git devuelve exit 1 por la diferencia esperada de contenido, normalizada a exit 0 por el wrapper de verificación.
- Solo se creó este informe; no se modificaron código, tests ni configuración y no se hizo commit.
