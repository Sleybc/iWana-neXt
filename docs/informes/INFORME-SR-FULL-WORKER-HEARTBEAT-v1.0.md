# Informe — heartbeat y healthcheck efectivo del worker

- **Fecha:** 2026-10-10
- **Estado:** **B4 corregido**; señal y transición Docker comprobadas.
- **Alcance:** worker BullMQ, probe de Compose en producción y E2E; sin puerto HTTP nuevo.

## Implementación

`WorkerHeartbeatService` escribe `iwana:worker:heartbeat:<hostname>` en Redis cada 10 segundos y renueva su TTL de 30 segundos. El temporizador pertenece al event loop del proceso; un event loop detenido deja vencer la marca. La clave no contiene tenant, job, payload ni datos de negocio. En producción el servicio se activa con `NODE_ENV=production`; E2E lo activa explícitamente.

`dist/worker-healthcheck.js` conecta a Redis con los mismos `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` y `REDIS_DB` del worker. Falla si Redis no responde, no existe la marca o su timestamp supera el TTL. Los valores se configuran con `WORKER_HEARTBEAT_INTERVAL_SECONDS` y `WORKER_HEARTBEAT_TTL_SECONDS` (defaults 10 y 30; el TTL debe ser al menos el doble del intervalo). El `Dockerfile` exige que el probe esté incluido en la imagen final podada.

Los Compose de producción y E2E usan ese probe. `worker-prod` añade `init: true`; no se publican puertos. El healthcheck dependiente de Redis declara `unhealthy` también cuando Redis falla, conforme al trade-off aceptado por el prompt de heartbeat.

## Evidencia

| Gate                            | Resultado                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck global                | **8/8**, `Cached: 0`                                                                                                                                                                   |
| Worker                          | **20 suites, 167/167 tests**                                                                                                                                                           |
| Lint del worker                 | **0 errores**, 1 warning previo en `apps/worker/src/main.ts:56`                                                                                                                        |
| Build Docker de la imagen final | **GO**; la poda conserva `dist/worker-healthcheck.js` y el smoke del grafo runtime pasa                                                                                                |
| Configuración Compose E2E       | **GO** con `docker compose config --quiet` y variables efímeras de parseo                                                                                                              |
| CA-02 — loop detenido           | **GO observado en Docker:** `healthy → unhealthy` después de `SIGSTOP`; `healthy` tras `SIGCONT`. El contenedor de prueba y Redis fueron efímeros, sin volúmenes ni puertos publicados |

La demostración usó el servicio heartbeat compilado desde este árbol y el probe de producción, Redis local efímero, intervalo de 1 segundo y TTL de 6 segundos para acortar la ventana. El container healthcheck corrió cada 2 segundos. El resultado observado fue `healthy → unhealthy → healthy`.

## Límites de cierre

El estado de health de Docker ahora representa una señal útil y comprobada. Este repositorio no configura un destino de alertas externo; la alerta depende del monitor/orquestador que consuma el estado del contenedor. El E2E operativo R4.1 debe repetirse por la CI del SHA que incluya estos cambios. Este informe no acredita el p95 compartido de R2 ni cierra G6.5 o G7.
