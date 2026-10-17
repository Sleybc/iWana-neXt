# INFORME — MCP dev (`postgres-dev` / `redis-dev`) en OpenCode: causa raíz y corrección

Fecha: 2026-10-15. Alcance: solo desarrollo local. Sin PII ni credenciales.

## 1. Síntoma

OpenCode mostraba `postgres-dev` y `redis-dev` en `Error` mientras `playwright`
seguía `Connected`. El primer error (sesión actual, 11:49 UTC) fue Docker Desktop
detenido: `docker run` (proceso del MCP) salía con código 1 al no existir el pipe
`dockerDesktopLinuxEngine`. Tras arrancar Docker, el panel seguía en `Error`
(estado en caché: OpenCode no había reintentado desde las 11:49).

## 2. Causa raíz (dos capas)

1. **Docker detenido.** `docker context show` → `desktop-linux`,
   `com.docker.service` en `Stopped`, sin pipes `docker_engine` ni
   `dockerDesktopLinuxEngine`. Afectaba a ambos MCP porque ambos son
   `docker run ...` (`--network container:iwana_*_dev --env-file
   .claude/mcp-*.local.env`, fuente canónica `.agents/mcp/servers.json`,
   `pnpm sync:mcp:check` → OK, sin drift).
2. **`postgres-dev`: `CONNECTION LIMIT 3` saturado.** El rol `iwana_readonly`
   tenía límite 3 (diseñado para un solo cliente) y ya había 3 backends `idle`
   ocupándolo; el handshake manual devolvía `FATAL: too many connections for
   role "iwana_readonly"`. Concurren Claude Code + OpenCode + probes, y cada
   `postgres-mcp` abre su propio pool. `redis-dev` no tenía este problema
   (su handshake `initialize` respondía `Redis MCP Server 1.26.0`).

## 3. Corrección

- `scripts/db/dev-readonly-role.sql:14`: `CONNECTION LIMIT 3` → `10`
  (comentario con fecha y motivo). Solo dev; no toca `default_transaction_read_only`,
  `statement_timeout` ni el `SELECT` por columna sin credenciales/PII.
- Aplicado con `pnpm db:dev:readonly-role` (reutiliza la contraseña existente,
  `518 relaciones, 5 schemas`, `rolconnlimit = 10` verificado en `pg_roles`).
- `redis-dev`: re-sincronizado con `pnpm dev:redis-readonly-user`
  (contenedor recreado → ACL en memoria perdida); verificado `PONG` + `SET` → `NOPERM`.
- No se mataron backends `idle`: con límite 10 hay 7 slots libres y se evita
  romper pools vivos de otras sesiones.

## 4. Verificación

- `postgres-mcp 1.6.0`: `initialize` → `result.protocolVersion 2024-11-05` → OK.
- `Redis MCP Server 1.26.0`: `initialize` → OK.
- Imágenes pineadas presentes localmente; `pnpm sync:mcp:check` → OK.

## 5. Acción pendiente del usuario

Reconectar los MCP en OpenCode (reconnect de `postgres-dev`/`redis-dev` o
reiniciar la sesión): el estado `Error` visible es el del intento de las 11:49,
anterior a la corrección. No se reinicia aquí para no cortar esta sesión.

## 6. Deriva documental conocida

`docs/informes/INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md:150` describe
`CONNECTION LIMIT 3`; queda como foto histórica de su versión. Este informe la
sustituye en lo vigente (límite 10).

## 7. Revisión tras reinicio de sesión (misma tarde)

- El panel seguía en `Error` tras el reinicio porque el estado fallido vive en
  el **background service** (`opencode service status` → mismo `run 52480bd8`),
  que no reintentó ningún MCP (cero `mcp transport error` en log tras las 11:49;
  `opencode mcp list` repetía verbatim el error docker-down). Vía soportada sin
  perder la sesión: `/mcps` en el TUI → reconnect por servidor.
- Limpieza: 3 contenedores de sondas manuales (`stupefied_murdock`,
  `great_black`, `relaxed_ramanujan`) detenidos; solo queda el stack `iwana_*`.
- Migración estructural a forma nativa V2 (auditoría contra
  `https://opencode.ai/v2/docs/mcp-servers`): `.agents/mcp/servers.json` admite
  `timeout` (`{ startup, catalog, execution }` en ms) y `oauth: false`;
  `scripts/sync-mcp.mjs` emite `mcp.servers` + `disabled: false` + passthrough de
  ambos; `postgres-dev`/`redis-dev` con `startup: 120000`, `github` con
  `oauth: false`. `.mcp.json` (Claude) sin cambios. Tests
  `scripts/sync-surfaces.test.mjs`: 12/12 en verde.
- Verificación viva en sesión: `postgres-dev.list_schemas` devuelve filas reales
  y `redis-dev.dbsize` responde (210968 claves). Ambos MCP, conectados.
