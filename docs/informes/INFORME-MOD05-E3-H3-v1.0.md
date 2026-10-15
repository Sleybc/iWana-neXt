# INFORME MOD05 E-3 · H3 QA

| Campo       | Valor                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                                           |
| Responsable | AI-SR-QA                                                                                                             |
| Resultado   | **GO para los E2E y para D1 en cobertura comparable de producción**                                                  |
| Alcance     | Pruebas de CRM/expedientes y E2E contra Portal, API y PostgreSQL reales; sin cambios de producción ni configuración. |

## E2E contra servicios reales

Se corrieron los dos E2E de G3 sin interceptores, contra la API, Portal y PostgreSQL de desarrollo:

```powershell
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-conversion-failure-live.spec.ts e2e/tests/portal-crm-contact-pending-live.spec.ts --retries=0
```

Resultado: **2 pruebas aprobadas, 0 fallidas, 0 omitidas; 35,5 s**.

El E2E de retry creó un expediente con fallo sintético pendiente. ADMIN vio «Reintentar conversión», aceptó el consentimiento y completó el retry. El usuario SALES se creó por API real en el mismo tenant y recibió un perfil sintético compatible con su rol, con `crm.subscribers.manage` y lectura/gestión de expedientes. El test consultó `/access-control/me/effective-permissions` y afirmó que el permiso efectivo `crm.subscribers.manage` estaba presente; SALES vio el motivo del fallo y «Pide a un administrador que reintente la conversión.», y no vio el botón de retry.

El segundo E2E volvió a verificar CA-E3-01 a CA-E3-04 del flujo de contacto pendiente. Ambos `afterAll` cambiaron el tenant a `INACTIVE` y confirmaron el estado por GET:

| Tenant sintético             | Flujo                                               | Estado final confirmado |
| ---------------------------- | --------------------------------------------------- | ----------------------- |
| `srqa-mod05-g3-003c634db380` | R8, fallo de conversión, límite SALES/ADMIN y retry | `INACTIVE`              |
| `srqa-mod05-e3-e65bc9f233e7` | CA-E3-01..04, contacto pendiente                    | `INACTIVE`              |

La salida visible no expuso códigos internos ni placeholders en ninguno de los flujos.

## API: suites y cobertura fresca sin caché

Comando ejecutado con Jest sin caché y reportes de texto y JSON en un directorio temporal nuevo:

```powershell
$covDir = Join-Path ([IO.Path]::GetTempPath()) ('iwana-h3-coverage-' + [guid]::NewGuid().ToString('N'))
pnpm --filter @iwana/api exec jest --coverage --runInBand --no-cache --coverageDirectory="$covDir" --coverageReporters=text-summary --coverageReporters=json-summary
```

Resultado: exit 0 en **312,048 s**; **376 suites aprobadas, 4 omitidas**; **5.000 tests aprobados, 15 omitidos**. No hubo caché de Turbo ni caché de Jest (`--no-cache`).

El agregado bruto se calculó con los objetos `s`, `b`, `f` y `l` del `coverage-summary.json` fresco: se sumaron `covered` y `total` de todas las claves cuyo path corresponde a `apps/api/src/modules/crm/expedientes/**`. Jest recoge todos los `.ts` del módulo por la configuración `collectCoverageFrom`; por eso este agregado incluye la spec de integración sin ejecutar. El resumen bruto fue:

| Métrica    |   Baseline `fb3d41ee` |    Working tree bruto | Resultado bruto |
| ---------- | --------------------: | --------------------: | --------------- |
| Statements | 1.782/2.204 = 80,85 % | 1.858/2.365 = 78,56 % | Debajo          |
| Branches   |     501/869 = 57,65 % |     536/919 = 58,32 % | Sobre           |
| Functions  |     236/311 = 75,88 % |     246/341 = 72,14 % | Debajo          |
| Lines      | 1.708/2.061 = 82,87 % | 1.783/2.219 = 80,35 % | Debajo          |

La diferencia se debe a que el collector incluye como código la nueva spec `tests/g1-conversion-failure.postgres.integration.spec.ts`, aunque el Jest unitario la excluye mediante `testPathIgnorePatterns`. La cobertura JSON fresca la cuenta con **0/109 statements, 0/14 branches, 0/25 functions y 0/106 lines**. El baseline no contenía esta spec. La comparación se basa en D1 de G4, calculado en `fb3d41ee2f99e8d5c53b725149b8e021230e2af2` con el comando `pnpm --filter @iwana/api exec jest --coverage --coverageReporters=text-summary --coverageReporters=json-summary --coverageReporters=json --coverageDirectory=<directorio temporal>`; allí se documentan la extracción limpia del commit, la misma configuración Jest y el scope `apps/api/src/modules/crm/expedientes/**`. Para normalizar el working tree actual se repitió la misma suma de `covered`/`total` por métrica sobre `coverage-summary.json`, excluyendo únicamente la clave exacta `apps/api/src/modules/crm/expedientes/tests/g1-conversion-failure.postgres.integration.spec.ts`; no se excluyó ningún archivo productivo del módulo:

| Métrica    | Working tree de producción sin la spec de integración |   Baseline `fb3d41ee` | Diferencia |
| ---------- | ----------------------------------------------------: | --------------------: | ---------: |
| Statements |                                 1.858/2.256 = 82,36 % | 1.782/2.204 = 80,85 % |   +1,51 pp |
| Branches   |                                     536/905 = 59,23 % |     501/869 = 57,65 % |   +1,58 pp |
| Functions  |                                     246/316 = 77,85 % |     236/311 = 75,88 % |   +1,97 pp |
| Lines      |                                 1.783/2.113 = 84,38 % | 1.708/2.061 = 82,87 % |   +1,51 pp |

Por tanto, las cuatro métricas de **código productivo** del agregado `crm/expedientes` superan la baseline. La tabla conserva también el resultado bruto para que el efecto de la spec de integración no quede oculto. El gate debe aplicar la misma exclusión de archivos de test al baseline y al working tree.

## Archivos y validaciones

- Cambios de prueba: `e2e/tests/portal-crm-conversion-failure-live.spec.ts`; no fue necesario modificar specs de API para cubrir código productivo adicional en este pase.
- `pnpm exec prettier --check e2e/tests/portal-crm-conversion-failure-live.spec.ts`: exit 0.
- `git diff --check -- e2e/tests/portal-crm-conversion-failure-live.spec.ts`: exit 0.
- La ruta `docs/informes/INFORME-MOD05-E3-H3-v1.0.md` estaba libre antes de crear el informe.
- No se modificó código productivo ni configuración. No se hizo commit. La salida del informe no incluye credenciales, contraseñas ni datos personales reales.
