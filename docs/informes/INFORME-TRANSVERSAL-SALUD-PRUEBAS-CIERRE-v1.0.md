# INFORME — TRANSVERSAL · Salud de pruebas · Cierre

**Fecha:** 2026-10-20 · **Versión:** 1.0

**Plan:** [2026-10-20-transversal-salud-pruebas.md](../plans/2026-10-20-transversal-salud-pruebas.md)

**Spec:** [2026-10-20-transversal-salud-pruebas-spec.md](../specs/2026-10-20-transversal-salud-pruebas-spec.md) (Aprobado)

**CI de fase:** [run 39497924523](https://github.com/Sleybc/iWana-neXt/actions/runs/39497924523) · SHA `e42d78ea29ef57e6f39c6319d5af5fea9f115709`

## Resultado

La fase cerró con CA-SP-01 a CA-SP-07 satisfechos. `main` quedó con el job «E2E portal» bloqueante y sin retries; las dos corridas consecutivas de CI del commit de código `e42d78ea` terminaron verdes. La matriz de triage clasificó 125/125 fallos del run inicial, se corrigieron los fallos asignados, quedaron dos cuarentenas acotadas y se incorporaron B5 y su gate de omisiones a CI.

**Actualización de vigencia (2026-10-20):** La fase posterior de cuarentenas cerró las dos filas y bajó el tope a 0. La prueba de custodia pre-inicio se reclasificó como obsoleta porque el CA-3 del prompt MOD12-MOD11 de agosto quedó superado por la spec MOD11 v1.5 §6; el E2E ahora valida que no se consulta custodia antes de iniciar. Se aprobó D-CQ-4 para añadir los tres hints pre-inicio que exigía RQ-K-02. WFM corrigió la pérdida de fecha en `DatePicker`, conservó el borrado de fechas opcionales por defecto y habilitó prevención de deselección solo en la agenda manual; la prueba del flujo se rehabilitó. V1 ejecutó tres corridas completas de 305 casos: 287 pasaron, 18 se omitieron con guards live y motivo, 0 fallaron y 0 fueron flaky (local 1: 381542 ms; local 2: 375948 ms; contenedor oficial: 542846 ms). El commit `52551f02` pasó CI de `main` en el [run 39515823508](https://github.com/Sleybc/iWana-neXt/actions/runs/39515823508), incluidos los cinco jobs y el E2E Portal bloqueante. El [informe de cierre de cuarentenas](INFORME-TRANSVERSAL-CUARENTENAS-E2E-CIERRE-v1.0.md) contiene el detalle de cobertura y verificaciones.

## E2E Portal

V1 ejecutó el suite completo dos veces en local y una vez en el contenedor oficial, sobre el árbol corregido. Cada ejecución descubrió 305 pruebas en 51 archivos: **285 pasaron, 20 se omitieron, 0 fallaron**, con `retries=0`. Las 20 omisiones fueron 18 pruebas `-live` con motivo por guards vacíos y las 2 cuarentenas aprobadas. Los casos SCM #92 y #93 pasaron en las tres full runs.

| Ejecución                                                                   | Resultado                                            | Evidencia                                                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Local 1                                                                     | 305; 285 pasaron; 20 omitidas; 0 fallidas            | `%TEMP%\iwana-v1-local-run1.log`                                                                      |
| Local 2                                                                     | 305; 285 pasaron; 20 omitidas; 0 fallidas            | `%TEMP%\iwana-v1-local-run2.log`                                                                      |
| Contenedor `mcr.microsoft.com/playwright:v1.58.2-noble`, Chromium, 1 worker | 305; 285 pasaron; 20 omitidas; 0 fallidas; 483955 ms | `%TEMP%\iwana-v1-current-tree-container-run1\full-run.log`                                            |
| CI `39497924523`, intento 1, mismo SHA                                      | «E2E portal» y todos los jobs: success               | [GitHub Actions, intento 1](https://github.com/Sleybc/iWana-neXt/actions/runs/39497924523/attempts/1) |
| CI `39497924523`, intento 2, mismo SHA                                      | «E2E portal» y todos los jobs: success               | [GitHub Actions, intento 2](https://github.com/Sleybc/iWana-neXt/actions/runs/39497924523/attempts/2) |

El workflow independiente «E2E Web Admin Smoke» también pasó para el mismo SHA en el run [39497924417](https://github.com/Sleybc/iWana-neXt/actions/runs/39497924417).

## Triage, correcciones y cuarentena

- T0 clasificó los **125/125** fallos iniciales, comparó dos corridas y documentó la diferencia entre CI Linux y el entorno local en el [informe de triage](INFORME-TRANSVERSAL-SALUD-PRUEBAS-TRIAJE-v1.0.md).
- Se corrigieron los contratos de entorno, capturas Linux y regresiones priorizadas sin relajar aserciones. El contraste dark de Button tiene regresión Axe para tema oscuro y estados reposo, hover y activo.
- El intento 2 del run `39489106232` reveló que el autofocus diferido de Cantidad podía robar el foco de Título. El helper ahora cancela el autofocus si el usuario cambió el foco antes del frame y conserva el comportamiento cuando no lo cambió. La regresión pasó **2 suites/8 tests**; los dos E2E aislados pasaron **2/2**; los casos también pasaron en las tres corridas full.
- La cuarentena tiene **2 filas**, tope **2**, ambas con responsable y vencimiento `2026-11-19`. `node scripts/check-e2e-quarantine.mjs` pasó **2/2**. No se relajaron pruebas ni se añadieron cuarentenas para la carrera de foco.

## B5, cobertura y gates locales

- B5 armó el esquema efímero con migraciones tenant y pasó **17/17**. El gate de integración pasó los controles: rojo ante omisión no declarada, verde al declarar una omisión con motivo y rojo si B5 se omite incluso declarada.
- Cobertura de líneas de los cuatro componentes: `ContractCard` **100%** (37/37), `ContractDetailDrawer` **89,57%** (189/211), `ConvertExpedienteToContractDialog` **83,01%** (88/106) y `CreateContractDialog` **83,92%** (141/168); agregado **87,16%** (455/522).
- V3 confirmó lint/typecheck, suites sin caché, el script de cuarentena y B5. En CI, ambos intentos pasaron lint, typecheck, build, unit tests, migraciones tenant, integraciones API/worker contra PostgreSQL real, R4.1, build de imágenes y auditorías documentales.
- La corrida local amplia `@iwana/api test:integration` terminó exit 1 por el setup local de `dbiw`: faltaba el tenant `test` y `tenant_test.subscribers` estaba vacío en el test de paridad enum (12 suites/44 tests fallidos; B5 dirigida sí pasó). La integración equivalente de CI pasó en ambos intentos con PostgreSQL real; no hubo cambios en esos specs.
- Auditorías documentales: `audit-doc-locations.mjs` **0 bloqueantes, 3 avisos**; `audit-adr-citations.mjs` **0 bloqueantes, 144 avisos**. Los avisos son preexistentes y no bloquean según V2.

## Criterios de aceptación

| Criterio                                                                               | Resultado                                                                                     |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| CA-SP-01 · 125/125 clasificados en dos corridas                                        | Cumplido                                                                                      |
| CA-SP-02 · Dos corridas CI consecutivas, mismo commit, cero fallos fuera de cuarentena | Cumplido: run `39497924523`, intentos 1 y 2, SHA `e42d78ea`                                   |
| CA-SP-03 · Cuarentena completa, ≤ tope, no vencida                                     | Cumplido: 2/2, tope 2, vencimiento `2026-11-19`                                               |
| CA-SP-04 · Job bloqueante probado con fallo deliberado                                 | Cumplido por J0; evidencia roja anexada en la documentación de la fase                        |
| CA-SP-05 · B5 17/17 en CI y gate de omisiones                                          | Cumplido; integración API verde en ambos intentos                                             |
| CA-SP-06 · Cuatro componentes ≥80% de líneas                                           | Cumplido; mínimo 83,01%                                                                       |
| CA-SP-07 · CI de `main` verde con job E2E bloqueante                                   | Cumplido en los dos intentos del commit de fase; workflow «E2E Web Admin Smoke» también verde |

## Cambios de la fase

La fase añadió la matriz de triage, baselines Linux revisados, guards con motivo para pruebas live, dos cuarentenas declaradas y acotadas, el script y tope de cuarentena, migración/fixture de B5, gate de omisiones de integración, regresiones de los cuatro componentes de contratos, el job E2E Portal bloqueante y la corrección del foco en solicitudes de compra. Los commits de la fase en `main` fueron `7cee1aba` y `e42d78ea`; ambos fueron creados por AI-EM-ARCH.
