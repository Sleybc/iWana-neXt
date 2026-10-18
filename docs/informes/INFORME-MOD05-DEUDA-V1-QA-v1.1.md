# INFORME-MOD05-DEUDA-V1-QA-v1.1

**Fecha:** 2026-10-17  
**Re-verificación:** V1′ · suite viva MOD05 + regresión privacidad  
**Base de código:** main en e2348a42 + correcciones A/B presentes en el workspace  
**Referencias:** [PRD MOD05 Fase 04](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md), contratos [v1.0](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md), [v1.1](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.1.md) y [delta v1.2 §5](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.2.md), e [informe V1 v1.0](INFORME-MOD05-DEUDA-V1-QA-v1.0.md).  
**Skills leídas:** testing-patterns, e2e-testing-patterns, playwright-skill, iwana-test-evidence, verification-before-completion.  
**Resultado:** **GO para V1′: 12/12 pasaron**, con retries=0. R7 conserva la limitación indicada en la matriz: el E2E verifica lectura cifrada y 360°, pero no crea una fila heredada con texto plano.

## Precondiciones y entorno

- Suite dirigida al tenant sintético e2e-privacy-1b-a114bf06.
- PostgreSQL: 127.0.0.1:5433, base dbiw. Preflight de solo lectura ejecutado con BEGIN READ ONLY / SELECT count(*) / ROLLBACK:
  
      $env:DB_HOST='127.0.0.1'
      node --env-file=.env .cache/e2e-prefight-db-deletion-check.mjs
  
  Resultado antes de arrancar el worker: **MARKED_FOR_DELETION count=0**. Se volvió a comprobar después de la suite: 0.
- Redis: 127.0.0.1:6380; PING autenticado → PONG.
- API: /api/v1/health → HTTP 200.
- Worker: compiló sin errores e inició.
- Portal: webpack dev listo en 127.0.0.1:3002.
- dbiw no se migró. No se ejecutó el seed ni ningún comando de migración.
- La suite escribe datos sintéticos mediante la API; sus registros de prueba permanecen en el tenant. No se borraron filas de dbiw.
- Al terminar se detuvieron API, worker y portal; los puertos 3000, 3001 y 3002 quedaron cerrados. Redis quedó activo tras iniciarlo para esta corrida; PostgreSQL no se modificó.

La ruta de este informe ya existía con el bloqueo de la primera verificación; se actualiza en el mismo archivo y se conserva abajo el historial de errores de acceso resueltos.

## Corrida y conteo real

La suite MOD05 contiene 8 casos y la suite de privacidad aporta otros 4; ambos archivos forman los 12 tests pedidos.

    $env:DB_HOST='127.0.0.1'
    $env:DB_PORT='5433'
    $env:DB_NAME='dbiw'
    $env:REDIS_HOST='127.0.0.1'
    $env:REDIS_PORT='6380'
    $env:E2E_PRIVACY_1B_TENANT_SLUG='e2e-privacy-1b-a114bf06'
    pnpm --config.use-node-version=24.18.0 exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-mod05-deuda-fiscal-live.spec.ts e2e/tests/portal-privacy-fase-1b-live.spec.ts --retries=0 --reporter=list --output=.cache/e2e-v1qa-artifacts

**Salida final de Playwright:** Running 12 tests using 1 worker; **12 passed (1.0m)**. Fallidos: 0 · omitidos: 0 · flaky: 0 · reintentos: 0.

| # | Caso | Resultado |
| --- | --- | --- |
| T0 | Precondición de migraciones 153–157 y rol LEGAL_REPRESENTATIVE | Pasó |
| T1 | Alta jurídica rechaza DV, RUT, IVA o representante faltantes | Pasó |
| T2 | Alta jurídica válida, representante/deduplicación y DV incorrecto | Pasó |
| T3 | Conversión, completitud fiscal, edición de DV, activación y aviso | Pasó |
| T4 | Contrato: incompletitud → 422; lectura y documento enmascarado en storage / mostrado en pantalla | Pasó |
| T5 | Editar alias conserva el documento fiscal cifrado | Pasó |
| T6 | Supresión anonimiza y anula documento cifrado y HMAC | Pasó |
| T7 | Suscriptor heredado: mapeo de régimen y RUT pendiente | Pasó |
| T8 | Prospecto: supresión y anonimización del expediente, visita y órdenes | Pasó |
| T9 | Ex suscriptor en retención: rechazo, redacción, búsqueda y subrecursos | Pasó |
| T10 | Contrato vigente: rechazo por deber contractual | Pasó |
| T11 | Traslado fuera de plazo: insignia visible | Pasó |

## Matriz R1–R15

La columna de resultado refleja esta corrida. R12 no existe en la numeración congelada por v1.1/v1.2.

| R | Criterio resumido | Evidencia en esta corrida | Estado |
| --- | --- | --- | --- |
| R1 / R1′ | Alta fiscal manual explícita; la conversión no infiere régimen | T1 y T2 prueban rechazos/alta positiva; T3 deja IVA/RUT/representante vacíos y taxRegime nulo al convertir | Verde |
| R2 | Mapeo heredado y RUT pendiente | T7 encuentra filas heredadas, cero descuadres SIMPLIFIED/COMMON y comprueba etiquetas del detalle | Verde |
| R3 / R3′ | DV requerido, validado en alta y edición | T1–T3: alta válida, DV incorrecto rechazado y edición errónea sin completar el registro | Verde |
| R4 / R4′ | Party representante requerido y conversión sin representante | T1–T3: alta valida rol LEGAL_REPRESENTATIVE y deduplicación; conversión inicia sin representante y la edición lo crea | Verde |
| R5 | Documento fiscal cifrado, sin texto plano, con HMAC | T4 verifica storage cifrado y forma/redacción del HMAC en contrato y expediente; T5 verifica conservación al editar | Verde |
| R6 | CLI de backfill | No se ejecutó: fuera de esta suite y no se escribe mediante backfill en dbiw | Fuera del E2E |
| R7 | Lectura descifrada, incluido 360° y compatibilidad heredada | T4/T5 pasan en lectura cifrada, drawer y edición. Esta corrida no crea una fila heredada con fiscal_document en claro | Parcial en E2E |
| R8 | Supresión limpia documento, cifrado y HMAC | T6 comprueba columnas nulas y anonymized_at fijado tras resolver SUPRIMIR | Verde |
| R9 | FK subscribers.expediente_id | T3 verifica el vínculo con el expediente y la existencia de la FK en el schema tenant | Verde |
| R10 | Paridad enum de entidad y DDL | No se valida en Playwright; corresponde a prueba de paridad/integración | Fuera del E2E |
| R11 | subscribers.nit en claro (observación D-FIS) | Observación de diseño; esta suite no la trata como criterio E2E | Sin cambio |
| R12 | No definido en la numeración contractual | No existe | N/A |
| R13 | Activar/contratar incompleto da 422 sin PII ni escritura parcial | T3/T4 verifican código, missing, permanencia en PROSPECT y cero contratos tras 422 | Verde |
| R14 | fiscalCompleteness y aviso del portal | T3 verifica campos faltantes, aviso visible y desaparición al completar; T7 comprueba aviso de RUT heredado | Verde |
| R15 | No inferir taxRegime | T2/T3 verifican taxRegime nulo para alta/conversión | Verde |

## Incidencias de entorno resueltas

El informe previo v1.1 registraba que el comando node --env-file=.env .cache/e2e-prefight-db-deletion-check.mjs falló con DB check error: class=AggregateError sqlstate=none code=EACCES y dejó 0/12 ejecutados. En esta repetición, el mismo preflight, con DB_HOST fijado a 127.0.0.1 y acceso local, dio count=0; el E2E sí se ejecutó.

- El primer chequeo de Compose, docker compose -f docker-compose.yml -f docker-compose.dev.yml ps redis, devolvió exactamente: permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine. Con permisos de ejecución local, docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d redis devolvió Container iwana_redis_dev Running; el PING posterior fue PONG.
- El comando pnpm --config.use-node-version=24.18.0 --filter @iwana/api dev, ejecutado primero dentro del sandbox con DB_HOST=127.0.0.1, DB_PORT=5433, DB_NAME=dbiw, REDIS_HOST=127.0.0.1 y REDIS_PORT=6380, recibió Error: connect EACCES 127.0.0.1:5433 y Error: connect EACCES 127.0.0.1:6380. Se detuvo ese proceso y se repitió con acceso local; la API conectó y health devolvió 200.
- El comando inicial pnpm --filter @iwana/api dev intentó descargar Node 24.13.1 y reportó GET https://nodejs.org/download/release/v24.13.1/SHASUMS256.txt error (ENOTFOUND). Se usó el runtime local 24.18.0 con --config.use-node-version=24.18.0.

No queda bloqueo de entorno para V1′. El pase de R7 sobre compatibilidad heredada, así como R6/R10, queda para sus pruebas de otras capas y no se infiere a partir de estos 12 E2E.



