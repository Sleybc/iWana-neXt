---
name: iwana-queue-inspect
description: Inspecciona en solo lectura las colas BullMQ del Redis de desarrollo (iwana_redis_dev): conteos por estado y últimos fallos con su motivo. Usar al depurar relay, eventos, DLQ, tombstone o recibos de inventario de OT, o antes de afirmar que una cola quedó drenada.
metadata:
  category: backend
  triggers: BullMQ, cola, job fallido, DLQ, relay, outbox, Redis, worker, drenada, failedReason
---

# Colas BullMQ en dev (solo lectura)

Solo lectura. Nunca `DEL`, `FLUSH*`, `XTRIM`, `ZREM` ni scripts de BullMQ que muevan,
reintenten o limpien jobs. Si hace falta actuar sobre una cola, se reporta y lo decide
el usuario.

## Cómo conectar

Preferido: el MCP `redis-dev`, que entra con el usuario ACL `iwana_readonly` (solo
`bull:*`; cualquier escritura responde `NOPERM`). Si no está conectado, ejecuta
`pnpm dev:redis-readonly-user` y reinicia la sesión.

Alternativa sin MCP, con `redis-cli` dentro del contenedor. Desde ADR-074 Redis exige
contraseña: pásala por stdin, nunca en la línea de comandos.

```bash
printf 'AUTH %s\nLLEN bull:<cola>:wait\n' "$REDIS_PASSWORD" | docker exec -i iwana_redis_dev redis-cli
```

## Colas

Prefijo por defecto de BullMQ: `bull` (el repo no define otro; confírmalo con
`SCAN 0 MATCH bull:*:meta COUNT 1000`).

`assurance-field-service`, `evidence-analysis`, `evidence-orphan-detection`,
`inventory-execution-requests`, `operations-execution-events`,
`operations-execution-relay`, `operations-execution-tombstone`, `refresh-token-purge`,
`schedule-events-sweep`, `search-index`, `tenant-provisioning`, `tenant-schema-purge`,
`users-bulk-create`.

Si una cola nueva no está en esta lista, búscala con
`grep -rhoE "QUEUE[A-Z_]*\s*=\s*'[a-z0-9:-]+'" packages/shared/src apps`.

## Pasos

1. **Conteos por estado** de la cola `Q`:
   - `LLEN bull:Q:wait` · `LLEN bull:Q:active` · `LLEN bull:Q:paused`
   - `ZCARD bull:Q:delayed` · `ZCARD bull:Q:prioritized` · `ZCARD bull:Q:failed`
   - `ZCARD bull:Q:completed` (puede estar recortado por `removeOnComplete`)
2. **Últimos fallos:** `ZREVRANGE bull:Q:failed 0 4` y, por cada id,
   `HMGET bull:Q:<id> name failedReason attemptsMade processedOn finishedOn`.
3. **Payload con cuidado.** El campo `data` lleva identificadores de tenant y de
   entidad. Resume sus claves; no lo copies completo en el chat ni en un INFORME.
4. **Entrega** una tabla `cola · wait · active · delayed · failed` y, si hay fallos,
   `jobId · name · motivo · intentos`. Una cola «drenada» exige `wait`, `active` y
   `delayed` en 0 en la misma lectura.

## Límites

- Es Redis de desarrollo. Nunca apuntes este skill a producción.
- Para diagnosticar el porqué de un fallo en el código, deriva a `systematic-debugging`
  y a `bullmq-specialist`.
