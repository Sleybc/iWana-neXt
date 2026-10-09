# INFORME — Automatizaciones de Claude Code

**Modo activo:** ejecutor
**Version:** 1.1
**Estado:** Vigente
**Fecha:** 2026-10-08 (**v1.1: 2026-10-09 — cierre de las cinco decisiones abiertas**, ver §9)
**Origen:** analisis `claude-code-setup` (`claude-automation-recommender`) del 2026-10-08; implementacion aprobada por el usuario con 15 recomendaciones.
**Convencion documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md

## 1. Resumen

Se implementaron 5 hooks, 3 servidores MCP de proyecto, 3 skills y 3 subagentes auxiliares para Claude Code. Todo respeta la gobernanza existente: skills en `.agents/skills/`, subagentes en `.claude/agents/` con `pnpm sync:agents`, prompts solo en `docs/prompts/` y solo `pnpm`. El MCP de GitHub no se declaro en el repo por decision del usuario (se usa el conector de claude.ai).

## 2. Decisiones de gobernanza tomadas por el usuario (2026-10-08)

| Decision | Opcion elegida | Efecto |
| --- | --- | --- |
| Donde registrar los hooks | `.claude/settings.json` compartido y versionado | Aplican a todo el equipo que use Claude Code en el repo |
| Rol de solo lectura para `postgres-dev` | Diferir a `sec-eng` | No se creo ningun rol; el servidor queda declarado e inactivo (§6) |
| MCP de GitHub | Conector de claude.ai | Nada en el repo; requiere autorizar el conector del plugin engineering |

## 3. Inventario

### 3.1 Hooks (`.claude/settings.json` + `.claude/hooks/`)

| Hook | Evento | Que hace |
| --- | --- | --- |
| `guard-paths.mjs` | PreToolUse `Edit\|Write\|MultiEdit\|NotebookEdit` | Bloquea `.env` reales (permite `*.example`), `secrets/`, `pnpm-lock.yaml`, `.opencode/agents/`, `.codex/agents/` y `PROMPT-*.md` fuera de `docs/prompts/` |
| `tenant-migration-gate.mjs` | PostToolUse | Para `packages/database/src/migrations/tenant/NNN_*.ts`: exige `down()`, el `import` en `runner.ts` y la clase en `TENANT_MIGRATIONS` |
| `format-file.mjs` | PostToolUse | Prettier sobre el archivo editado en `apps/`, `packages/` o `e2e/`; nunca bloquea |
| `sync-surfaces.mjs` (v1.0: `sync-agents.mjs`) | PostToolUse | Al editar una fuente canónica corre su sincronizador: `.claude/agents/*.md` → `sync-agents`, `.agents/skills/*/SKILL.md` → `sync-skills`, `.agents/mcp/servers.json` → `sync-mcp`; bloquea si falla |
| `doc-audits.mjs` | Stop | Si hay cambios en `docs/` o `AGENTS.md`, corre `audit-doc-locations` y `audit-adr-citations`; respeta `stop_hook_active` |

Los cinco comparten `.claude/hooks/lib/hook-input.mjs` (lectura de stdin, normalizacion de rutas Windows, bloqueo con exit 2). Estan en Node porque Node 24 ya es requisito del repo.

**Limites declarados:** `guard-paths` solo cubre las herramientas de edicion; una escritura via Bash no pasa por el hook. ESLint queda fuera de `format-file` a proposito (reglas type-aware, coste por edicion); sigue en lint-staged y CI.

### 3.2 MCP de proyecto (`.mcp.json`)

| Servidor | Comando | Estado |
| --- | --- | --- |
| `postgres-dev` | `docker run -i --rm crystaldba/postgres-mcp --access-mode=restricted` | Declarado, **inactivo** hasta que exista el rol y la variable `IWANA_MCP_DATABASE_URI` (§6) |
| `playwright` | `cmd /c pnpm dlx @playwright/mcp@0.0.82` | Declarado; requiere aprobacion del servidor en la primera sesion |
| `context7` | `cmd /c pnpm dlx @upstash/context7-mcp@4.1.1` | Declarado; en la app de escritorio ya existia como conector |

`DATABASE_URI` usa `${IWANA_MCP_DATABASE_URI:-}`: sin la variable, solo falla ese servidor y no la lectura de `.mcp.json`. El wrapper `cmd /c` es necesario en Windows nativo; en Linux o macOS el comando es `pnpm` directo. Versiones fijadas a publicaciones de mas de dos semanas.

### 3.3 Skills (`.agents/skills/`)

`iwana-tenant-migration`, `iwana-test-evidence` e `iwana-cierre-fase`. Alta registrada en `INDEX.md` v1.5, `MANIFEST.json` v1.5, `README.md` v1.5 e `INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md` (catalogo 46 → 49).

### 3.4 Subagentes (`.claude/agents/`)

`boundary-reviewer` (readonly), `gate-verifier` y `docs-governance` (readonly), como verificadores auxiliares sin perfil en `docs/roles/`. Registrados en `AGENTS.md` → Superficies activas e `INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md` §10.

### 3.5 Superficies documentales tocadas

`AGENTS.md` (superficies activas: subagentes auxiliares, hooks, `.mcp.json`), `.agents/skills/{INDEX.md,MANIFEST.json,README.md}`, `INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md` y `INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md`.

## 4. Correccion respecto al analisis previo

El analisis del 2026-10-08 afirmaba «70 migraciones tenant, siguiente 071» leyendo solo el inicio de `runner.ts`. El conteo real en disco es **135 migraciones** con numeracion hasta **139**; la siguiente libre hoy es la **140**. El skill `iwana-tenant-migration` no fija el numero: lo calcula del directorio en cada uso.

## 5. Verificacion

### 5.1 Hooks — casos que bloquean y casos que pasan

Arnes en Node que envia por stdin el mismo JSON que Claude Code (`JSON.stringify`, rutas Windows con `\`), con `CLAUDE_PROJECT_DIR=C:\appiw`:

| Hook | Bloquea (exit 2) | Pasa (exit 0) | Resultado |
| --- | --- | --- | --- |
| `guard-paths` | `.env`, `.env.development`, `.env.development.local`, `secrets/db.txt`, `pnpm-lock.yaml`, `.opencode/agents/sr-qa.md`, `.codex/agents/sr-qa.toml`, `.github/prompts/PROMPT-X-v1.0.md` | `.env.example`, `.env.production.example`, `docs/prompts/PROMPT-X-v1.0.md`, `.claude/agents/sr-qa.md`, `apps/api/src/main.ts`, payload sin ruta | 14/14 |
| `tenant-migration-gate` | migracion sin `down()` ni registro; migracion con `down()` sin registro | `070_…` registrada; `runner.ts` | 4/4 |
| `tenant-migration-gate` (barrido) | — | las 135 migraciones reales | 0 falsos positivos |
| `format-file` | — (no bloquea por diseño) | sonda en `apps/api/src/` formateada (`{a:1,b:"dos"}` → `{ a: 1, b: 'dos' };`); sonda en `scripts/` intacta | 4/4 |
| `sync-agents` | agente sin frontmatter → `sync` falla | agente valido regenera; otro archivo no actua; `sync:agents:check` OK | 4/4 |
| `doc-audits` | `PROMPT-*.md` depositado en `docs/informes/` → `audit-doc-locations` bloquea | `stop_hook_active`; `docs/` con cambios y auditorias limpias | 3/3 |

Las sondas temporales se eliminaron tras cada caso; `git status` lo confirmo.

### 5.2 Hooks en vivo

Con `.claude/settings.json` creado, Claude Code cargo los hooks en la misma sesion:

- **Bloqueo real:** un `Write` de `docs/informes/PROMPT-LIVEPROBE-HOOK-v1.0.md` fue rechazado por `guard-paths` («los prompts viven solo en docs/prompts/») y el archivo no llego a existir.
- **Paso real:** todas las escrituras de esta implementacion pasaron el hook; `sync-agents` genero `.opencode/agents/` y `.codex/agents/` de los tres subagentes nuevos antes de correr `pnpm sync:agents` a mano.

### 5.3 Catalogo, agentes y documentacion

- `MANIFEST.core`: 49 skills unicas · 49 directorios con `SKILL.md` · `coreCount` 49 · sin divergencias.
- `pnpm sync:agents:check` → «OK: 11 agentes sincronizados (opencode + codex)».
- `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts` → 1 suite, 6 tests, 6 passed (comando citado por el skill).
- `pnpm audit:doc-locations` y `pnpm audit:adr-citations` → ver §8.

### 5.4 Lo que no se verifico

- **`playwright` y `context7`:** no se arrancaron. Claude Code pide aprobar los servidores de `.mcp.json` al abrir una sesion nueva; la primera ejecucion de `pnpm dlx` descarga el paquete.
- **`postgres-dev`:** no puede arrancar sin el rol y la variable (§6). No se descargo la imagen Docker.

## 6. Encargo a sec-eng — rol de solo lectura para `postgres-dev`

**Estado (v1.1):** **superado**. El usuario decidió crearlo el 2026-10-09; la implementación final está en §9.1 y difiere de esta propuesta (permisos por columna, script solo de dev, credencial por `--env-file`). Se conserva el texto original.

**Estado original:** propuesta, **no ejecutada**. Toca SEC-04 (minimo privilegio).

Los roles actuales son `iwana` (bootstrap), `iwana_app` y `iwana_migrator`; ninguno es de solo lectura. El modo `restricted` de Postgres MCP envuelve las consultas en transacciones de solo lectura, pero no sustituye un rol sin privilegios de escritura.

Propuesta para revisar (solo base de desarrollo, nunca produccion):

```sql
CREATE ROLE iwana_readonly LOGIN PASSWORD :'readonly_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE :"db_name" TO iwana_readonly;
GRANT USAGE ON SCHEMA public TO iwana_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO iwana_readonly;
-- Por cada schema tenant_* (mismo patron de bucle que apply-least-privilege.sql):
--   GRANT USAGE ON SCHEMA <schema> TO iwana_readonly;
--   GRANT SELECT ON ALL TABLES IN SCHEMA <schema> TO iwana_readonly;
```

Preguntas para sec-eng:

1. Si el rol debe excluir tablas con secretos o PII (hashes de contraseña, secretos MFA, `audit_logs`, datos de suscriptores) aunque la base sea de desarrollo (Ley 1581).
2. Si el alta va en `apply-least-privilege.sql` (se reaplica en cada `db:migrate:all` y cubre schemas tenant nuevos) o en un script aparte solo para dev.
3. Donde vive la credencial: la variable `IWANA_MCP_DATABASE_URI` en el entorno del usuario, nunca en el repo.

Con la decision, el usuario define `IWANA_MCP_DATABASE_URI=postgresql://iwana_readonly:<clave>@host.docker.internal:5433/<base_dev>` y el servidor queda operativo.

## 7. Decisiones abiertas

| # | Decision | Responsable |
| --- | --- | --- |
| 1 | Rol `iwana_readonly` (§6) | sec-eng → **cerrada 2026-10-09** (§9.1) |
| 2 | Skills como `/comando`: Claude Code solo los expone desde `.claude/skills/` y `CLAUDE.md` prohibe copiar el catalogo; seguir por lectura documental o generar `.claude/skills/` desde `.agents/skills/` con un sincronizador | AI-EM-ARCH (ADR) → **cerrada 2026-10-09**: sincronizador, ADR-092 (§9.2) |
| 3 | Perfil en `docs/roles/` para los verificadores auxiliares | AI-EM-ARCH / CTO → **cerrada 2026-10-09** (§9.4) |
| 4 | Fuente unica de MCP entre `.mcp.json` y `.opencode/opencode.json` | plat-ops → **cerrada 2026-10-09**: ADR-092 (§9.3) |
| 5 | Autorizar el conector GitHub del plugin engineering en claude.ai | Usuario → **aprobada; pendiente de que el usuario la ejecute** (el OAuth no lo puede iniciar Claude) |

## 8. Estado de gates documentales

Resultados de `pnpm audit:doc-locations` y `pnpm audit:adr-citations` tras escribir este informe: ambos sin hallazgos bloqueantes (exit 0).

## 9. Actualizacion 2026-10-09 — Cierre de las decisiones abiertas

Respuestas del usuario a §7: 1 «si es necesario, créalo» · 2 «genera un sincronizador» · 3, 4 y 5 «sí».

### 9.1 Rol `iwana_readonly` (decisión 1)

| Pieza | Detalle |
| --- | --- |
| `scripts/db/dev-readonly-role.sql` | Idempotente. `LOGIN NOINHERIT CONNECTION LIMIT 3`, `default_transaction_read_only = on`, `statement_timeout = 15s`. `SELECT` **por columna** en `public` y `tenant_*`, excluyendo columnas cuyo nombre casa `password`, `secret`, `token`, `recovery`, `_encrypted$` o `_hash$` (credenciales y PII cifrada o derivada, inventariadas desde entidades y migraciones). |
| `scripts/db/dev-readonly-role.mjs` (`pnpm db:dev:readonly-role`) | Fail-closed: solo modo docker, contenedor `*_dev` y fuera de `NODE_ENV=production`. Reutiliza `scripts/db/lib/tenant-tooling.mjs`. Genera la clave una vez, la reutiliza al re-ejecutar y nunca la imprime. |
| `.claude/mcp-postgres.local.env` | Credencial local, ignorada por git y bloqueada por `guard-paths`. `postgres-dev` la recibe con `docker run --env-file` y comparte la red del contenedor Postgres (`--network container:iwana_postgres_dev`), sin depender de variables de entorno ni del nombre de red de compose. |
| Imagen | `crystaldba/postgres-mcp` fijada por digest `sha256:dbbd3468…`; `--access-mode=restricted`. |

No va en `apply-least-privilege.sql` ni en migraciones: ese script corre también en producción. Tras crear tenants nuevos hay que re-ejecutar `pnpm db:dev:readonly-role`.

**Evidencia:**

- Creación: «iwana_readonly creado (357 relaciones, 4 schemas)». Re-ejecución: «re-sincronizado (357 relaciones, 4 schemas)».
- Conectado como `iwana_readonly` con la misma credencial y consultas `LIMIT 0` (sin leer datos), 7/7: identidad con `read_only=on`; columna permitida `platform_users.id`; `password_hash` y `mfa_secret` → *permission denied*; `CREATE TABLE` y `UPDATE` → *read-only transaction*; `CREATE TABLE` tras `SET default_transaction_read_only = off` → falla igual por privilegios.
- Servidor MCP lanzado con el comando exacto de `.mcp.json`: `initialize` → postgres-mcp 1.6.0; `tools/list` → 9 herramientas; `list_schemas` → 4 schemas de usuario (public + 3 tenant).
- Claude Code conectará `postgres-dev` al **reiniciar la sesión**: al abrir esta falló porque la credencial aún no existía.
- Durante la preparación, el clasificador de permisos bloqueó dos consultas exploratorias al catálogo de la base. No se reintentaron; las columnas sensibles se inventariaron desde el código fuente.

### 9.2 Sincronizador de skills (decisión 2) — ADR-092

`pnpm sync:skills` genera en `.claude/skills/` un **puntero** por skill: frontmatter original y un cuerpo que remite al `SKILL.md` canónico, sin copiar contenido. Actualizados `CLAUDE.md`, `AGENTS.md`, `.agents/skills/README.md` e `INDEX.md`. Evidencia: 49 punteros; Claude Code listó las skills del catálogo en la misma sesión. Las dos de invocación solo manual (`iwana-tenant-migration`, `iwana-cierre-fase`) quedan disponibles como `/comando`.

### 9.3 Fuente única de MCP (decisión 4) — ADR-092

`.agents/mcp/servers.json` es canónico; `pnpm sync:mcp` genera `.mcp.json` y la clave `mcp` de `.opencode/opencode.json`, formateados con el Prettier del repo. Cambios efectivos en OpenCode: `npx` sin versión → `pnpm dlx` con versión fija (`chrome-devtools-mcp@1.10.1`, `@upstash/context7-mcp@4.1.1`, `@playwright/mcp@0.0.82`) y alta de `postgres-dev`. `github` sigue solo en OpenCode; Claude Code usa el conector.

### 9.4 Perfiles de los verificadores auxiliares (decisión 3)

Perfiles en `docs/roles/` (`Perfil_IA_Verificador_Boundaries_v1`, `Perfil_IA_Verificador_Gates_v1`, `Perfil_IA_Auditor_Gobernanza_Documental_v1`), protocolo **v1.6** con la categoría *verificadores auxiliares* (fuera de la RACI y de la red de consulta; el motivo está en el informe de roles §10.3) y subagentes que remiten a su perfil.

### 9.5 Conector GitHub (decisión 5)

Aprobado. La autorización OAuth la hace el usuario en la configuración de conectores de claude.ai; Claude no puede iniciarla.

### 9.6 Superficies tocadas en v1.1

- **Nuevos:** `.agents/mcp/servers.json`, `.claude/skills/` (49, generados), `scripts/sync-skills.mjs`, `scripts/sync-mcp.mjs`, `scripts/lib/generated-surface.mjs`, `scripts/sync-surfaces.test.mjs`, `scripts/db/dev-readonly-role.mjs` y `.sql`, `.claude/hooks/sync-surfaces.mjs` (reemplaza a `sync-agents.mjs`), ADR-092 y tres perfiles.
- **Modificados:** `package.json` (`sync:skills`, `sync:mcp` y sus `:check`, `db:dev:readonly-role`, `test:tooling`), `.github/workflows/ci.yml` (checks de skills y MCP), `.gitignore`, `.claude/settings.json`, `.claude/hooks/guard-paths.mjs` (bloquea `.claude/skills/`, `.mcp.json` y la credencial), `.mcp.json` y `.opencode/opencode.json` (generados), `CLAUDE.md`, `AGENTS.md`, protocolo v1.6, informe de roles v1.8, `.agents/skills/INDEX.md` y `README.md`, y los tres subagentes.

### 9.7 Verificación de v1.1

| Prueba | Resultado |
| --- | --- |
| Hooks, arnés por stdin | `guard-paths` 20/20 · `tenant-migration-gate` 4/4 y barrido de 135 migraciones sin falsos positivos · `format-file` 4/4 · `sync-surfaces` 6/6 más 3 `--check` · `doc-audits` 3/3 |
| `sync-surfaces` en vivo | Al editar los subagentes regeneró `.opencode/` y `.codex/` sin intervención |
| `pnpm test:tooling` | 134 tests, 134 pass, 0 fail, 0 skipped (incluye los 8 de `sync-surfaces.test.mjs`) |
| `sync:agents:check` · `sync:skills:check` · `sync:mcp:check` | 11 agentes · 49 skills · 3 + 5 servidores, todos OK |
| Rol y servidor MCP | §9.1 |
| `audit:doc-locations` · `audit:adr-citations` | 0 bloqueantes; avisos sin variación (3 preexistentes en `.playwright-mcp/`; 142 con 77 ADR indexados) |
| Prettier sobre todo lo nuevo o generado | Sin cambios pendientes |
