# Informe P2 — Autenticación obligatoria de Redis (ADR-074)

**Agente:** plat-ops
**Fecha:** 2026-10-09
**Resultado:** GO
**Commit:** no realizado

## Cambios

- El Redis del Compose base arranca con `--requirepass ${REDIS_PASSWORD:?REDIS_PASSWORD is required}`. La clave también llega al healthcheck autenticado. Los perfiles de API y worker de producción, y el worker E2E, exigen `REDIS_PASSWORD`.
- `app.config.ts` rechaza la variable ausente o vacía. El worker valida su configuración al arrancar. Los cuatro consumidores de Redis reciben la contraseña obligatoria; se eliminaron los fallbacks a conexión sin autenticación.
- `scripts/dev.mjs` incluye la variable en el preflight. `.env.example` y `.env.production.example` dejan `REDIS_PASSWORD=` vacío y documentan su generación, así que copiar la plantilla no establece una clave conocida.
- Se buscaron las conexiones y referencias Redis en `apps/`, `packages/`, `scripts/` y `e2e/`. En las herramientas se tocaron `e2e/scripts/seed-mod11-r5-fixtures.mjs` (pasa la clave requerida a ioredis), `scripts/db/dev-redis-readonly-user.mjs` (falla cerrado si falta), `scripts/e2e-provision-operational.mjs` (clave efímera propia para el stack E2E) y `scripts/e2e-redis-fault.mjs` (documenta que solo controla por Compose el Redis E2E ya levantado, sin conectarse ni recrearlo). `scripts/generate-secrets.sh` agrega una clave aleatoria a `.env.development.local` solo si aún no existe.
- Durante la corrida E2E se detectó que el aserto del ETag esperaba v1.1, mientras el contrato y el interceptor vigentes especifican v1.3. Se actualizó únicamente el comentario y el valor esperado del test; no cambió el producto ni se omitió el caso.

## Verificación

| Gate | Resultado |
|---|---|
| Compose de desarrollo, E2E y producción | `config --quiet` correcto; Redis requiere contraseña en los tres perfiles |
| Redis local, `PING` sin credencial | `NOAUTH Authentication required.` |
| Redis local, `PING` autenticado | `PONG` |
| Persistencia de Redis local | Contenedor sano; sigue montado el volumen nombrado `iwana_redis_data_dev` |
| API Jest | 326 suites; 4,144 tests pasaron, 15 omitidos; sin caché |
| Worker Jest | 18 suites; 146 tests pasaron; sin caché |
| Preflight | `node --test scripts/dev.test.mjs`: 24/24 |
| Typecheck global final | `pnpm typecheck --force`: 8/8 tareas, `Cached: 0` |
| E2E con QA-33 | `$env:API_BASE_URL = 'http://127.0.0.1:3100'; node scripts/e2e-provision-operational.mjs`: 37 pasaron, 0 fallidos, 0 omitidos, 0 sin ejecutar, 0 flaky |
| Higiene del diff | `git diff --check`: correcto |

El test QA-33 de fallo cerrado detuvo el Redis real del stack E2E, comprobó que la API no devolviera 2xx y verificó la recuperación al restaurar Redis. El primer intento no llegó a esa prueba porque falló el aserto obsoleto de ETag; tras actualizarlo a v1.3, el runner completo pasó. El API E2E se levantó en el puerto 3100 para conservar el proceso que ya ocupaba el 3000.

## Redis de desarrollo y credenciales locales

Se recreó únicamente `redis` con este comando:

```powershell
docker compose --env-file .env --env-file .env.development.local --profile development -f docker-compose.yml -f docker-compose.dev.yml up -d --no-deps --force-recreate redis
```

No se ejecutó `down -v`. El volumen nombrado `iwana_redis_data_dev` se conservó. La comprobación posterior dio `NOAUTH` sin credencial y `PONG` con autenticación.

La clave local está en `.env.development.local`, que está ignorado por Git y no está versionado. Para agregarla en una instalación local, ejecutar `bash scripts/generate-secrets.sh`; el script no sobrescribe valores existentes. También se puede generar con `openssl rand -base64 32` y guardar el resultado únicamente como `REDIS_PASSWORD` en `.env.development.local`. No copiar la clave a plantillas ni al informe. Para rotarla, actualizar ese valor y reiniciar Redis y sus clientes (API y worker) con la misma configuración.

Se preservaron los demás cambios ya presentes en el árbol de trabajo. No se limpió ni se modificó ninguna otra rama.
