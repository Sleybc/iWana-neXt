# RUNBOOK — Least privilege PostgreSQL (SEC-04)

**Tipo:** Runbook operativo  
**Módulo:** TRANSVERSAL — Base de datos / auditoría  
**Versión:** 1.0  
**Fecha:** 2026-07-19  
**Autor:** AI-PLAT-OPS  
**Referencias:** migraciones `014` / `075` (inmutabilidad audit) · INFORME remediación SEC-04  
**Gate:** implementación de plataforma; **no** auto-aprueba G-SEC (revisión AI-SEC-ENG)

---

## Propósito

Separar el rol de runtime de la API/worker del ownership de tablas de auditoría, de modo que un compromiso de la app **no** pueda `DROP TRIGGER` sobre `trg_*_audit_*_immutable`.

| Rol | Nombre por defecto | Uso |
| --- | --- | --- |
| Bootstrap | `iwana` (`POSTGRES_USER` / `DB_USER` histórico) | Superusuario del volumen Docker; solo admin/init. **No** usar como usuario de API en staging/prod. |
| Migrator | `iwana_migrator` (`DB_MIGRATOR_USER`) | Dueño de `platform_audit_logs` / `audit_logs`, función `reject_audit_mutation`, triggers inmutables; DDL de migraciones. |
| App | `iwana_app` (`DB_APP_USER`) | Runtime API/worker: DML de negocio, `INSERT`/`SELECT` en audit; **sin** ownership de audit; **sin** permiso efectivo para `DROP TRIGGER` en audit. |

Variables alineadas al repo: se mantienen `DB_USER` / `DB_PASSWORD` para el proceso que usa TypeORM hoy. El split se activa de forma **opt-in** para no romper `pnpm dev` en volúmenes ya existentes.

---

## Artefactos

| Ruta | Función |
| --- | --- |
| `docker/postgres/init/01-create-roles.sh` | Crea roles en **primer** init del volumen Postgres. |
| `docker/postgres/init/02-audit-least-privilege.sql` | Grants + event trigger de reasignación de ownership de tablas audit. |
| `scripts/db/apply-least-privilege.sql` | Idempotente para volúmenes **ya** inicializados (un solo usuario). |
| `scripts/db/verify-app-cannot-drop-audit-trigger.sql` | Prueba local de que `iwana_app` no puede dropear el trigger. |

`docker-compose.yml` monta `docker/postgres/init` en `/docker-entrypoint-initdb.d` y pasa `DB_APP_*` / `DB_MIGRATOR_*`.

---

## Trade-off `pnpm dev` (importante)

| Modo | Comportamiento |
| --- | --- |
| **Por defecto (compat)** | `DB_USER=iwana` (bootstrap). `pnpm dev` y migraciones siguen igual. Los roles `iwana_app` / `iwana_migrator` se crean en volúmenes nuevos (init) o tras `apply-least-privilege.sql`, pero la app **no** los usa hasta que cambies env. |
| **SEC-04 estricto (opt-in)** | Tras apply: migraciones/CLI y DDL de provisioning usan `DB_MIGRATOR_USER` (cableado en `@iwana/db` + worker). API/worker TypeORM con `DB_USER=iwana_app`. |

**Cableado SR-FULL (2026-07-19):** `resolveMigrationDbCredentials()` en `packages/database` — data-source CLI (`pnpm db:migrate:all`, tenant migrate/revert/seed) y el pool DDL + DataSource de migraciones del `TenantProvisioningProcessor` prefieren `DB_MIGRATOR_*` cuando `DB_MIGRATOR_USER` está definido; si no, fallback a `DB_USER`/`DB_PASSWORD` (compat `pnpm dev`). Runtime Nest TypeORM **no** cambia: sigue `DB_USER`.

**Residuales:** el event trigger `trg_reassign_audit_owner` sigue como red de seguridad si algún DDL corre sin migrator. El bootstrap `POSTGRES_USER` sigue siendo superuser (break-glass). Quien conecte como `iwana_migrator` también puede dropear triggers. El control SEC-04 apunta al rol de runtime comprometido (`iwana_app`), no al DBA. En producción, `migrationsRun: true` en la API sigue autenticando como `DB_USER` — preferir CLI migrator en despliegues estrictos.

**CI:** no se cambia el servicio Postgres `test` del workflow. Un cambio forzado a `iwana_app` en CI sin grants rompería migraciones — **no** se hace aquí.

---

## Migración desde “un solo superuser”

Volumen local ya existente (`DB_USER=iwana`):

```bash
# 1) Asegurar contenedor sano
docker compose ps postgres

# 2) Aplicar roles + ownership audit (idempotente)
#    Sustituye contraseñas via variables del entorno del contenedor o -v de psql.
docker exec -i iwana_postgres_dev \
  psql -U "${DB_USER:-iwana}" -d "${DB_NAME:-dbiw}" \
  < scripts/db/apply-least-privilege.sql
```

El script usa por defecto:

- app: `iwana_app` / password = la del rol bootstrap si no pasas variables  
- migrator: `iwana_migrator` / misma convención  

Para passwords distintos en local, exporta antes del `psql` (sesión interactiva) o edita el bloque `\\set` al inicio del SQL.

Luego, opt-in en `.env` no versionado:

```dotenv
# Runtime API/worker (SEC-04)
DB_USER=iwana_app
DB_PASSWORD=<password_app>

# Migraciones / provisioning DDL (cableado en @iwana/db + worker)
DB_MIGRATOR_USER=iwana_migrator
DB_MIGRATOR_PASSWORD=<password_migrator>
DB_APP_USER=iwana_app
DB_APP_PASSWORD=<password_app>
```

Probar migraciones con migrator sin tocar el runtime:

```bash
DB_MIGRATOR_USER=iwana_migrator DB_MIGRATOR_PASSWORD=<pass> pnpm db:migrate:all
# Sin esas vars: mismo comportamiento histórico (DB_USER)
pnpm db:migrate:all
```

PgBouncer local (`edoburu/pgbouncer`) hoy autentica el `DB_USER` del compose. Las apps del monorepo apuntan por defecto al puerto directo de Postgres (`DB_PORT`, p. ej. 5433), no al pool — el split de roles no exige multi-user en pgbouncer para el flujo `pnpm dev` actual. Si más adelante el runtime pasa por 6433 con varios roles, montar `userlist.txt` generado (nunca commitear passwords).

---

## Cómo probar en local que la app no puede DROP TRIGGER

Prerrequisitos: migraciones `014`/`075` aplicadas; `apply-least-privilege.sql` ejecutado; roles creados.

```bash
docker exec -i iwana_postgres_dev \
  psql -U iwana -d dbiw \
  < scripts/db/verify-app-cannot-drop-audit-trigger.sql
```

Resultado esperado:

- Conexión/`SET ROLE` como `iwana_app` OK.
- `DROP TRIGGER trg_platform_audit_logs_immutable ...` → error del tipo *must be owner of table* / *permission denied*.
- El script marca el caso como PASS si captura ese fallo; FAIL si el DROP tiene éxito.

Comprobación manual equivalente:

```sql
SET ROLE iwana_app;
DROP TRIGGER trg_platform_audit_logs_immutable ON public.platform_audit_logs;
-- debe fallar
```

---

## Handoff AI-SR-FULL / AI-DATA-ENG

**Cableado de credenciales (SR-FULL, 2026-07-19): hecho.** Ver `resolveMigrationDbCredentials` en `packages/database/src/db-credentials.ts`.

**Migración pública 015 (2026-07-19): hecho.** `packages/database/src/migrations/public/015_audit_owner_least_privilege.ts`:

1. Asume roles ya creados por ops.
2. `ALTER TABLE ... OWNER TO iwana_migrator` + `ALTER FUNCTION public.reject_audit_mutation() OWNER TO iwana_migrator`.
3. Revoca privilegios destructivos al rol app; grant `SELECT, INSERT`.
4. Si `iwana_migrator` no existe → no-op (NOTICE), no falla CI.

El SQL de ops sigue siendo la fuente para **crear** roles en lab; la migración evita deriva de ownership.

---

## Staging / producción

1. Crear roles con passwords distintos (secrets manager); nunca igualar app = migrator = bootstrap.
2. `POSTGRES_USER` / superuser solo en break-glass.
3. API y worker: solo `iwana_app`.
4. Migraciones y jobs de mantenimiento audit (`SET LOCAL iwana.audit_maintenance`): solo `iwana_migrator`.
5. Go de cambio de credenciales: ventana + rollback (revertir `DB_USER` al bootstrap solo en emergencia, no como estado estable).

---

## Nota para AI-SEC-ENG

Controles implementados en infra/SQL de ops. Pedir re-review: ownership audit, event trigger, ausencia de `DROP TRIGGER` por rol app, y que CI/prod no usen el superuser como runtime.
