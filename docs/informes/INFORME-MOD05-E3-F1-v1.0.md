# Informe de ejecución — MOD05 E-3 · F1

| Campo       | Valor                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Versión     | 1.0                                                                                                  |
| Fecha       | 2026-10-15                                                                                           |
| Responsable | AI-SR-FULL                                                                                           |
| Estado      | Implementación e integración B5 terminadas; NO-GO §6.2 por cobertura agregada de branches            |
| Alcance     | Corrección de propagación y reintento de eventos de conversión, y aislamiento de `search_path` en B5 |

## Trazabilidad

- [Plan de orquestación MOD05 E-3](../plans/2026-10-15-mod05-e3-contacto-pendiente.md), bloque F1.
- [Prompt de ejecución MOD05 E-3](../prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md), §§6.1, 6.2 y 6.4.
- Hallazgos E4-A y E4-C: [informe QA](INFORME-MOD05-E3-E4-QA-v1.0.md) y [informe de gates](INFORME-MOD05-E3-E4-GATES-v1.0.md).

## Cambios

- Los listeners de creación, activación y cancelación declaran `suppressErrors: false` y no usan `async: true`; `emitAsync` puede esperar el listener y propagar su rechazo.
- `emitPipelineEventSafely` persiste el `response.code` de una `HttpException` o `CONVERSION_FAILED`. Conserva la transición ya guardada, deja pendiente el fallo y también registra el caso en que la emisión termina sin producir el efecto esperado.
- El efecto de `ready-for-installation` requiere un suscriptor vinculado. El efecto de `activated` requiere que el suscriptor vinculado esté `ACTIVE`. El fallo solo se resuelve después de comprobar el efecto.
- La prueba B5 cubre conversión sin autorización, error `SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED`, reintento aún pendiente, captura posterior del consentimiento y reintento con suscriptor creado. Las migraciones 146 y 148 del fixture usan `runInTenantSchema`, que establece `SET LOCAL search_path` dentro de una transacción.
- No se modificaron contratos públicos, rutas HTTP, OpenAPI ni migraciones.

## Evidencia disponible

| Verificación                                                                       | Resultado                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jest focal: `subscriber-pipeline-listeners.spec.ts` y `expediente.service.spec.ts` | **PASS** — 2 suites, 89 tests. Las pruebas nuevas fallaron inicialmente por los defectos F1 descritos en E4-A/C y pasaron después del cambio.                                                                                                                                      |
| `pnpm --filter @iwana/api typecheck`                                               | **PASS**                                                                                                                                                                                                                                                                           |
| `pnpm exec prettier --check` sobre archivos F1                                     | **PASS**                                                                                                                                                                                                                                                                           |
| `git diff --check` sobre archivos F1                                               | **PASS**                                                                                                                                                                                                                                                                           |
| Integración B5 PostgreSQL real                                                     | **PASS** — 1 suite, 16 tests; PostgreSQL alcanzable en `127.0.0.1:5433/dbiw`; el fixture aplicó las migraciones 146 y 148 al schema sintético.                                                                                                                                     |
| Cobertura focal de `expediente.service.ts`                                         | **PASS** — 84 tests; líneas F1 ejecutables de `emitPipelineEventSafely`, `pipelineEventHasEffect` y `pipelineErrorCode`: 100%. El archivo queda en 78,92% lines / 76,56% statements / 58,25% branches / 82,14% functions; supera la línea base E4 (76,61 / 74,35 / 56,80 / 79,71). |
| `pnpm exec turbo run test --filter=@iwana/api --force`                             | **PASS** — 4 tasks; 0 cached. Jest: 376 suites passed, 4 skipped; 4.993 tests passed, 15 skipped; 0 snapshots.                                                                                                                                                                     |
| Cobertura completa API: Jest con `text-summary`, `json-summary` y `json`           | **PASS de ejecución** — 376 suites / 4.993 tests; 4 suites / 15 tests skipped. `crm/expedientes`: 82,13% statements (1.829/2.227), 58,69% branches (520/886). `expediente.service.ts`: 78,92% lines / 76,56% statements / 58,25% branches / 82,14% functions.                      |
| Líneas ejecutables agregadas por F1 en `expediente.service.ts`                     | **PASS** — inspección de `coverage-final.json`: todas las líneas ejecutables añadidas en `emitPipelineEventSafely`, `pipelineEventHasEffect` y `pipelineErrorCode` registran hits (>0). La línea 3037 sin hits pertenece al manejo preexistente de resolución y no a un hunk F1.   |

## Gate de branches §6.2

El agregado de `crm/expedientes` registra 520/886 branches cubiertos. Para alcanzar 80% necesita al menos 709, es decir, 189 ramas adicionales. `expediente.service.ts` concentra 307/527 ramas cubiertas y solo 220 ramas pendientes; cubrir 189 desde el spec asignado exigiría elevar ese archivo a 496/527 (94,1%) y añadir casos sobre ramas preexistentes no relacionadas con F1. No es viable dentro del alcance acotado de conversión sin ampliar ownership, por lo que se conserva el resultado **NO-GO** para el gate agregado.

La inspección de `coverage-final.json` confirma hits en todas las líneas ejecutables añadidas por F1 en los tres hunks. La rama de persistencia del fallo cubre códigos de dominio, `CONVERSION_FAILED` y error de persistencia; los reintentos unitarios verifican ausencia de efecto para ready/activation y resolución al observar `ACTIVE`. B5 verifica el caso positivo de creación ligada tras capturar consentimiento.

## Pendientes para el gate serial

La corrida de Turbo se ejecutó después de terminar los cambios F1/F3: `pnpm exec turbo run test --filter=@iwana/api --force` dio 4 tareas sin cache, 376 suites y 4.993 tests pasados (4 suites y 15 tests omitidos). La integración B5 se ejecutó contra un schema sintético creado desde el tenant indicado por `E2E_TENANT_SLUG`; el `afterAll` eliminó ese schema.

Después de esa coordinación, ejecutar:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE='true'; $env:DB_HOST='127.0.0.1'; $env:DB_PORT='5433'; $env:DB_NAME='dbiw'; $env:E2E_TENANT_SLUG='<tenant de prueba confirmado por el orquestador>'
pnpm --filter @iwana/api exec jest --config jest.integration.config.js --passWithNoTests --runInBand --runTestsByPath src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts
pnpm exec turbo run test --filter=@iwana/api --force
pnpm --filter @iwana/api exec jest --coverage --coverageReporters=text-summary --coverageReporters=json-summary
```

El §6.2 exige agregado de `crm/expedientes` ≥80% en statements y branches, 100% de líneas cambiadas en `expediente.service.ts`, y que la cobertura del archivo no baje. Statements y líneas ejecutables cambiadas pasan; branches queda NO-GO por la magnitud descrita. La ruta del informe se verificó libre antes de crearlo; no se hizo commit.
