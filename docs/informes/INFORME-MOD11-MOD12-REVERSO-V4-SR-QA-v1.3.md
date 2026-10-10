# Informe V4-R3 — reverso MOD11 ↔ MOD12 con worker único y precondición single-worker

- **Fecha:** 2026-10-10
- **Rol:** sr-qa
- **Dictamen:** **GO** (17/17, exit 0, 3,5 min; ver §7)
- **HEAD base:** `7552c505`; árbol local con V1–V3, R-V5 y R-LOG sobre `main`, sin commit.
- **Alcance del track:** sin tocar código productivo, sin commit, solo tenant `i4-qa-a-20261006-9d3098f4` / DB `i4_qa_20261006_a1`.
- **Entrega:** `e2e/tests/api/mod11-mod12-reverso.spec.ts` (untracked) con **un único cambio**: precondición `EXPECTED_SINGLE_WORKER` en RA-11 + `execSync` en el import. RA-03/05/06 intactos (spec v1.2 §9b, ver §2).

## 1. Inventario de procesos corregido (corrige §6 de la v1.2)

Causa raíz de AI-EM-ARCH confirmada en vivo por este track — **había tres workers**, no cero consumidores:

| PID | Arranque | CommandLine | Conexiones Redis (6380) | Destino |
| --- | --- | --- | --- | --- |
| 30536 | 8:04:20 | `node --enable-source-maps C:\appiw\apps\worker\dist\main` (huérfano) | 38 | Detenido por QA |
| 31064 | 8:04:20 | `node --enable-source-maps C:\appiw\apps\worker\dist\main` (huérfano) | 38 | Detenido por QA |
| 30624 | 9:05:18 | `dist/main.js` cwd `apps/worker` (worker QA de la pidfile) | 38 | Detenido por QA |
| 31384 | 8:05:44 | `dist/main` (API, escucha 127.0.0.1:3000) | 13 | **Intocado** |

El §6 v1.2 afirmaba "cero consumidores posibles" porque solo inventarió `V4_WORKER_PID` y dos dev-`watch`; el error era el inventario, no el producto: el inbox `mod11-dlq-terminal` solo lo escribe `ExecutionOrderDlqProcessor` del worker, y los tres consumían `operations-execution-dlq` con `removeOnComplete`, borrando el diagnóstico antes del poll de RA-11 (línea 735 v1.2).

Limpieza autorizada (Adenda 3 §V4-R3.1): `Stop-Process -Id 30536,31064,30624 -Force`. Post: `Get-NetTCPConnection -RemotePort 6380` → **solo 31384 (13)**. Postgres/Redis y portal intactos.

Worker QA único arrancado con el build R-LOG vigente (dist verificado: `SafeTypeOrmLogger` en `apps/worker/dist/worker.module.js`, `TYPEORM_QUERY_ERROR` en `packages/database/dist/safe-typeorm.logger.js`; mecanismo idéntico a `restartQaWorker()`: cwd `apps/worker`, `NODE_ENV=development`, `DB_NAME=i4_qa_20261006_a1`, signing key de `%TEMP%`). Health API **200**. Log API post-reinicio (PID 31384, desde línea 1233): **414 líneas** `TYPEORM_QUERY_ERROR operation=<OP> sqlstate=<CODE>` y **0** con `PARAMETERS`, `query failed:` o mensaje crudo (las 64 antiguas son del proceso 26300 de las 7:36, pre-R-LOG).

## 2. Precondición añadida (archivo:línea)

`e2e/tests/api/mod11-mod12-reverso.spec.ts` (untracked, único cambio del track):

- `:9` — import extendido a `execSync, spawn` (conteo mínimo necesario).
- `:684-713` — bloque precondición al inicio de RA-11 (`:677`): inventaría con `Get-NetTCPConnection -RemotePort 6380` los PIDs con conexiones a Redis, excluye el API (el que escucha `:3000`) y conserva los cuyo `CommandLine` casa con `dist/main`. Falla de inmediato si el inventario falla o si el conteo ≠ 1, con mensaje `EXPECTED_SINGLE_WORKER` (cubre >1 **y** 0: con 0 workers el poll quemaría 30 s + 220 s en vano — endurecido tras la corrida 1, §4).
- Sin esperar los 220 s cuando el entorno está contaminado. RA-03 (`:508` `to_jsonb(m)-'reversed_by_movement_id'-'updated_at'`), RA-05 (`:557-559` 403/404 + `allowedActions`) y RA-06 (`:565-566` 400/400) **sin cambios**.

## 3. Comando exacto (corrida verde)

```powershell
$env:DB_NAME='i4_qa_20261006_a1'
$env:V4_RV5_GO='true'
$env:V4_WORKER_PID='20064'
$env:V4_SIGNING_KEY_PATH=Join-Path $env:TEMP 'iwana-v4r-signing.local'
$env:V4_API_LOG_PATH=Join-Path $env:TEMP 'iwana-v4r-api.log'
$env:V4_RA14_REQUEST_ID='fc0682b9-8352-4f66-88f7-032042a36b70'
pnpm exec playwright test e2e/tests/api/mod11-mod12-reverso.spec.ts --config e2e/playwright.api.config.ts --retries=0
```

`V4_WORKER_PID=20064` = único worker vivo al inicio (pidfile; RA-11 lo detiene y `restartQaWorker()` deja el 32184, ver §6). RA-14 en continuación, sin borrados con admin.

## 4. Corridas V4-R3 (conteos reales)

| Corrida | Resultado real | Nota |
| --- | --- | --- |
| Completa 1 (worker 7940, arranque 9:45:54) | **5 passed, 12 failed, exit 1 (11,2 m)** | 7940 murió ~9:47 sin rastro en su log (última línea: métrica rescan); RA-01/RA-02 en verde, resto PENDING 60 s; RA-11 cayó en el poll `sourceKey` 30 s (no llegó al DLQ). Incidente de entorno, no de producto; no reproducido con los workers siguientes. |
| Focal RA-02 humo (worker 30284) | **1/1, exit 0 (7,7 s)** | Consumo verificado antes de la completa. |
| Completa 2 (worker 20064) | **17 passed, exit 0 (3,5 m)** | **Verde total.** RA-11/RA-13 2,3 m (ciclo DLQ real de 8 intentos); RA-14 46 ms. |

Nota de higiene: el comando largo que encadenaba humo+completa fue abortado por el harness (`ChildProcess.kill`) pero su runs fantasma sobrevivió y ejecutó RA-11 (mató 30284 → arrancó 20064 a las 10:03:14); terminó antes de la completa 2, con fixtures UUID-aisladas y RA-14 en continuación de solo lectura. La completa 2 corrió sola de principio a fin con worker único verificado por la precondición.

## 5. Matriz RA-01..RA-14 (corrida completa 2, 17/17)

| Criterio | Estado | Evidencia real |
| --- | --- | --- |
| RA-01 | PASS (4,0 s) | 202, recibo/API CONFIRMED, serial en custodia, comodato ligado cerrado, contrario enlazado. |
| RA-02 | PASS (5,0 s) | Saldos origen/destino 0→1/1→0; proyección CONFIRMED. |
| RA-03 | PASS (5,0 s) | Fila original idéntica salvo `reversed_by_movement_id` + `updated_at`; enlace correcto. |
| RA-04 | PASS (8,2 s) | Terminal intacta + marca «Corrección posterior al cierre.» en portal real. |
| RA-05 | PASS (165 ms) | Técnico 403; supervisor fuera de sede 404; acción ausente en `allowedActions`. |
| RA-06 | PASS (117 ms) | Motivo vacío 400; PII conocida 400. |
| RA-07 | PASS (999 ms) | Carrera 202/409; replay 202; nueva key 409; un recibo y un contrario. |
| RA-08 | PASS 4/4 (4,9 s c/u) | Ver matriz §6. |
| RA-08 consola | PASS (8,1 s) | Copy de rechazo `REVERSAL_LOAN_MISMATCH` visible en portal real. |
| RA-09 | PASS (10,0 s) | MATERIAL pendiente en progreso y cierre; terminal conserva resultado. |
| RA-10 | PASS (233 ms) | PENDING/REJECTED sin acción; comandos 409. |
| RA-11 | PASS (2,3 m) | Precondición `toBe(1)` en verde; job fuente con firma y `removeOnFail.age=86400`; DLQ `dlq-<eventId>` con `reversalRequestId`, sin motivo/envelope, `age=2592000`, `removeOnComplete`; origen completado; recibos REVERSAL 0. |
| RA-12 | PASS (9,9 s) | Reintento tras rechazo → CONFIRMED; historial de dos solicitudes. |
| RA-13 | PASS (en RA-11) | Motivo ausente de outbox (SQL), job y DLQ (proyecciones booleanas `EVAL_RO`, sin materializar `job.data`); log API del segmento con `TYPEORM_QUERY_ERROR … sqlstate=22P02` y sin `legacy-invalid-reference`, `PARAMETERS`, mensaje crudo ni texto de consulta; motivo ausente de ambos logs. |
| RA-14 | PASS (46 ms) | Continuación `fc0682b9-…`: CONFIRMED, intentos ≥ 2, 1 recibo REVERSAL, 1 movimiento contrario, enlace y proyección correctos. Sin borrados. |

## 6. Matriz 4 motivos × 4 tramos (`iwana-matriz-motivos`, spec `:593`, verde 4/4)

| Motivo | MOD11 por HTTP | Relay / cola | Recibo MOD12 | Proyección MOD11 |
| --- | --- | --- | --- | --- |
| REVERSAL_ORIGINAL_NOT_FOUND | 202 / PENDING (`reverse()`) | Outbox publicado; consumidor real (`decided()` sale de PENDING) | REJECTED, código exacto (recibo `kind='REVERSAL'`) | API REJECTED + `rejectionReasonCode` exacto |
| REVERSAL_CUSTODY_INACTIVE | 202 / PENDING | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED + código exacto |
| REVERSAL_ASSET_MOVED | 202 / PENDING | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED + código exacto |
| REVERSAL_LOAN_MISMATCH | 202 / PENDING | Outbox publicado; consumidor real | REJECTED, código exacto | API REJECTED + código exacto; copy portal verificado |

Inspección de colas solo lectura (post-corrida, usuario `iwana_readonly`, sin `job.data`): `inventory-execution-requests` wait/active/failed 0 (delayed 2); `operations-execution-dlq` 0/0/0 (delayed 1); `operations-execution-events` 0/0/0; `operations-execution-relay` wait/active/failed 0 (delayed 3, completed 197533 recortado por retención). Sistema drenado.

## 7. Dictamen y estado final

- **Dictamen: GO.** 17/17 exit 0 con worker único, precondición en verde, DLQ/retenciones/R-LOG y las cuatro tramos por motivo evidenciados contra Postgres/Redis reales. El NO GO de v1.2 queda explicado (§1) y cerrado; el §6 v1.2 se corrige con este §1.
- Estado final verificado: worker único **32184** (38 conns, boot 10:28:19 vía `restartQaWorker()` de RA-11) + API **31384** (13 conns), health 200, pidfile `32184`.
- Notas sin impacto en el dictamen: (a) muerte del worker 7940 sin traza (~9:47, entorno; no reproducida); (b) corrida fantasma solapada terminada antes de la completa 2 (§4); (c) escombro D7 de reversos sintéticos PENDING en el tenant QA (recomendación v1.2 vigente: purga/política); (d) `runner.ts:557` con `logging: ['error']` → track R-LOG2, fuera de este encargo.
- Sin commit. Cero PII/secretos en spec/informe (motivos sintéticos UUID; credenciales solo en archivos locales ignorados).
