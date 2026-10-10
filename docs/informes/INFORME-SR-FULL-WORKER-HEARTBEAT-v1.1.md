# Informe — heartbeat y healthcheck efectivo del worker

- **Fecha:** 2026-10-10
- **Versión:** 1.1, amplía y supersede la evidencia de implementación de la v1.0.
- **Estado:** **B4 corregido; G6.5 GO** en los gates bloqueantes del SHA `91c1f5e93f0ccb862ec08963bc60008bfe1d22d9`.
- **Alcance:** readiness de consumidores BullMQ, heartbeat Redis y probes de Compose en producción y E2E. No configura un destino externo de alertas.

## Implementación

`WorkerHeartbeatService` descubre los proveedores Nest de tipo `WorkerHost` y publica `iwana:worker:heartbeat:<hostname>` solo cuando todos sus workers están en ejecución, sin pausa y con el cliente BullMQ conectado (`status=ready`). Sin workers descubiertos, ante error o si cualquier consumidor no está listo, elimina la marca. También renueva la marca cada 10 segundos con TTL de 30; un event loop detenido deja vencerla. La clave no contiene tenant, job, payload ni datos de negocio.

`dist/worker-healthcheck.js` conecta a Redis con `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` y `REDIS_DB`. Falla si Redis no responde, no existe la marca o su timestamp supera el TTL. Los valores se configuran con `WORKER_HEARTBEAT_INTERVAL_SECONDS` y `WORKER_HEARTBEAT_TTL_SECONDS` (defaults 10 y 30; el TTL debe ser al menos el doble del intervalo). El `Dockerfile` exige que el probe esté incluido en la imagen final podada.

Los Compose de producción y E2E usan ese probe. `worker-prod` añade `init: true`; no se publican puertos. El healthcheck depende de Redis y declara `unhealthy` también cuando Redis falla. La aplicación debe separar la alerta de salud del worker de la señal de Redis.

## Referencias de implementación

| Aspecto                                         | Código                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Descubrimiento y evaluación de readiness BullMQ | `apps/worker/src/services/worker-heartbeat.service.ts` y `apps/worker/src/services/worker-heartbeat.health.ts`           |
| Pruebas de heartbeat/readiness                  | `apps/worker/src/services/worker-heartbeat.service.spec.ts` y `apps/worker/src/services/worker-heartbeat.health.spec.ts` |
| Probe Docker                                    | `apps/worker/src/worker-healthcheck.ts`                                                                                  |
| Probes de producción y E2E                      | `docker-compose.prod.yml` y `docker-compose.e2e.yml`                                                                     |

## Evidencia

| Gate                             | Resultado                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Typecheck global                 | **8/8**, `Cached: 0`                                                                                                                                                                                                                 |
| Worker Jest                      | **20 suites, 169/169 tests**                                                                                                                                                                                                         |
| Lint del worker                  | **0 errores**, 1 warning previo en `apps/worker/src/main.ts:56`                                                                                                                                                                      |
| Build Docker e imagen production | **GO**; conserva `dist/worker-healthcheck.js` y pasa el smoke del grafo runtime                                                                                                                                                      |
| Configuración Compose E2E        | **GO** con `docker compose config --quiet` y variables efímeras                                                                                                                                                                      |
| CA-02 — loop detenido            | **GO observado en Docker:** `healthy → unhealthy` tras `SIGSTOP` y recuperación a `healthy` tras `SIGCONT`; contenedores efímeros, sin volúmenes ni puertos publicados                                                               |
| CI sobre `91c1f5e`               | **GO en los gates bloqueantes:** lint/typecheck/build/unit tests, imágenes production, E2E operativo R4.1 e integridad ADR; el smoke web también pasó. El conteo E2E portal es informativo y seguía en curso al registrar el estado. |

La demostración de CA-02 usó el servicio heartbeat compilado desde el árbol, el probe de producción y Redis local efímero, con intervalo de 1 segundo, TTL de 6 segundos y healthcheck cada 2 segundos. Se observó `healthy → unhealthy → healthy`.

## Cierre y pendientes

El healthcheck distingue un worker disponible de un proceso que solo sigue vivo. Para completar el alertado de G7, la plataforma de despliegue debe notificar si `worker-prod` permanece `unhealthy` durante 60 segundos, cerrar la alerta cuando recupere y mantener una alerta separada para Redis. El repositorio no identifica proveedor/host ni configura recolector o destino de notificación.

Este informe no acredita el p95 compartido de R2. G7 sigue pendiente de un staging no productivo compartido con API/worker, PostgreSQL de prueba, Redis autenticado, MinIO dedicado y credenciales sintéticas en un secret store. El gate aprobado es p95 ≤ 1,5 s y p99 informativo; la medición local no sustituye ese entorno. El estado completo y el protocolo están en [el plan de reverso v1.5](../plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md).
