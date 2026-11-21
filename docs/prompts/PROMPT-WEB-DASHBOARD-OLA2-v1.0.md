# PROMPT — WEB-DASHBOARD · Ola 2 (`/health` mínimo, índices y pruebas del dashboard)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Etapa:** 4 (G4 emitido, contrafirma pendiente de cada receptor)
**Precondición:** G0-3 de [INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md](../informes/INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md) §4 — ✅ aprobado por el CTO el 2026-11-21 en el chat de la sesión de orquestación. 2C exige además el G6 de la Ola 1.
**Plan:** [2026-11-21-web-dashboard-auditoria-remediacion.md](../plans/2026-11-21-web-dashboard-auditoria-remediacion.md)

## Contrato congelado — `PublicHealth` v1.0

- `GET /api/v1/health`, `@Public()`. Respuesta sin envelope: `{ status: 'ok' | 'degraded'; db: 'ok' | 'error'; redis: 'ok' | 'error'; timestamp: string }`.
  - HTTP 200 si `db` y `redis` son `ok`; **503** con el mismo cuerpo si alguno falla (H-1).
  - Sin `relay` ni ninguna otra telemetría (H-2). El tipo va en `packages/shared/src/dto/` y lo reexporta `index.ts`.
- La telemetría del relay ya tiene ruta con guards: `GET /tasks/execution-orders/health/relay` (`e2e/tests/api/execution-orders-operational.spec.ts:1785`). No se crea otra.
- `HealthModule` deja de importar `TasksModule` (H-3).

## §A — sr-backend: `/health` mínimo, índices y 401 (H-1, H-2, H-3, E-4, V-2)

1. Reducir `health.controller.ts` al contrato y devolver 503 con `ServiceUnavailableException` o `res.status`; actualizar `health.controller.spec.ts` (200, 503 por db, 503 por redis, ausencia de `relay`).
2. Migración del schema public (`database-migration`): índice en `public.tenants (status)` y en `platform_audit_logs (created_at, id)`. Up/down simétricos; `EXPLAIN` antes y después en el reporte.
3. V-2: `POST /auth/refresh` sin cookie responde 401, con prueba.
4. Docker: el healthcheck de `docker-compose.prod.yml:207` (`wget -qO-`) ya falla con 503; verificarlo y anotarlo.

**Restricción de secuencia:** no tocar `modules/tenant` (lo cerró 1A). **Fuera de alcance:** `apps/web`, nginx.

## §B — plat-ops: `limit_req` para `/health` (H-2)

1. En `nginx/nginx.prod.conf` (`location = /health`, líneas 100 y 224): `limit_req_zone` por IP para `/health` y `limit_req` con `burst` pequeño y `nodelay`; 429 al exceder.
2. `nginx -t` en el contenedor como evidencia.

**Fuera de alcance:** el resto de la configuración de nginx.

## §C — sr-qa: `DashboardClient.spec` (Q-2 resto, Q-3)

1. Partir el test que valida 9 criterios en tests de un criterio cada uno; endurecer aserciones débiles; dejar de asertar clases de Tailwind.
2. Cubrir el reintento real y los tramos de `formatRelativeDate`.
3. No cambiar código de producción. Si una prueba exige cambiarlo, `[BLOQUEO]`.

## §D — fe-platform: consumidor web de `/health`

1. `apps/web/src/lib/api-client.ts:543` (`HealthStatusResponse`): usar el tipo compartido `PublicHealth` y quitar `relay`. Tratar el 503 como respuesta de salud (`degraded`), no como error de red.
2. Ajustar `e2e/tests/helpers/web-api-mocks.ts:444` (mock sin `relay`) en coordinación con §C.

## Paso de cierre (stop/go)

- `pnpm --filter @iwana/shared --filter @iwana/api --filter @iwana/web typecheck lint test` con conteo real y `Cached: 0`; E2E de `playwright.web.config.ts`.
- `boundary-reviewer` sobre §A; `test-change-reviewer` sobre §C y specs ajustadas.
- G6 y commit local por bloque, sin push (la migración solo crea índices: no entra en la excepción de ADR-107 D2).
