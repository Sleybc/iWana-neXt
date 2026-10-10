# Informe V4-R — verificación integrada del reverso MOD11 ↔ MOD12

- **Fecha:** 2026-10-10
- **Rol:** sr-qa
- **Dictamen:** **NO GO**
- **HEAD base:** `7552c505fc5bd0bbdcbe2c5fe9313b80a7421c7c`; árbol local de V1–V3 y R-V5 sobre `main`, sin commit.
- **Entrega:** `e2e/tests/api/mod11-mod12-reverso.spec.ts`. No se modificó código productivo.

## 1. Resultado y rectificación del v1.0

La corrida final fresca de la spec ejecuta **17 tests: 15 PASS, 2 FAIL, 0 omitidos**, sin retries (3,5 minutos; exit 1 esperado por esos dos fallos). Los fallos son RA-05 (supervisor de otra sede: 404 frente al 403 exigido) y RA-06 (motivo vacío y patrón PII conocido: 400 frente al 422 exigido). Las expectativas normativas se conservaron; no se adaptaron al resultado observado.

**Ampliación posterior de RA-03:** se añadió la comparación de la fila original completa mediante `to_jsonb(m)` excluyendo únicamente `reversed_by_movement_id`. La corrida focal fresca adicional ejecutó **1 test, 1 FAIL, 0 omitidos**: cambia `updated_at` al guardar el enlace; todos los otros campos, líneas, recibo y consumo permanecen iguales. El enlace se comprueba aparte y pasa. No se excluyó `updated_at` para ocultar ese cambio. El resultado focal supera el PASS previo de RA-03; el conteo 17/15/2 corresponde a la corrida completa anterior a esa aserción ampliada. La spec sigue teniendo 17 tests.

**Se retira el bloqueo Redis del v1.0.** `redis-cli` dentro del contenedor heredaba `REDISCLI_AUTH`; su PONG no demostraba acceso anónimo. El probe de infraestructura con `env -u REDISCLI_AUTH redis-cli PING` devolvió NOAUTH; con el secreto vigente devolvió PONG. La credencial expuesta fue rotada, el contenedor recreado y el ACL de lectura regenerado antes de esta corrida. No se guarda ninguna credencial en este informe ni en la spec.

Se recorrió el stack real: API local :3000, worker y portal :3002, PostgreSQL :5433 y Redis autenticado :6380. Se usó exclusivamente la base sintética `i4_qa_20261006_a1` y el tenant `i4-qa-a-20261006-9d3098f4`. Los usuarios, sedes, perfiles y fixtures adicionales son sintéticos de ese tenant. Cada solicitud entra por HTTP; ninguna solicitud se firma en el test.

Se leyeron AGENTS/bootstrap, la spec v1.1, D4/D5/D8/D10/D11 de la spec hermana, la adenda V4-R y las cinco skills indicadas. R-V5 estaba en GO antes de RA-11/RA-13 (informe R-V5).

## 2. Matriz RA

| Criterio | Resultado      | Evidencia real                                                                                                                                                                                                                                                         |
| -------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RA-01    | PASS           | HTTP 202; recibo y API CONFIRMED; serial vuelve a custodia móvil/ASSIGNED_TO_TECHNICIAN, comodato ligado cerrado y movimiento contrario enlazado.                                                                                                                      |
| RA-02    | PASS           | Ambas ubicaciones comparadas: origen 0→1, destino 1→0; proyección CONFIRMED.                                                                                                                                                                                           |
| RA-03    | **FAIL focal** | Fila original completa salvo reversed_by_movement_id: updated_at cambia. Consumo, recibo y líneas intactos; enlace correcto afirmado aparte. Consulta de metadata pendiente.                                                                                           |
| RA-04    | PASS           | OT terminal: resultado, cierre, notas, snapshot y fila PHOTO de evidencia intactos. Portal real muestra «Corrección posterior al cierre.». El camino abierto se cubre también en RA-01/RA-09.                                                                          |
| RA-05    | **FAIL**       | Técnico recibe 403 y no obtiene REVERSE_ITEM_USAGE. Supervisor asignado a otra sede activa recibe **404**, no 403. Ambas comprobaciones se ejecutan.                                                                                                                   |
| RA-06    | **FAIL**       | Motivo vacío y patrón de teléfono sintético conocido reciben **400**, no 422; ambas negaciones ejecutadas con asserts independientes.                                                                                                                                  |
| RA-07    | PASS           | Carrera HTTP: 202/409; replay obligatorio de la key ganadora 202; nueva key 409; un recibo y movimiento contrario.                                                                                                                                                     |
| RA-08    | PASS           | Cuatro motivos, cuatro recorridos completos, recibos REJECTED y proyección API con código; intento de solicitud 1. Copy LOAN_MISMATCH visible en portal con datos reales.                                                                                              |
| RA-09    | PASS           | MATERIAL satisfecho→pendiente en progreso; cierre con DTO válido y versión actual falla por CLOSURE_GATE_INCOMPLETE y ese requisito. OT terminal conserva resultado.                                                                                                   |
| RA-10    | PASS           | Consumos PENDING/REJECTED sin acción de reverso; comandos 409.                                                                                                                                                                                                         |
| RA-11    | PASS           | Solicitud HTTP real firmada por worker; fallo técnico en MOD12 tras validación de firma, DLQ API real tras 8 intentos. Origen configurado `age:86400`; diagnóstico `age:2592000`, `removeOnComplete:true`. Véase alcance de retención abajo.                           |
| RA-12    | PASS           | CUSTODY_INACTIVE→REJECTED; reactivación del fixture; nueva solicitud HTTP→CONFIRMED; historial de dos solicitudes.                                                                                                                                                     |
| RA-13    | PASS           | Motivo sintético único ausente de outbox, job firmado, DLQ real y segmentos de logs API+worker de esa corrida. DLQ contiene reversalRequestId permitido; no contiene reason ni envelope. Proyección Redis dentro de EVAL_RO; nunca se materializó job.data en cliente. |
| RA-14    | PASS           | Respuesta única retirada con autorización expresa del usuario; D7 natural reemite: intentos 2, outbox 2, un recibo, un movimiento y enlace original correcto; SQL y API CONFIRMED.                                                                                     |

### Matriz de motivos (cuatro tramos)

| Motivo                      | Registro MOD11 por HTTP | Relay / cola                      | Recibo MOD12            | Proyección MOD11                            |
| --------------------------- | ----------------------- | --------------------------------- | ----------------------- | ------------------------------------------- |
| REVERSAL_ORIGINAL_NOT_FOUND | 202 / PENDING           | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED, código exacto                 |
| REVERSAL_CUSTODY_INACTIVE   | 202 / PENDING           | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED, código exacto                 |
| REVERSAL_ASSET_MOVED        | 202 / PENDING           | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED, código exacto                 |
| REVERSAL_LOAN_MISMATCH      | 202 / PENDING           | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED, código exacto; copy portal U2 |

Los cuatro recorridos parten del comando supervisor y verifican SQL+API. No se reutiliza el helper que firma jobs del integrado de V2.

## 3. RA-11/RA-13: diagnóstico y logs

Una referencia heredada sintética no UUID provoca QueryFailedError en el ledger. El sobre válido pasa por MOD11, relay y firma real; MOD12 reintenta ocho veces. Para inspeccionar la DLQ API antes del consumidor de diagnósticos, se detiene exclusivamente el worker iniciado por esta sesión, después del reencolado firmado; se reinicia en finally. Ninguna cola global se pausa.

La inspección server-side devuelve únicamente booleanos y opciones: firma presente, motivo ausente, reversalRequestId coincide, reason/envelope ausentes, `removeOnFail.age=2592000` y `removeOnComplete=true`. El origen desaparece tras enviar el diagnóstico. Se comprueba la configuración de antigüedad; **no se afirma haber esperado 24 horas o 30 días**. La extensión de clasificación/firmado/reemisión está en `apps/worker/src/services/execution-order-relay.service.ts:58`, `apps/worker/src/processors/execution-order-events.processor.ts:526` y `apps/worker/src/services/execution-order-inventory-rescan.service.ts:288`. La retención corregida y diagnóstico API están en `apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:672` y `:697`.

La spec guarda offsets antes del caso y escanea ambos logs de ese segmento; exige que el log API corresponda al fallo y el log worker al eventId inspeccionado. Los asserts emiten solo booleanos. Los archivos permanecen fuera del repositorio: `%TEMP%/iwana-v4r-api.log`, `%TEMP%/iwana-v4r-worker.log`. Trace, video y screenshot están desactivados; no se exporta storageState.

### Hallazgo adicional heredado: logging global TypeORM

**[BLOQUEO / CONSULTA al dueño de D11]** El fallo técnico también produce `query failed`, PARAMETERS y el mensaje crudo PostgreSQL en el log API. No se copian aquí datos ni mensajes de esa salida. El motivo del reverso y el sobre no aparecen (RA-13 PASS), pero **D11 prohíbe el mensaje crudo**, por lo que esa garantía adicional no queda satisfecha.

El logging global configura `['error']` en producción y `['error','migration']` en desarrollo: `apps/api/src/app.config.ts:134`, `apps/worker/src/worker.module.ts:171` y `packages/database/src/data-source.ts:161`. Referencia normativa: spec hermana D11/CA-11. Es un comportamiento heredado confirmado en esta corrida; no se modificó ni se alteran G6/G6.5 del consumo por decisión del QA.

## 4. RA-14: autorización y continuación reproducible

Escenario controlado del tenant autorizado:

- OT: `4e4ac888-76c8-4ff2-88d3-2b6dc424e101`.
- Solicitud: `fc0682b9-8352-4f66-88f7-032042a36b70`.
- Único job: `inventory-response-952c7a5f-e781-561c-998b-e1ca99540e7d`, cola `operations-execution-events`.

Se mantuvo FOR UPDATE sobre la fila PENDING hasta que MOD12 guardó CONFIRMED; se detuvo el worker propio, se liberó el lock SQL y se esperó a que expirara el lock BullMQ. La lectura demostró respuesta existente y MOD11 PENDING. Queue.remove con iwana_readonly devolvió NOPERM. El usuario autorizó expresamente **«Autorizar ese borrado único y reiniciar»**.

Con esa autorización se ejecutó Queue.remove **solo sobre ese ID**, sin leer data: resultado 1; hash ausente; sin membresía wait/active/delayed. No se ejecutó DEL manual. Se reinició el worker y se esperó el umbral natural de 15 minutos, sin cambiar fechas de D7. La comprobación fresca confirma 2 intentos, 2 eventos outbox, recibo único, movimiento único contra el original y proyección SQL+API CONFIRMED.

La spec tiene dos fases: sin V4_RA14_REQUEST_ID prepara un escenario, guarda metadata sin secretos en `%TEMP%/iwana-v4r-ra14-prepared.json`, intenta solo el ACL readonly y falla pidiendo decisión si NOPERM. **Nunca elimina con admin automáticamente.** Con V4_RA14_REQUEST_ID continúa un escenario ya autorizado y retirado; comprueba hash ausente, worker propio vivo y los invariantes D7. El estado del caso ejecutado está en `%TEMP%/iwana-v4r-ra14-state.json`. La autorización no permite eliminar otras respuestas ni repetir eliminaciones en reruns.

## 5. Reproducción y pendientes

Con API/worker/portal ya iniciados contra la base sintética y las credenciales locales ignoradas, la corrida utilizada es:

```powershell
$env:DB_NAME='i4_qa_20261006_a1'
$env:V4_RV5_GO='true'
$env:V4_WORKER_PID='<PID del worker propio vivo>'
$env:V4_SIGNING_KEY_PATH=Join-Path $env:TEMP 'iwana-v4r-signing.local'
$env:V4_API_LOG_PATH=Join-Path $env:TEMP 'iwana-v4r-api.log'
$env:V4_RA14_REQUEST_ID='fc0682b9-8352-4f66-88f7-032042a36b70'
pnpm exec playwright test e2e/tests/api/mod11-mod12-reverso.spec.ts --config e2e/playwright.api.config.ts --retries=0
```

La infraestructura ausente falla; no hay skip. La clave sintética de firma persiste en el archivo temporal local ignorado `%TEMP%/iwana-v4r-signing.local` y se inyecta en el entorno de API y worker; coincide en ambos procesos. Nunca se imprime ni versiona. No se importa código de otra app en el test.

**[BLOQUEO] RA-05, dueño V1:** scope fuera de sede devuelve NotFoundException (`apps/api/src/modules/tasks/services/execution-orders.service.ts:3690`, `:3709`); obtener el 403 exigido o resolución documental formal por AI-EM-ARCH.

**[BLOQUEO] RA-06, dueño V1:** ZodValidationPipe genera BadRequestException (`apps/api/src/common/pipes/zod-validation.pipe.ts:21`); falta el 422 específico exigido para motivo vacío/PII.

**[CONSULTA / BLOQUEO] D11 TypeORM:** decidir/corregir la salida cruda heredada sin trasladar el motivo fuera de MOD11.

Sin commit. No se cierra G6 desde este dictamen. El dictamen V4 v1.0 queda superado por esta evidencia en Redis y en los recorridos RA; sus limitaciones históricas no se cuentan como PASS de esta corrida.

**[CONSULTA] RA-03 a AI-EM-ARCH / dueño V2:** `stock-ledger.service.ts:895` fija el enlace y guarda la entidad original; se observa también cambio de `updated_at`. La spec dice «solo se fija reversedByMovementId». Ratificar explícitamente el tratamiento de esa metadata o corregir el comportamiento, sin alterar los campos originales de negocio. QA conserva la comparación estricta hasta esa resolución.
