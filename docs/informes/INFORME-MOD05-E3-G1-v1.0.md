# INFORME-MOD05-E3-G1-v1.0

**Fecha:** 2026-10-15  
**Bloque:** G1 — guardado de fallos de conversión, autorización R8 y proyección de detalle  
**Estado:** cerrado

## Resultado

Se implementó el contrato G1 en CRM Expedientes. `pipelineErrorCode` acepta únicamente códigos que cumplen `^[A-Z][A-Z0-9_]{2,63}$`; cualquier valor inválido, ausente o de otro tipo se guarda como `CONVERSION_FAILED`.

La transición a `LISTO_PARA_INSTALACION` exige una autorización vigente de `TRATAMIENTO_CONTRACTUAL`. La verificación ocurre antes de escribir cambios y responde 422 con un mensaje fijo que no incluye datos personales. La evaluación considera las autorizaciones locales `TRATAMIENTO_DATOS` y `CONTACTO_OPERATIVO`, y respeta aceptación y revocación con el mismo orden temporal del servicio de suscriptores. No se añadió una comprobación duplicada a completitud.

El bootstrap devuelve `conversionFailure` con solo `eventName`, `errorCode`, `attempts` y `lastFailedAt` para el fallo pendiente más reciente; devuelve `null` cuando no hay fallo pendiente. No proyecta payloads ni datos personales.

El endpoint `retry-conversion` requiere `CRM_EXPEDIENTES_MANAGE` y permite los roles ADMIN, SALES, SUPPORT y SYSTEM_ADMIN. La prueba HTTP confirma que SALES y SUPPORT con ese permiso pueden reintentar, mientras que tener únicamente `CRM_SUBSCRIBERS_MANAGE` no autoriza la operación.

## Archivos del bloque

- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- `apps/api/src/modules/crm/expedientes/expediente-detail-bootstrap.service.ts`
- `apps/api/src/modules/crm/expedientes/dto/expediente-detail-bootstrap.dto.ts`
- `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- Specs unitarios y HTTP de esos servicios y del controlador.
- `apps/api/src/modules/crm/expedientes/tests/g1-conversion-failure.postgres.integration.spec.ts`

No se editaron los tres logs UUID D2. No se modificó `@iwana/shared` ni otro contrato fuera de §7.2.

## Evidencia de pruebas

La integración usa un schema tenant sintético independiente del tenant de origen. Crea un tenant temporal en la base local de integración, aplica el runner de migraciones tenant desde cero (incluida la migración 148), y elimina los datos/schema sintéticos en limpieza. No requiere `E2E_TENANT_SLUG`.

Comando de integración ejecutado:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE='true'; $env:DB_HOST='127.0.0.1'; $env:DB_PORT='5433'; $env:DB_NAME='dbiw'; pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --runTestsByPath src/modules/crm/expedientes/tests/g1-conversion-failure.postgres.integration.spec.ts
```

Resultado: **1 suite aprobada, 2 pruebas aprobadas**. Cubre rechazo R8 sin escritura, transición con consentimiento válido, persistencia del fallback `CONVERSION_FAILED`, aparición del fallo pendiente en bootstrap y su desaparición al resolverlo.

Comando final del paquete API, sin caché:

```powershell
pnpm exec turbo run test --filter=@iwana/api --force
```

Resultado: **4 tareas exitosas, 4 totales; 0 cache hit; 376 suites aprobadas y 4 omitidas; 5000 pruebas aprobadas y 15 omitidas**. Exit code 0.

También se ejecutaron:

```powershell
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/api lint
```

Typecheck: exit code 0. Lint: exit code 0, 7 advertencias preexistentes en archivos ajenos a G1 y 0 errores.

## Cobertura de líneas cambiadas

Se generó cobertura aislada para las pruebas unitarias del servicio, bootstrap y controlador, escribiendo `apps/api/coverage-g1/coverage-final.json`. La corrida incluyó 3 suites y 99 pruebas; usó `--coverageThreshold="{}"` para que el threshold global preexistente no exigiera archivos no recogidos por este conjunto dirigido. Se cruzaron los rangos de líneas ejecutables del `git diff -U0` con el mapa de statements de Jest:

```powershell
pnpm --filter @iwana/api exec jest --runInBand --runTestsByPath src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/expediente-detail-bootstrap.service.spec.ts src/modules/crm/expedientes/expedientes.controller.fase2.http.spec.ts --coverage --coverageDirectory=../coverage-g1 --collectCoverageFrom=modules/crm/expedientes/expediente.service.ts --collectCoverageFrom=modules/crm/expedientes/expediente-detail-bootstrap.service.ts --collectCoverageFrom=modules/crm/expedientes/expedientes.controller.ts --collectCoverageFrom=modules/crm/expedientes/dto/expediente-detail-bootstrap.dto.ts --coverageThreshold="{}" --coverageReporters=json --coverageReporters=text
```

| Archivo | Líneas ejecutables cambiadas cubiertas |
| --- | ---: |
| `expediente.service.ts` | 38/38 |
| `expediente-detail-bootstrap.service.ts` | 4/4 |
| `expediente-detail-bootstrap.dto.ts` | 6/6 |
| `expedientes.controller.ts` | 0 statements ejecutables en 2 líneas de decoradores; conducta cubierta por la prueba HTTP |

No hay líneas ejecutables cambiadas descubiertas. La cobertura por archivo completo es menor en algunos archivos porque incluye código preexistente ajeno a este diff; la métrica reportada arriba es la cobertura de las líneas ejecutables cambiadas.

Una corrida aislada inicial de cobertura terminó roja porque Jest buscó `serialized-asset-useful-life.util.ts`, requerido por un threshold por ruta del config, y ese archivo no estaba en el conjunto recogido. La corrida posterior con threshold vacío produjo el artefacto citado y terminó correctamente; el gate completo de API también pasó.

## Cierre

Antes de crear este informe se verificó que la ruta no existía (`Test-Path ...` devolvió `False`). `git diff --check` terminó sin errores. El trabajo queda sin commit.
