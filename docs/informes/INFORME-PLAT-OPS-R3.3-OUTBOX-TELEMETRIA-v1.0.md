# Informe PLAT-OPS — R3.3 telemetría del relay outbox

**Fecha:** 2026-07-31
**Responsable:** AI-PLAT-OPS
**Consulta:** AI-SR-FULL consultado; el cambio de health y relay queda registrado
como ownership compartido de plataforma/backend.
**Plan:** `docs/plans/2026-07-28-mod09-mod11-ot-instalacion-remediacion-g6.md` §R3.3
**Commit:** `fix(platform): report actual relay scan timestamp`

## 1. Decisión de integración

No existe exporter independiente en el repositorio. La integración usa el
contrato vigente `GET /api/v1/health`, conservando el health básico de DB/Redis
y agregando el bloque agregado `relay`. El worker publica en Redis el instante
del ciclo real del scanner con una clave global de plataforma, sin
`tenantId`/`schemaName`; la API solo lee esa señal. No se exponen
`tenantId` ni `schemaName` en el endpoint público; el endpoint autenticado
`GET /api/v1/tasks/execution-orders/health/relay` conserva el desglose por
tenant para operación autorizada.

El health básico no cambia a `degraded` por lag, DLQ o discrepancias. Si la
telemetría no está disponible durante una ventana de migración, devuelve
`relay.status=unavailable` sin falsear el estado de DB/Redis.

## 2. Señales entregadas

| Señal | Implementación |
| --- | --- |
| Profundidad outbox | Conteo de `published_at IS NULL` por tenant, agregado sin PII |
| Edad pendiente | `NOW() - MIN(occurred_at)` entre eventos no publicados |
| DLQ | Filas con `last_error IS NOT NULL`, que es el registro durable que escribe el procesador DLQ |
| Discrepancias | Comparación de OT canónica contra `schedule_events`, `visit_requests` y `operational_tasks` con la matriz existente |
| Último escaneo real | Timestamp escrito por el scanner worker al finalizar cada ciclo, incluso con cero publicaciones; la API devuelve `null` si la clave no existe o no hay un ciclo registrado |
| Distribución lag | `count`, `min`, `p50`, `p95`, `p99`, `max` sobre eventos pendientes; es medición, no criterio de abort |

La misma distribución queda disponible en el servicio real del worker para
consulta por tenant. El servicio conserva `SET LOCAL search_path` por
transacción y valida el nombre de schema.

### Corrección R3.3 — `lastScanAt`

La versión anterior derivaba `lastScanAt` de `MAX(published_at)`, por lo que
un ciclo sin publicaciones aparentaba no haber ocurrido. El worker ahora
registra el timestamp del ciclo real en Redis y la API lo consume como señal
global de plataforma. Las métricas de outbox siguen siendo tenant-safe: el
worker enumera schemas válidos y la API mantiene `SET LOCAL search_path` y el
`tenantId` obtenido del contexto autenticado para las métricas por tenant.

## 3. Umbrales

Se eliminaron los umbrales literales 120/600. La configuración queda sin
valor numérico por defecto:

- `OUTBOX_RELAY_LAG_DEGRADED_SECONDS`
- `OUTBOX_RELAY_LAG_STOPPED_SECONDS`

Si faltan, el contrato reporta exactamente `sin umbral aprobado`; el estado del
relay es `UNVERIFIED` y no se deriva ningún abort. La distribución se expone
independientemente de la configuración.

## 4. Evidencia

| Verificación | Resultado |
| --- | --- |
| Regresión API focalizada (convergencia + health) | **9/9 PASS**; incluye timestamp del scanner y ciclo sin publicaciones reportado como `null` cuando no hay señal |
| Regresión worker relay unit | **6/6 PASS**; incluye scan sin publicaciones con timestamp real y `lastScanCount=0` |
| API lint | **PASS** |
| API typecheck | **BLOQUEADO fuera de R3.3** por `apps/api/src/modules/inventory/tests/inventory-movement.port.spec.ts:30` (`Expected 2 arguments, but got 1`); archivo modificado por otro cambio concurrente, no incluido |
| Worker typecheck/lint | **PASS** |
| API tests focalizados (health, convergencia, configuración; corrida previa 2026-07-30) | **17/17 PASS** |
| Worker relay unit tests (corrida previa 2026-07-30) | **5/5 PASS** |
| Worker relay PostgreSQL real, `jest.integration.config.js` | **2/2 PASS** |
| Distribución real en ciclo PostgreSQL aislado | **1 evento pendiente observado** antes del relay; `count=1`, `p95` no nulo; después `published_at` no nulo |
| Compose production config | **PASS**, salida vacía, código 0 |

El ciclo real también mostró un tenant local legado sin la tabla outbox; se
registró como warning operativo y no afectó el schema aislado del test. No se
inventó una métrica para ese tenant.

La evidencia previa de implementación registró que la primera corrida de
`pnpm --filter @iwana/api build` encontró defectos preexistentes fuera de R3.3 en
`apps/api/src/modules/tasks/services/execution-orders.service.ts` (contrato
`ExecutionOrderEvidence`/entidad, líneas 1638 y 1653). La verificación fresca
posterior de esa sesión pasó el build de API; la verificación de esta sesión
queda registrada arriba porque otro cambio concurrente volvió a bloquear el
typecheck de API.

## 5. Consulta y stop/go

Consulta registrada:

```text
[CONSULTA] De: AI-PLAT-OPS → A: AI-SR-FULL
Contexto: R3.3, contrato health y telemetría del relay outbox
Pregunta concreta: ¿hay exporter vigente o debe integrarse en GET /api/v1/health?
Bloqueante: No | Supuesto: reutilizar health vigente y no crear exporter nuevo
```

No se propone umbral ni criterio de abort con esta muestra. La aprobación de
umbrales queda pendiente del CTO después de una medición de staging con mayor
historial operativo.
