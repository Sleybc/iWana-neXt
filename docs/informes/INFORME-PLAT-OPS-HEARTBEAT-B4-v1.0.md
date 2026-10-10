# Informe — revisión de plataforma del heartbeat B4

- **Fecha:** 2026-10-10
- **Subagente:** plat-ops
- **Revisión sobre:** HEAD `209bcb398478902531694ef44ed4518f1c1dd4a6` (el código del heartbeat ya estaba en ese árbol).
- **Dictamen actualizado:** **GO para B4.** La revisión inicial validó por separado los overlays y dio un falso NO GO: `data` está declarada en el Compose base y los archivos de producción y E2E se consumen junto con él. La validación correcta de cada composición completa pasa con `config --quiet`.
- **Alcance:** revisión de solo lectura del probe, los dos servicios worker, `init: true` y la relación TTL/intervalo. Sin cambios de código.

## Hallazgos

| Revisión                           | Resultado                                                               | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Probe de Redis                     | **GO por inspección del código**                                        | Lee la marca `iwana:worker:heartbeat:<hostname>`, con el mismo `hostname()` que usa el emisor. Se conecta usando `REDIS_HOST/PORT/PASSWORD/DB`, falla ante error de Redis, marca ausente, malformada o vencida y finaliza con error si excede el timeout propio. `apps/worker/src/worker-healthcheck.ts:9-44`.                                                                                                                                                                |
| Emisión y vencimiento de la marca  | **GO por inspección del código**                                        | El worker solo renueva cuando los consumidores BullMQ descubiertos están en ejecución, sin pausa y con cliente `ready`. Escribe el timestamp y su expiración con un solo `SET ... EX`. `apps/worker/src/services/worker-heartbeat.service.ts:34-89`.                                                                                                                                                                                                                          |
| TTL frente al intervalo            | **GO**                                                                  | Ambos Compose usan intervalo de emisión de 10 s y TTL de 30 s. El resolver rechaza TTL menor que el doble del intervalo y limita ambos valores a enteros entre 1 y 3600 s. El TTL actual equivale a tres intervalos de emisión y tres intervalos normales del probe. `apps/worker/src/services/worker-heartbeat.health.ts:1-48`.                                                                                                                                              |
| Probe de producción y `init: true` | **GO por inspección y configuración** | `worker-prod` ejecuta `node dist/worker-healthcheck.js`, con intervalo 10 s, timeout 5 s, 3 reintentos, periodo inicial 60 s e inicio acelerado de 3 s; declara `init: true`. `docker-compose.prod.yml:312-379`. El timeout del probe de código es 4 s y el connect timeout Redis es 2 s, ambos dentro del timeout Compose de 5 s. La composición base + producción pasa `config --quiet`. |
| Probe de E2E                       | **GO por inspección y configuración** | `worker-e2e` ejecuta el mismo probe y usa los mismos parámetros 10/30 s y de healthcheck. `docker-compose.e2e.yml:53-105`. La composición base + E2E pasa `config --quiet`. |
| `init: true` de E2E                | **GO; deuda de paridad cerrada**                                        | `worker-e2e` ahora declara `init: true`, igual que `worker-prod`. La composición base + E2E pasa `config --quiet`; la diferencia de paridad queda corregida.                                                                                                                                                                                                                                                                                                                     |
| Carga de los Compose               | **GO**                                                                  | Con valores de validación, `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production config --quiet` y `docker compose -f docker-compose.yml -f docker-compose.e2e.yml --profile development --profile e2e config --quiet` terminan correctamente. La red compartida `data` se declara en `docker-compose.yml:344`; los overlays no se deben validar aislados.                                                                                                                                                     |

## Evaluación

El probe cubre la señal descrita por B4 y la configuración de intervalos respeta la validación implementada. La evidencia de la revisión anterior registra una demostración Docker `healthy → unhealthy → healthy` al detener y reanudar el event loop; está documentada en [INFORME-SR-FULL-WORKER-HEARTBEAT-v1.1.md](INFORME-SR-FULL-WORKER-HEARTBEAT-v1.1.md) §Evidencia. No repetí esa demostración en esta revisión.

La composición completa levanta sus definiciones de configuración: la red `data` viene del archivo base y `docker compose config --quiet` pasa para producción y E2E al combinar cada overlay con ese base. El NO GO inicial provenía de validar overlays sueltos, que no es el modo de invocación de CI ni del runbook de release. B4 queda en GO y la deuda P3 de paridad por `init: true` queda corregida en E2E.

## Referencias

- [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md), §3 y §6: E3 actualiza los dos probes; E4 y CA-06 requieren `init: true` en `worker-prod`.
- [INFORME-SR-FULL-WORKER-HEARTBEAT-v1.0.md](INFORME-SR-FULL-WORKER-HEARTBEAT-v1.0.md) y [v1.1](INFORME-SR-FULL-WORKER-HEARTBEAT-v1.1.md): implementación y evidencia previa.
- [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md), adenda B4: registro de cierre anterior.
- `apps/worker/src/worker-healthcheck.ts`
- `apps/worker/src/services/worker-heartbeat.health.ts`
- `apps/worker/src/services/worker-heartbeat.service.ts`
- `docker-compose.prod.yml`
- `docker-compose.e2e.yml`
- `docker-compose.yml:344` — declaración de la red compartida `data`
