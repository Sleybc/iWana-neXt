# INFORME — Automatizaciones de Claude Code

**Modo activo:** ejecutor
**Version:** 1.3
**Estado:** Vigente
**Fecha:** 2026-10-08 (**v1.1: 2026-10-09 — cierre de las cinco decisiones abiertas**, ver §9; **v1.2: 2026-10-09 — segunda pasada: decisiones de guard-bash, Redis, tests de hooks y commit**, ver §10; **v1.3: 2026-10-09 — segunda ola implementada y diagnóstico de CI**, ver §11)
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

## 10. Actualizacion 2026-10-09 (v1.2) — Segunda pasada de `claude-code-setup`

La segunda pasada confirmó implementadas 14 de las 15 recomendaciones (falta autorizar el conector GitHub) y propuso una segunda ola de 9. Tabla interactiva: artefacto «Automatizaciones iWana neXt». Respuestas del usuario a las cuatro decisiones abiertas: 1 «comprueba» · 2, 3 y 4 «sí».

### 10.1 Commit de la primera ola (decisión 4)

`2dbec9c6 chore(ia): hooks, skills, MCP y verificadores de Claude Code (ADR-092)`: 93 archivos, solo superficies IA, separado de la ola MOD11-MOD12 y del trabajo de ADR-074 (P2). lint-staged y commitlint en verde.

### 10.2 `guard-bash` y comportamiento de `ask` (decisión 1)

Prueba en vivo en esta sesión, en modo bypassPermissions, con sondas `echo` inofensivas: `deny` bloqueó el comando; `ask` lo dejó pasar **sin mostrar confirmación** (confirmado por el usuario). Conclusión: un `ask` no protege en bypassPermissions. `guard-bash` niega todo lo que casa y, para lo destructivo pero legítimo, el motivo indica que lo ejecute el usuario en su terminal.

| Niega | Motivo |
| --- | --- |
| `git checkout -b`, `switch -c`, `worktree add`, `git branch <nombre>` | Se trabaja siempre en `main` |
| `--no-verify` | No se saltan husky ni commitlint |
| `>`, `>>`, `tee`, `cp`, `mv` hacia `.env` reales, `secrets/`, lockfile, `.mcp.json`, `.claude/skills/`, `mcp-*.local.env` | Rutas de `guard-paths` |
| `push --force`, `reset --hard`, `clean -f`, `compose down -v`, `volume rm`, `migration(:tenant):revert`, `db:restore` | Destructivo; lo ejecuta el usuario |

Falso positivo corregido el mismo día: el primer intento de escribir esta sección con un heredoc fue bloqueado porque la tabla menciona `git checkout -b`. El hook ahora descarta el cuerpo de los heredocs (texto, no comandos) y conserva la línea que los abre, así que `cat <<EOF > .env` sigue negado. Los patrones son una red, no una frontera de seguridad: un comando ofuscado puede evadirlos.

### 10.3 MCP `redis-dev` de solo lectura (decisión 2)

| Pieza | Detalle |
| --- | --- |
| `scripts/db/dev-redis-readonly-user.mjs` (`pnpm dev:redis-readonly-user`) | Fail-closed: fuera de `NODE_ENV=production` y contenedor `*_dev`. Crea `iwana_readonly` con `reset on ~bull:* resetchannels -@all +@read` más los comandos de conexión del cliente. Autentica como admin con `REDIS_PASSWORD` (exigida tras el ajuste de P2 a ADR-074). Las claves entran por stdin a `redis-cli`, nunca en argv. Se autoverifica: `PING` → `PONG` y `SET bull:…` → `NOPERM`. |
| `.claude/mcp-redis.local.env` | Credencial local, ignorada por git y bloqueada por `guard-paths` y `guard-bash`. |
| `.agents/mcp/servers.json` → `redis-dev` | `mcp/redis` fijada por digest `sha256:e886a7e9…`, red del contenedor `iwana_redis_dev`, `--env-file`. |

**Evidencia:** creación y re-ejecución idempotente en `iwana_redis_dev`. Servidor lanzado con el comando exacto: `initialize` → Redis MCP Server 1.26.0; `tools/list` → 53 herramientas (incluye escrituras); `dbsize` responde; `set` → «no permissions to run the 'set' command». La barrera es el ACL del servidor, no el MCP.

**Dependencia con P2 (ADR-074):** el usuario ACL vive en memoria. Cuando P2 recree `iwana_redis_dev` con `--requirepass`, hay que re-ejecutar `pnpm dev:redis-readonly-user` con `REDIS_PASSWORD` en `.env`. Claude Code conecta `redis-dev` al reiniciar la sesión.

### 10.4 Tests de los hooks (decisión 3)

`scripts/claude-hooks.test.mjs`, incluido en `test:tooling`: caja negra por stdin, con fixtures en un directorio temporal para los hooks que leen el repo o ejecutan scripts (`tenant-migration-gate`, `format-file`, `sync-surfaces`, `doc-audits` con un repo git temporal). 7 tests: `guard-paths`, `guard-bash` (deny, pass y heredocs), `tenant-migration-gate`, `format-file`, `sync-surfaces` y `doc-audits`. `sync-surfaces.test.mjs` suma 2 tests del script de Redis.

### 10.5 Verificación de v1.2

| Prueba | Resultado |
| --- | --- |
| `pnpm test:tooling` | 143 tests, 143 pass, 0 fail, 0 skipped |
| `sync:agents:check` · `sync:skills:check` · `sync:mcp:check` | OK · OK · 4 servidores → `.mcp.json`, 6 → `opencode.json` |
| `guard-bash` en vivo | `deny` bloquea; `ask` no pregunta en bypassPermissions (§10.2); heredoc con texto prohibido pasa |
| `redis-dev` | §10.3 |

### 10.6 Pendiente

- Autorizar el conector GitHub (usuario, claude.ai).
- Segunda ola sin implementar: `rejection-reason-coverage`, `pii-log-guard`, `session-context`, `iwana-matriz-motivos`, `iwana-queue-inspect`, `contract-drift-reviewer`, `e2e-triage`.
- Los cambios de v1.2 quedan sin commitear: `package.json` y `.gitignore` comparten árbol con P2 de ADR-074, en curso.

## 11. Actualizacion 2026-10-09 (v1.3) — Segunda ola implementada

Aprobada por el usuario a partir de la selección de la tabla interactiva (7 de las 8 piezas; el conector GitHub depende de él).

| Pieza | Tipo | Ubicación | Evidencia |
| --- | --- | --- | --- |
| `rejection-reason-coverage` | Hook PostToolUse | `.claude/hooks/rejection-reason-coverage.mjs` | Test: bloquea si un motivo no tiene spec integrada (también cuenta una spec sin commitear) y pasa al completarla. Contra el repo real: exit 0 (4 de 4 motivos cubiertos). |
| `pii-log-guard` | Hook PostToolUse | `.claude/hooks/pii-log-guard.mjs` | Test: bloquea `${subscriber.email}` en un log; deja pasar `${expediente.id}`, specs y archivos fuera de `apps/api` y `apps/worker`. Barrido de todos los `.ts` de `apps/api` y `apps/worker`: 0 avisos. |
| `session-context` | Hook SessionStart | `.claude/hooks/session-context.mjs` | Test con repo temporal y fuera de un repo (nunca falla). En el repo real: rama, commits por delante de origin, 70 rutas sin commitear y plan más reciente. |
| `iwana-matriz-motivos` | Skill | `.agents/skills/iwana-matriz-motivos/SKILL.md` | Registrada en INDEX v1.6 y MANIFEST v1.6; visible como `/comando`. |
| `iwana-queue-inspect` | Skill | `.agents/skills/iwana-queue-inspect/SKILL.md` | Ídem; usa el MCP `redis-dev` o `redis-cli` con la contraseña por stdin (ADR-074). |
| `contract-drift-reviewer` | Subagente | `.claude/agents/contract-drift-reviewer.md` + perfil `Perfil_IA_Revisor_Contratos_v1.md` (AI-CONTRACT-REV) | Alta en un acto según protocolo §9 (v1.7) e informe de roles §11. |
| `e2e-triage` | Subagente | `.claude/agents/e2e-triage.md` + perfil `Perfil_IA_Triador_E2E_v1.md` (AI-E2E-TRIAGE) | Ídem. |

### 11.1 Conector GitHub

`plugin:engineering:github` sigue en `needs_auth` en esta sesión. La CLI `gh` sí está autenticada (cuenta `Sleybc`, permisos `repo`, `workflow`, `read:org`) y se usó para leer CI.

### 11.2 Diagnóstico de CI (run 37919521519, commit `1af90dd8`)

CI de `main` falla desde el 2026-10-06 en tres commits seguidos. Dos causas independientes, ninguna de las superficies IA:

1. **Unit tests (`@iwana/api`): 4 suites, 8 tests.** `6ed0b845` volvió obligatoria `INTERNAL_QUEUE_SIGNING_KEY` en producción y las specs `app.config.production-urls`, `app.config.bootstrap-credential`, `app.module.config` y `app.config.cookie-secure` no la incluyen en su entorno de producción simulado. El árbol de trabajo (P2 de ADR-074, sin commitear) ya las corrige: en local, 4 suites y 58 tests en verde.
2. **E2E operativo R4.1: falla al arrancar.** `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` y `quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z` ya no existen en el registro (`docker manifest inspect` → *no such manifest*; en CI, *unauthorized*). En local funciona solo porque las imágenes están en caché. Requiere decisión de `plat-ops`: fuente alternativa de MinIO o imagen propia.

### 11.3 Verificación de v1.3

| Prueba | Resultado |
| --- | --- |
| `pnpm test:tooling` | 146 tests, 146 pass, 0 fail, 0 skipped |
| `scripts/claude-hooks.test.mjs` | 10 tests, 10 pass |
| `sync:agents:check` · `sync:skills:check` · `sync:mcp:check` | 13 agentes · 51 skills · 4 + 6 servidores, todos OK |
| Catálogo de skills | 51 en `core` = 51 directorios = `coreCount` |
