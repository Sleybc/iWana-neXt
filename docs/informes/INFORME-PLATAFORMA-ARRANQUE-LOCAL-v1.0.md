# Informe de arranque local de plataforma

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-13

## Objetivo

Analizar el monorepo iWana neXt, corregir bloqueos reproducibles de arranque local y ejecutar la plataforma completa.

## Hallazgos y correcciones

| Hallazgo | Causa raiz | Correccion |
| --- | --- | --- |
| PostgreSQL 18 reiniciaba y quedaba `unhealthy` | El volumen seguia montado en `/var/lib/postgresql/data`, ruta incompatible con el layout oficial de PostgreSQL 18 | Se actualizo el mount a `/var/lib/postgresql` sin borrar el volumen existente |
| La API compilaba pero no iniciaba | Los controllers de media importaban `multer`, pero `apps/api/package.json` solo declaraba sus tipos | Se declaro `multer` 2.1.1 como dependencia runtime directa |
| Las migraciones fallaban por autenticacion | El volumen persistido conservaba una credencial anterior | Se sincronizo el rol local con la configuracion vigente sin exponer ni borrar datos |
| `pnpm run dev` fallaba en Windows antes de levantar servicios | `scripts/dev.mjs` asumia que todo comando de Windows terminaba en `.cmd`; `pnpm` necesita wrapper de `cmd.exe`, pero `docker` usa `.exe` | El launcher ahora resuelve binarios reales con `where.exe` y solo usa `cmd.exe` cuando corresponde para `.cmd`/`.bat` |
| `pnpm dev` fallaba con `spawn EFTYPE` al ejecutarse mediante Corepack | `npm_execpath` puede apuntar a `pnpm.cjs`; Windows no puede ejecutarlo directamente como binario | El launcher ejecuta wrappers `.js`/`.cjs`/`.mjs` mediante el runtime Node actual y conserva el shell correcto para `.cmd` |
| El dashboard esperaba varios minutos sin explicar por que la API no respondia | Nest watch permanece vivo con errores TypeScript y el healthcheck descartaba errores de conexion y respuestas HTTP no exitosas | La compilacion inicial falla inmediatamente si reporta errores; el healthcheck usa un deadline total de 60 segundos y muestra el ultimo resultado |
| `pnpm dev` podia marcar `api failed` justo despues de reiniciar el equipo aunque la API terminara arrancando | El deadline del healthcheck empezaba antes de terminar la compilacion; un arranque frio consumia parte sustancial de esa ventana antes de que Nest empezara a bootear realmente | El launcher ahora detecta `Found N errors` incluso si la linea llega fragmentada, y el deadline de readiness empieza solo cuando la compilacion termina |

## Evidencia de ejecucion

- `@iwana/shared` y `@iwana/db` compilaron correctamente.
- Migraciones publicas: sin migraciones pendientes.
- Migraciones tenant: ejecutadas correctamente para 0 tenants.
- `pnpm run dev` completo avanzo por liberacion de puertos, Docker, compilacion, migraciones, API, web, portal y worker.
- API health: `GET /api/v1/health` respondio `200` con DB y Redis en estado `ok`.
- Web `:3001`, portal `:3002` y proxy `:8080` respondieron `200`.
- Worker NestJS inicio correctamente y registro sus jobs repetibles.
- PostgreSQL, Redis, MinIO y Nginx reportaron estado saludable.
- Verificacion del 2026-06-13: API, web, portal y worker quedaron disponibles en 35,2 segundos.
- `pnpm test:tooling`: 7 pruebas aprobadas, incluidas regresiones para `pnpm.cjs`, errores de compilacion y diagnostico del healthcheck.
- `pnpm --filter @iwana/api typecheck`: aprobado.
- Verificacion del 2026-06-13 posterior al hotfix raiz: `pnpm dev` completo quedo listo en 45,7 segundos con API healthy despues de 5 intentos, sin timeout falso del dashboard.

## Referencias

- `AGENTS.md`
- `docs/prds/Stack_Tecnologico.md`
- `docker-compose.yml`
- `apps/api/package.json`
- `scripts/dev.mjs`
- `scripts/dev.test.mjs`
