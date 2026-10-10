# Informe V4-R2 — verificación del reverso MOD11 ↔ MOD12 contra la spec v1.2

- **Fecha:** 2026-10-10
- **Rol:** sr-qa
- **Dictamen:** **NO GO** (ver §7; bloqueo preciso en RA-11/RA-13, sin adaptar asserts)
- **HEAD base:** `7552c505`; árbol local con V1–V3, R-V5 y R-LOG sobre `main`, sin commit.
- **Entrega:** `e2e/tests/api/mod11-mod12-reverso.spec.ts` **sin ediciones en esta sesión** (los tres ajustes V4-R2 ya estaban aplicados y verificados). Cero cambios de código productivo desde este track. Sin commit.

## 1. Ajustes V4-R2 verificados (spec v1.2 §9b, sin cambios)

| Criterio | Estado en el árbol | Evidencia |
| --- | --- | --- |
| RA-03 | Alineado, PASS | `mod11-mod12-reverso.spec.ts:508`: `to_jsonb(m)-'reversed_by_movement_id'-'updated_at'`; comparación estricta + enlace aparte. Verde en las 4 corridas completas y en la focal previa. |
| RA-05 | Alineado, PASS | `:557-558`: técnico → `403`; supervisor fuera de sede → `404`; `allowedActions` sin `REVERSE_ITEM_USAGE`. Verde en las 4 corridas. |
| RA-06 | Alineado, PASS | `:565-566`: vacío → `400`; PII conocida → `400`. Verde en las 4 corridas. |

## 2. R-LOG en GO + reinicio ejecutado por este track

- R-LOG GO confirmado: `docs/informes/INFORME-MOD11-MOD12-REVERSO-R-LOG-v1.0.md` (SafeTypeOrmLogger + relay `{ age }`; typecheck 8/8, db 59/366, worker 2/22).
- Recompilado en esta sesión: `pnpm --filter @iwana/db build` → `@iwana/api build` → `@iwana/worker build`, los tres exit 0. Dist verificado: `SafeTypeOrmLogger` en `apps/api/dist/app.config.js:132` y `apps/worker/dist/worker.module.js:151`; `{ age: NON_INVENTORY_SOURCE_JOB_RETENTION_SECONDS }` en el relay compilado; `TYPEORM_QUERY_ERROR` presente en `packages/database/dist/safe-typeorm.logger.js`.
- Reiniciados api (PID 31384, `apps/api/dist/main`, `NODE_ENV=development`, `DB_NAME=i4_qa_20261006_a1`, signing key del `%TEMP%/iwana-v4r-signing.local`) y worker QA (pidfile `%TEMP%/iwana-v4r-worker.pid`), con logs frescos en `%TEMP%/iwana-v4r-api.log` / `%TEMP%/iwana-v4r-worker.log`. Health API 200 verificado tras el arranque.
- Sonda del artefacto compilado con sintético no-PII: `FORMAT_OK=true` (línea exacta `TYPEORM_QUERY_ERROR operation=UPDATE sqlstate=22P02`), `SENTINEL_ABSENT=true`, `NOPARAMS=true`.
- Higiene de entorno (reversible): se detuvieron dos workers dev (`nest start --watch`, PIDs 1868/10168, de otras sesiones) porque la spec asume un único worker QA para RA-11/RA-14; se rearrancan con `pnpm --filter @iwana/worker dev`. Portal y API no se tocaron salvo el reinicio exigido.

## 3. Corridas finales: 4 completas + 1 focal — 16/17 y RA-11 determinista

Comando (las 4 completas; la focal añade `-g "RA-11"`):

```powershell
$env:DB_NAME='i4_qa_20261006_a1'
$env:V4_RV5_GO='true'
$env:V4_WORKER_PID='<worker QA vivo de la pidfile>'
$env:V4_SIGNING_KEY_PATH=Join-Path $env:TEMP 'iwana-v4r-signing.local'
$env:V4_API_LOG_PATH=Join-Path $env:TEMP 'iwana-v4r-api.log'
$env:V4_RA14_REQUEST_ID='fc0682b9-8352-4f66-88f7-032042a36b70'
pnpm exec playwright test e2e/tests/api/mod11-mod12-reverso.spec.ts --config e2e/playwright.api.config.ts --retries=0
```

| Corrida | Resultado real | Nota |
| --- | --- | --- |
| Completa 1 (api+worker R-LOG recién reiniciados) | **16 passed, 1 failed, exit 1 (5,0 m)** | Falla solo RA-11 línea 735 (poll DLQ 220 s). |
| Completa 2 (sistema en quietud) | **16/17, exit 1 (5,0 m)** | Idéntica firma. |
| Completa 3 (tras drenar colas a 0) | **16/17, exit 1 (5,0 m)** | Idéntica firma. |
| Completa 4 (dev workers detenidos, colas limpias) | **16/17, exit 1 (5,0 m)** | Idéntica firma, con cero consumidores posibles en la ventana. |
| Focal RA-11 | **0/1, exit 1 (3,7 m)** | Misma línea 735. |

Cinco fallos idénticos (misma línea, mismo timeout 220 s, misma duración 3,7 m), con el resto siempre verde. Ningún assert se adaptó; ningún rerun con retries.

## 4. Matriz RA-01..RA-14 (conteos de la corrida 4; el resto hereda su verde ×4)

| Criterio | Estado | Evidencia real |
| --- | --- | --- |
| RA-01 | PASS | 202, recibo/API CONFIRMED, serial en custodia, comodato ligado cerrado, contrario enlazado (SQL+API). |
| RA-02 | PASS | Saldos origen 0→1 / destino 1→0; proyección CONFIRMED. |
| RA-03 | PASS | Fila original idéntica salvo `reversed_by_movement_id` + `updated_at`; enlace correcto. |
| RA-04 | PASS | Terminal intacta (resultado/cierre/evidencia) + marca «Corrección posterior al cierre.» en portal real. |
| RA-05 | PASS | Técnico 403; supervisor fuera de sede 404; acción ausente en `allowedActions`. |
| RA-06 | PASS | Motivo vacío 400; PII conocida 400. |
| RA-07 | PASS | Carrera 202/409; replay de la ganadora 202; nueva key 409; un recibo y un contrario. |
| RA-08 | PASS | 4/4 motivos REJECTED con recibo y proyección (detalle §5). |
| RA-09 | PASS | MATERIAL pendiente en progreso y cierre; terminal conserva resultado. |
| RA-10 | PASS | PENDING/REJECTED sin acción; comandos 409. |
| RA-11 | **FAIL** | Pre-735 verde (job fuente existe, firma presente, motivo ausente, `removeOnFail.age=86400`). El poll de `EXISTS(bull:operations-execution-dlq:dlq-<eventId>)` agota 220 s. Ver §6. |
| RA-12 | PASS | Reintento tras rechazo → CONFIRMED; historial de dos solicitudes. |
| RA-13 | **BLOQUEADO** | Los asserts posteriores a la línea 735 (origen consumido, recibos 0, escaneo de logs del segmento) no llegaron a ejecutarse en ninguna corrida. Evidencia parcial §6. |
| RA-14 | PASS | Continuación con `V4_RA14_REQUEST_ID` (estado autorizado preexistente): CONFIRMED, intentos ≥ 2, outbox ≥ 2, un recibo, un movimiento, enlace y proyección correctos. Sin borrados nuevos. |

### Matriz de 4 motivos × 4 tramos (RA-08, `iwana-matriz-motivos`, verde en las 4 completas)

| Motivo | MOD11 por HTTP | Relay / cola | Recibo MOD12 | Proyección MOD11 |
| --- | --- | --- | --- | --- |
| REVERSAL_ORIGINAL_NOT_FOUND | 202 / PENDING | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED, código exacto |
| REVERSAL_CUSTODY_INACTIVE | 202 / PENDING | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED, código exacto |
| REVERSAL_ASSET_MOVED | 202 / PENDING | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED, código exacto |
| REVERSAL_LOAN_MISMATCH | 202 / PENDING | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED, código exacto; copy portal verificado (caso consola) |

Cada motivo recorre comando → outbox/cola → recibo → proyección con `rejectionReasonCode`, contra Postgres/Redis reales, sin firmar jobs en el test. Inspección de colas solo lectura (`iwana-queue-inspect`): sin materializar `job.data`.

## 5. Evidencia de log saneado y de mecánica DLQ (parcial, honesta)

- Log API del segmento post-reinicio: **278 líneas** `TYPEORM_QUERY_ERROR operation=SELECT sqlstate=22P02` (formato nuevo exacto) y **0 líneas** con formato antiguo (`PARAMETERS`, `query failed:`, mensaje crudo). El logger R-LOG está activo en runtime.
- La mecánica DLQ **funciona en este sistema**: un ciclo de escombro (reemisión D7 de un reverso RA-11-like anterior) completó 8 intentos → diagnóstico creado → consumido y registrado (`inventory_event_recorded ... attempts=8 error_type=QueryFailedError`) a las 8:35 con el worker nuevo; retenciones `{ age }` afirmadas en vivo (86400 origen, 2592000 DLQ) en las aserciones pre-735.
- **No verificado:** los asserts RA-13 del segmento (motivo ausente de logs del API/worker de la corrida y cierre de DLQ) porque el test cae en la línea 735 antes de ejecutarlos. No se afirma lo no ejecutado.

## 6. Forense del bloqueo RA-11 (handoff a sr-backend / AI-EM-ARCH, sin concluir producto)

Hechos directos (sin inferencia):

- Los diagnósticos de reverso **sí se crean y consumen** en el sistema reiniciado: filas `last_error` con solo `{failedAt, attemptsMade, errorType}` (D11) y filas inbox `mod11-dlq-terminal` existen para los objetivos de las corridas 3 y 4, con `failedAt − occurred_at ≈ 128 s` (cadencia sana, igual que pre-reinicio: 127 s).
- En la corrida 4 (y la focal) había **cero consumidores posibles** en la ventana (worker QA detenido por la propia spec; dev workers detenidos por higiene; portal y API no consumen esa cola — verificado por código), y aun así el poll no vio la clave.
- Infra única y sana: un solo Redis (`iwana_redis_dev`, `noeviction`, `evicted_keys=0`), misma DB 0 en API/worker/spec, un solo API en :3000, constantes de cola verificadas, sin imports entre `apps/*` tocados por QA.
- El fallo empezó exactamente tras el reinicio con R-LOG (v1.1 pasó RA-11 pre-reinicio con la misma spec y los mismos asserts).

Hipótesis descartadas con evidencia: asserts fuera de RA-03/05/06 ( intactos), formato de clave/cola/DB/host (verificados), evicción Redis (0), consumidores fantasma en corrida 4/focal (imposible por inventario de procesos), segundo API (inexistente), atajo de recibo (filtro `kind` presente), rate limiter (inexistente), purge legacy (solo legacy, `removed=0`), `dlq_enqueue_failed` (ausente del log), retries (`--retries=0`).

**No se declara defecto de producto**: la mecánica (8 intentos → diagnóstico con `reversalRequestId` y sin motivo → retención `{ age }` → consumo y asiento) está evidenciada funcionando. Lo que no se explica es la visibilidad de la clave DLQ dentro de la ventana de 220 s del poll en estas 5 corridas. Se entrega a sr-backend/AI-EM-ARCH con este handoff reproducible; QA no ajusta el spec fuera de RA-03/05/06 ni declara 17/17 sin un 17/17 real.

## 7. Dictamen y pendientes

- **Dictamen: NO GO.** 16/17 estable en 4 corridas completas + 1 focal; RA-11/RA-13 bloqueados por la anomalía de visibilidad DLQ descrita en §6. Todo lo demás es GO-grade con conteos reales.
- **[BLOQUEO → sr-backend / AI-EM-ARCH]** Investigar la anomalía §6 con un objetivo vivo (repro: §3 con `V4_WORKER_PID` de la pidfile). Candidatos: cliente del poll vs. escritura del diagnóstico en el build reiniciado; cualquier consumidor no inventariado de `operations-execution-dlq`.
- **[PENDIENTE sr-qa]** Corrida completa 17/17 exit 0 tras la resolución + actualización de este informe con conteos reales y matriz completa en verde. Recomendación de higiene: retirar el escombro sintético RA-11-like acumulado en el tenant QA (reversos PENDING con referencia inválida que D7 reemite cada ~15 min hasta su tope) o fijar política de purga para ese tenant.
- Deuda R-LOG §7 conocida (`runner.ts` sin logger seguro): sigue fuera de alcance, referenciada, no condiciona este dictamen más allá de lo ya dicho por R-LOG.
- Sin commit. Cero PII/secretos en spec/informe/logs versionados (credenciales solo en archivos locales ignorados; los sintéticos de diagnóstico nunca se copian).
