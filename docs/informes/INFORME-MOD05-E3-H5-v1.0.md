# INFORME MOD05 E-3 · H5

| Campo       | Valor                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                                           |
| Responsable | AI-SR-BACKEND                                                                                                        |
| Resultado   | **GO**                                                                                                               |
| Alcance     | Dos tests unitarios nuevos para los retornos tempranos de `retryConversionEvent`; sin cambios productivos ni commit. |

## Casos cubiertos

Se añadieron dos casos a `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`:

1. Para un expediente sintético en `PRECALIFICADO`, el servicio devuelve `{ retried: false, resolved: false, eventName: null }`, no consulta fallos pendientes ni emite eventos, y registra `CONVERSION_RETRY` con `eventName: null`, `resolved: false` y `errorCode: null`.
2. Para un expediente sintético en `LISTO_PARA_INSTALACION` sin fallo pendiente, devuelve `{ retried: false, resolved: false, eventName: 'crm.expediente.ready-for-installation' }`, no emite el evento y registra la auditoría con ese `eventName`, `resolved: false` y `errorCode: null`.

Las dos aserciones verifican el objeto completo de auditoría: solo contiene los identificadores sintéticos del expediente y actor, y los tres valores permitidos. No usa nombres, documentos, correos, teléfonos ni otros datos personales. El comportamiento ya estaba implementado en producción, así que este cambio añade cobertura sin tocar código productivo.

## Evidencia

Prueba dirigida, sin caché:

```powershell
pnpm --filter @iwana/api exec jest --runInBand --no-cache --runTestsByPath src/modules/crm/expedientes/tests/expediente.service.spec.ts --testNamePattern='audita sin evento ni reintento|audita el evento sin reintento'
```

Resultado: exit 0; **1 suite aprobada, 2 tests aprobados y 87 omitidos** por el filtro de nombre.

Medición enfocada de cobertura, con thresholds globales en cero para evitar que el test aislado aplique umbrales ajenos a este cambio:

```powershell
$coverageDirectory = '<directorio temporal nuevo>'
pnpm --filter @iwana/api exec jest --runInBand --no-cache --coverage --runTestsByPath src/modules/crm/expedientes/tests/expediente.service.spec.ts --testNamePattern='audita sin evento ni reintento|audita el evento sin reintento' --coverageDirectory="$coverageDirectory" --coverageReporters=json --collectCoverageFrom='modules/crm/expedientes/expediente.service.ts' --coverageThreshold='{"global":{"statements":0,"branches":0,"functions":0,"lines":0}}'
```

Resultado: exit 0; **1 suite y 2 tests aprobados**. `coverage-final.json` confirmó un hit por línea:

| Línea ejecutable             | Hits |
| ---------------------------- | ---: |
| `expediente.service.ts:1328` |    1 |
| `expediente.service.ts:1329` |    1 |
| `expediente.service.ts:1338` |    1 |

Suite API completa sin caché:

```powershell
pnpm exec turbo run test --filter=@iwana/api --force
```

Resultado: exit 0; **376 suites aprobadas, 4 omitidas de 380; 5.002 tests aprobados, 15 omitidos de 5.017; 4 tareas Turbo exitosas; `Cached: 0 cached`**.

## Cierre

- La ruta `docs/informes/INFORME-MOD05-E3-H5-v1.0.md` estaba libre antes de crear este informe.
- `pnpm exec prettier --check apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`: exit 0.
- `git diff --check -- apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`: exit 0.
- Solo se añadieron tests y este informe. No se modificó producción ni se hizo commit.
