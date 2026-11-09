# SPEC — R7: la purga de tenants debe poder borrar el esquema con el rol de producción

**Versión:** 1.0
**Estado:** Propuesto — revisada por AI-SEC-ENG el 2026-11-09 (GO con condiciones, incorporadas en §10). Pendiente del G0 del CTO. No se implementa nada antes del G0.
**Fecha:** 2026-11-09
**Prioridad:** P1
**Modo activo:** Triage de solo lectura (AI-PLAT-OPS)
**Autor:** AI-PLAT-OPS · **Revisión:** AI-SEC-ENG
**Módulos:** MOD01 Tenants / Plataforma · worker `tenant-schema-purge` · roles de base (SEC-04)
**Relacionado:** [ADR-033](../adrs/ADR-033-Ciclo-Vida-Tenant-Purga-Diferida-Limites-Nullable.md) (purga diferida, 30 días) · [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) (iWana es Encargado; el tenant es el Responsable) · [RUNBOOK-DB-LEAST-PRIVILEGE-v1.0](../runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md) (SEC-04) · [Spec DT-4](./2026-11-09-plat-ops-dt4-aprovisionamiento-tenant-marcado.md) §6 R7
**Destinatario de ejecución (tras G0):** AI-SR-FULL (R) · AI-SR-QA (pruebas) · AI-PLAT-OPS (roles, Compose, CI, runbook) · AI-SEC-ENG (C) · AI-EM-ARCH (A)

---

## 1. Problema

ADR-033 promete que un tenant en `MARKED_FOR_DELETION` se purga físicamente al vencer la retención de 30 días. La purga programada (`tenant-schema-purge`, cron `30 3 * * *` en `apps/worker/src/services/scheduler.service.ts:46-53`) nunca ha podido borrar un esquema:

| # | Archivo:línea | Qué hace |
| --- | --- | --- |
| 1 | `apps/worker/src/processors/tenant-schema-purge.processor.ts:33-41` | Abre un `Pool` propio con `DB_USER`, que es `iwana_app` en `.env`, en `docker-compose.yml:155` y en `worker-prod` (`docker-compose.prod.yml:329`). |
| 2 | `apps/worker/src/processors/tenant-schema-purge.processor.ts:109` | Ejecuta `DROP SCHEMA IF EXISTS "<schema>" CASCADE`. PostgreSQL solo permite `DROP SCHEMA` al dueño del esquema, a un miembro de su rol dueño o a un superusuario. |
| 3 | `apps/worker/src/processors/tenant-provisioning.processor.ts:82-90` | El aprovisionamiento crea el esquema con `resolveMigrationDbCredentials()`, es decir, como `iwana_migrator`. Ese rol queda como dueño. |
| 4 | `apps/worker/src/processors/tenant-schema-purge.processor.ts:119-121` | Ante el error `must be owner of schema` hace `ROLLBACK` y relanza: el tenant sigue marcado y la próxima noche falla igual. |

Con cualquier tenant que tenga esquema, la purga falla siempre. El defecto no hace ruido: el job falla en BullMQ y nadie lo vigila.

### 1.1 Diagnóstico en solo lectura sobre `dbiw` (2026-11-09)

Consultas con `iwana_app` y `default_transaction_read_only=on`. No se cambió ningún permiso.

| Hecho | Resultado |
| --- | --- |
| Roles | `iwana_app` e `iwana_migrator`: `NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS INHERIT LOGIN`. `iwana` es el superusuario de bootstrap. `iwana_readonly` es el rol del MCP. |
| Membresías entre roles `iwana%` | Ninguna (`pg_auth_members` vacío). `pg_has_role('iwana_app','iwana_migrator','MEMBER') = false`. |
| Dueño de los esquemas `tenant_%` | `iwana_migrator` en los **141** (el triage de DT-4 contó 132; las pruebas han creado más desde entonces). |
| Dueño de los objetos dentro de esos esquemas | `iwana_migrator` en todos: 20 541 tablas, 70 095 índices, 163 secuencias, 1 374 funciones y 62 048 tipos. |
| `public.tenants` | Dueño `iwana_migrator`. `iwana_app` tiene `INSERT`, `UPDATE` y `DELETE`, incluida la columna `schema_name`. Índice único `uq_tenants_schema_name`. Sin triggers. No hay FK que apunte a la tabla. |
| `public.platform_audit_logs` | Dueño `iwana_migrator`, trigger `trg_platform_audit_logs_immutable` (`BEFORE DELETE OR UPDATE`). `iwana_app` tiene `INSERT`, incluida la columna `created_at`. |
| Event triggers | Solo `trg_reassign_audit_owner` (`ddl_command_end`, `CREATE TABLE`/`ALTER TABLE`). No hay `sql_drop` que bloquee un `DROP SCHEMA`. |
| `CREATE` sobre la base | `iwana_app` no; `iwana_migrator` sí. |
| Tenants marcados | 100, todos con esquema y `deleted_at` entre el 2026-11-01 y el 2026-11-09. Ninguno ha vencido la retención de 30 días, de modo que en `dbiw` el fallo aún no se ha manifestado: se manifestará el 2026-12-01 con el primero. |
| Purgas registradas | Un solo par `TENANT_PURGE_STARTED`/`COMPLETED`, manual (`request_id manual:tenant-schema-purge`, `purgedBy: manual-user-order`, 2026-11-03). El worker nunca completó una purga. |
| Esquema huérfano | `tenant_privacy_requests_91f9d90eb7` existe sin fila en `public.tenants`. La purga, que parte de `public.tenants`, nunca lo verá (§8, R7-c). |

En la base tipo CI `iwana_it_g7_dt4_20261109`, el triage de DT-4 reprodujo el `DROP SCHEMA` como `iwana_app` y obtuvo `must be owner of schema`.

### 1.2 Fuentes del modelo de roles en el repo

| Archivo | Qué fija |
| --- | --- |
| `docker/postgres/init/01-create-roles.sh:58-124` | Crea `iwana_app` e `iwana_migrator` sin membresía cruzada. Solo el migrator tiene `CREATE` en la base y en `public`. Al final falla si alguno tiene `SUPERUSER`, `CREATEROLE` o `BYPASSRLS` (GSEC-N1). |
| `docker/postgres/init/02-audit-least-privilege.sql` | Event trigger que reasigna a `iwana_migrator` la propiedad de `platform_audit_logs` y `audit_logs`. |
| `scripts/db/apply-least-privilege.sql` | Versión idempotente para volúmenes ya inicializados: propiedad del DDL al migrator y DML de negocio a la app. |
| `packages/database/src/migrations/tenant/111_harden_audit_maintenance_guard.ts` y `public/024_*` | La escotilla `iwana.audit_maintenance` exige pertenecer a `iwana_migrator`. |
| `docs/runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md:15-21` | Objetivo de SEC-04: que un `iwana_app` comprometido **no** pueda destruir la auditoría. |
| `.github/workflows/ci.yml:331-343` | CI usa `DB_USER=iwana_app` y `DB_MIGRATOR_USER=iwana_migrator`; el bootstrap es `iwana`. Una integrada del worker reproduce el modelo de producción. |

El modelo es correcto. El fallo está en el worker: ejecuta DDL destructivo con el rol que SEC-04 diseñó para no tenerlo.

### 1.3 Por qué importa

- **Ley 1581 y ADR-094.** iWana es Encargado. Al terminar el contrato con un ISP, el Encargado debe suprimir o devolver los datos según las instrucciones del Responsable. Hoy los datos personales de los suscriptores de un ISP dado de baja se conservan indefinidamente en su esquema, contra lo que promete ADR-033.
- **Ocupación.** Cada esquema conserva unas 150 tablas y 500 índices. Los tenants marcados se acumulan sin límite.
- **Señal falsa.** El estado `MARKED_FOR_DELETION` y la consola de plataforma dan a entender que la baja tiene fecha de borrado. No la tiene.

### 1.4 Hallazgo adicional en el procesador actual (latente)

`tenant-schema-purge.processor.ts:107-115` hace `DROP SCHEMA` **antes** de comprobar el estado: el `DELETE ... WHERE status = 'MARKED_FOR_DELETION'` llega después y no bloquea la fila. Si la API reactiva el tenant entre el `SELECT` inicial y el `DROP`, el `DELETE` afecta cero filas, la transacción hace `COMMIT` y queda un tenant `ACTIVE` sin esquema. Hoy no ocurre porque el `DROP` falla siempre. En cuanto la purga funcione, ocurrirá. La corrección lo cubre (§3.2, paso 2).

---

## 2. Alcance

**Dentro:**

- Que la purga programada borre el esquema y la fila de un tenant marcado y vencido, con la configuración de producción del worker.
- Una guarda en la base que impida retrasar artificialmente la marca de borrado (reloj de retención honesto, §3.3).
- Pruebas, incluida una integrada que hoy falla (§5).
- Alta del rol nuevo en el init de Docker, en el script para volúmenes existentes, en Compose, en CI y en el runbook.
- Plan de despliegue para G7 (§7).

**Fuera:**

- `tenant_iwana`: la función lo excluye de forma explícita y nada en esta spec lo modifica.
- Cambiar roles en cualquier base durante la redacción o la revisión. Todo cambio de roles ocurre después del G0, por migración o por script versionado.
- Purga de esquemas huérfanos, copias de seguridad que contengan el esquema purgado y exportación previa al Responsable (§8).
- La alerta operativa sobre jobs fallidos: se deja como requisito (§3.5) pero su tablero vive en el trabajo de observabilidad de G7.

---

## 3. Corrección propuesta

### 3.1 Alternativas evaluadas por mínimo privilegio

Notación: «poder del conector» es lo que puede hacer quien obtenga la credencial que usa la purga.

| # | Alternativa | Poder del conector | Cambia SEC-04 | Coste | Veredicto |
| --- | --- | --- | --- | --- | --- |
| A | Que la purga use `resolveMigrationDbCredentials()`, igual que el aprovisionamiento. | Todo el poder del migrator: DDL sobre todos los esquemas, `DROP TRIGGER` sobre la auditoría y la escotilla `iwana.audit_maintenance`. | No | Mínimo: unas 5 líneas. `worker-prod` ya recibe `DB_MIGRATOR_*` (`docker-compose.prod.yml:332-333`). | Viable como contingencia, no como solución. Un error en el SQL de la purga tiene el radio del migrator y nada en la base impone las reglas de elegibilidad. |
| B | Hacer a `iwana_app` miembro de `iwana_migrator`. | El de la API y el worker en tiempo de ejecución sube al del migrator. | **Sí, lo anula** | Mínimo | **Rechazada.** Deshace SEC-04: un `iwana_app` comprometido podría desactivar la inmutabilidad de la auditoría. |
| C | Hacer a `iwana_app` dueño de los esquemas tenant. | `iwana_app` podría hacer `DROP` de cualquier esquema y de la auditoría que contiene. | **Sí, lo anula** | Alto: reasignar 141 esquemas | **Rechazada** por la misma razón. |
| D | Proceso separado con el migrator (contenedor de una sola ejecución, como `migrator-prod`, lanzado por un cron del host). | Igual que A, pero fuera del worker. | No | Medio: cron del host, despliegue y supervisión propios, fuera de BullMQ. | **No recomendada.** El worker ya guarda la credencial del migrator, así que separar el proceso no reduce el riesgo. Además saca un job del modelo de ADR-020 y agrega una pieza que nadie vigila. |
| E | Rol de purga que recibe la propiedad del esquema al marcarlo (el migrator ejecuta `ALTER SCHEMA ... OWNER TO iwana_purger` al marcar y lo devuelve al reactivar). | Solo sobre los esquemas marcados, pero con `DROP` libre e inmediato sobre ellos, sin esperar la retención. | Parcial | Alto: el marcado lo hace la API (`iwana_app`), que no puede hacer `ALTER OWNER`; haría falta otro job con migrator, y una reactivación que falle a medias deja la propiedad dividida. | No recomendada: muchas piezas y no impone la retención. |
| F | Función `SECURITY DEFINER` acotada, propiedad de `iwana_migrator`, que solo puede ejecutar un rol de conexión dedicado, `iwana_purger`. | Ejecutar **una** función que, del lado de la base, comprueba estado, retención mínima, nombre y dueño del esquema y exclusión de `tenant_iwana`. Sin otro privilegio. | No: lo extiende con un rol | Medio: una migración pública, un rol y una variable de entorno | **Recomendada** (§3.2). |
| F′ | Igual que F, pero con `EXECUTE` concedido a `iwana_app` en lugar de a un rol dedicado. | Cualquier proceso con `iwana_app`, incluida la API expuesta a internet, podría invocar la purga. | No | Menor que F: sin credencial nueva | No recomendada: amplía la superficie de la API, que no necesita ese poder. Queda como plan B si el CTO no quiere otro rol (D-1). |

**Lo que ninguna alternativa resuelve sola.** Todas eligen el tenant según `public.tenants`, y `iwana_app` puede hacer `UPDATE` de `status` y `deleted_at` (§1.1). Una API comprometida podría marcar cualquier tenant con una fecha de hace 31 días y la purga lo borraría esa misma noche, con la auditoría de su esquema. Hoy no puede: SEC-04 le impide destruir la auditoría. **Arreglar la purga abre ese camino**, y por eso F incluye un reloj de retención honesto (§3.3): una API comprometida puede marcar un tenant, pero no adelantar su purga, y deja 30 días para detectarlo y revertirlo.

### 3.2 Recomendación: función `SECURITY DEFINER` y rol `iwana_purger` (alternativa F)

**Migración pública nueva** `packages/database/src/migrations/public/029_tenant_schema_purge_definer.ts`, con `up` y `down` simétricos y registrada en `index.ts`:

1. **Función** `public.iwana_purge_tenant_schema(p_tenant_id uuid, p_min_retention_days int) RETURNS text`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp` (`pg_temp` explícito y al final), `SET lock_timeout` y `SET statement_timeout` acotados, dueño `iwana_migrator`. Todo objeto se califica con su esquema. `REVOKE ALL ... FROM PUBLIC`. Pasos dentro de una transacción:
   1. `pg_try_advisory_xact_lock(43, hashtext(p_tenant_id::text))`: el lock es por **id**, no por el nombre leído sin bloquear (P2-3 de AI-SEC-ENG). Si no lo obtiene, devuelve `'SKIPPED_LOCKED'`. Reemplaza el lock de sesión del procesador, que hoy depende de un `finally` en Node.
   2. `SELECT ... FROM public.tenants WHERE id = p_tenant_id FOR UPDATE NOWAIT`. Bloquea la fila antes del `DROP` y cierra la carrera de §1.4. Si la fila no existe, devuelve `'SKIPPED_GONE'`; si está bloqueada, `'SKIPPED_LOCKED'`. Todas las comprobaciones siguientes leen la fila **ya bloqueada**.
   3. Comprueba, en este orden, y si alguna falla lanza `RAISE EXCEPTION` con un `ERRCODE` propio (clase `P0001`, mensaje `TENANT_PURGE_<MOTIVO>` sin datos personales):
      - `status = 'MARKED_FOR_DELETION'` y `deleted_at IS NOT NULL` → si no, `NOT_MARKED`;
      - `deleted_at <= now() - make_interval(days => GREATEST(p_min_retention_days, 30))` → si no, `RETENTION_NOT_MET`. **El piso de 30 días está en la base**: el worker puede alargar la retención con `TENANT_PURGE_RETENTION_DAYS`, pero no acortarla;
      - `schema_name ~ '^tenant_[a-z][a-z0-9_]{0,54}$'` → si no, `INVALID_SCHEMA_NAME`. Es la misma expresión de `isValidSchemaName` (`packages/database/src/data-source.ts:182-184`); una prueba unitaria compara ambas para que no diverjan;
      - `schema_name <> 'tenant_iwana'` → si no, `PROTECTED_SCHEMA`;
      - si el esquema existe, su dueño debe ser `iwana_migrator` → si no, `UNEXPECTED_OWNER`. Así la función no puede borrar un esquema que no creó el aprovisionamiento. Este chequeo **no** basta para atar la fila a su esquema, porque el migrator es dueño de todos; esa atadura la da el trigger de §3.3, que impide reescribir `schema_name`;
      - ningún objeto de **otro** esquema depende de objetos del esquema a borrar (consulta a `pg_depend`: vistas, FKs, funciones) → si no, `EXTERNAL_DEPENDENCY`. Sin esta guarda, `CASCADE` borraría objetos ajenos al tenant.
   4. `INSERT` de `TENANT_PURGE_STARTED` en `platform_audit_logs` (mismos campos que hoy, `request_id = 'worker:tenant-schema-purge'`, y `session_user` como actor en `new_value`).
   5. `EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', schema_name)`.
   6. `DELETE FROM public.tenants WHERE id = p_tenant_id`. La fila está bloqueada y validada, así que borra exactamente una.
   7. `INSERT` de `TENANT_PURGE_COMPLETED` y `RETURN 'PURGED'`.
2. **Función de candidatos** `public.iwana_list_purge_candidates(p_min_retention_days int, p_limit int) RETURNS SETOF uuid`, también `SECURITY DEFINER` con el mismo `search_path`, que aplica el mismo piso de 30 días y el mismo orden por `deleted_at` (P3-2 de AI-SEC-ENG). `GREATEST` ignora `NULL`, así que un argumento nulo resuelve a 30; el límite se acota a un máximo fijo.
3. **Rol** `iwana_purger`: `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`, sin membresías y sin `TEMP`. Solo `CONNECT` a la base, `USAGE` en `public` y `EXECUTE` sobre las dos funciones. **Ningún privilegio sobre tablas**, ni en `public` ni en esquemas `tenant_%`. Lo crea `01-create-roles.sh` en volúmenes nuevos y `apply-least-privilege.sql` en los existentes. La migración solo concede privilegios si el rol existe: si no existe, deja la función sin `EXECUTE` para nadie y emite `NOTICE`, de modo que la purga falla de forma visible en lugar de abrir permisos.
4. La verificación GSEC-N1 de `01-create-roles.sh:131-142` se amplía a `iwana_purger` y añade dos comprobaciones: que `iwana_purger` no tenga `TEMP` y que no haya membresías entre los roles `iwana_*` (`pg_auth_members` vacío para ellos). El reloj de §3.3 depende de esa segunda condición.

**Worker:**

- `tenant-schema-purge.processor.ts` abre su `Pool` con `DB_PURGER_USER`/`DB_PURGER_PASSWORD` mediante una función `resolvePurgeDbCredentials()` en `@iwana/db`, junto a `resolveMigrationDbCredentials`.
  - En `NODE_ENV=production` **no hay respaldo**: sin `DB_PURGER_USER` el worker no arranca. Compose lo exige con `:?`.
  - En desarrollo, el respaldo a `DB_USER` se conserva para no romper `pnpm dev`, con un `warn` explícito de que la purga fallará.
- El procesador obtiene los candidatos con `SELECT * FROM public.iwana_list_purge_candidates($1, $2)` y, por cada uno, llama a `SELECT public.iwana_purge_tenant_schema($1, $2)`. Ya no ejecuta `BEGIN`, `DROP`, `DELETE`, `INSERT` de auditoría ni advisory locks.
- Una excepción `TENANT_PURGE_*` de un tenant se registra con su código y el `tenantId` (sin `schema_name` en el `failedReason`, por `@SanitizeFailedReason`), y el lote **continúa** con el siguiente. Hoy el primer error aborta el lote: un tenant con problemas bloquea a todos los demás. Al final, si hubo fallos, el job termina en error con el conteo para que BullMQ lo marque como fallido.

**Compose y CI:** `DB_PURGER_USER` y `DB_PURGER_PASSWORD` en `worker-prod`, en el servicio `postgres` de `docker-compose.yml` (para `01-create-roles.sh`), en `.env.example` y en el `env` de los jobs de integración de `ci.yml`. La API **no** las recibe.

### 3.3 Reloj de retención honesto

En la misma migración 029, un trigger `BEFORE INSERT OR UPDATE ON public.tenants` con función **`SECURITY INVOKER`**, que solo modifica `NEW` y no necesita privilegios. Identifica al llamante con `session_user`: dentro de un definer `current_user` sería el dueño y eximiría a todos, y `SET ROLE` no cambia `session_user`. Se considera «llamante privilegiado» a quien cumple `pg_has_role(session_user, 'iwana_migrator', 'MEMBER')`: el migrator y el bootstrap, para migraciones, operación manual documentada y montajes de prueba. Esto no se puede evadir mientras no haya membresías entre los roles `iwana_*`, y GSEC-N1 lo verifica (§3.2, punto 4).

Para un llamante **no privilegiado**:

1. **Fecha de la marca.** Si `NEW.deleted_at` pasa a un valor no nulo distinto del anterior, **o** si `status` pasa a `MARKED_FOR_DELETION` desde otro estado (aunque `deleted_at` ya tuviera un valor viejo), fija `NEW.deleted_at := now()`. La API ya escribe la hora actual, así que su comportamiento no cambia; lo que se impide es fechar la marca en el pasado o reutilizar una fecha antigua (P1-2 de AI-SEC-ENG). Volver a `NULL` (reactivación) sigue permitido.
2. **Identidad de la fila.** Rechaza con error (`TENANT_IDENTITY_IMMUTABLE`) cualquier cambio de `id` o de `schema_name` (P1-1 de AI-SEC-ENG). Sin esto, una API comprometida podría apuntar una fila marcada y vencida al esquema de otro tenant.
3. **Alta.** En `INSERT`, rechaza (`TENANT_SCHEMA_ALREADY_EXISTS`) un `schema_name` que ya exista en `pg_namespace` **y cuyo dueño no sea el propio llamante**. Así se cierra el camino `DELETE` de la fila de la víctima seguido de `INSERT` de una fila marcada con su `schema_name`, y también el de apuntar a un huérfano del migrator. El aprovisionamiento crea el esquema después de insertar la fila, así que no le afecta. Lo confirma una prueba (§5.3). *Acotado en la implementación (§13):* un esquema del propio llamante no es purgable, porque la función exige que su dueño sea el migrator; la excepción evita romper suites que crean su esquema como `iwana_app` en la base `test`.
4. **Rastro.** Cada marca, cada coerción y cada cambio de `deleted_at` inserta un evento en `platform_audit_logs` (`TENANT_DELETION_CLOCK_SET` o `TENANT_DELETION_CLOCK_COERCED`, con `session_user`). Un `UPDATE` directo de una API comprometida no pasa por el servicio y hoy no audita nada (P2-1 de AI-SEC-ENG). Como `INSERT` en `platform_audit_logs` necesita privilegio y el trigger es invoker, se escribe con el `INSERT` que `iwana_app` ya tiene. Para un llamante sin ese privilegio, el `INSERT` falla y la operación entera se revierte: falla cerrado.

**D-3 resuelta con AI-SEC-ENG:** coerción a `now()` para la fecha, con registro en la auditoría, y rechazo con error para la identidad de la fila.

### 3.4 Lo que no cambia

- Retención por defecto de 30 días, `TENANT_PURGE_BATCH_SIZE`, el cron diario y la cola (ADR-033).
- La selección de candidatos (`status`, `deleted_at`, orden y lote).
- Las acciones de auditoría y su forma (`TENANT_PURGE_STARTED`/`COMPLETED`, `entity_type = 'Tenant'`).
- El aprovisionamiento y su uso del migrator, y los grants de `iwana_app`.

### 3.5 Observabilidad mínima

- Log estructurado por tenant con el resultado (`PURGED`, `SKIPPED_LOCKED` o el código `TENANT_PURGE_*`), sin `schema_name` ni datos del ISP.
- Con fallos en el lote, el job termina en `failed`. La alerta sobre `failed` de `tenant-schema-purge` queda como requisito de G7 (§7, paso 6). Sin ella, este defecto habría seguido invisible.

---

## 4. Modelo de amenazas resumido (STRIDE, para AI-SEC-ENG)

| Amenaza | Antes (hoy) | Con F |
| --- | --- | --- |
| API comprometida (`iwana_app`) destruye un tenant | Solo DML: no puede `DROP SCHEMA` ni tocar la auditoría. | Puede marcar y esperar. El reloj honesto obliga a esperar 30 días. El trigger audita la marca aunque llegue por SQL directo, y la alerta de §7.6 avisa de cada marca nueva. No puede reescribir `schema_name` ni reutilizar un esquema existente en un alta. Sin acceso a las funciones. |
| Credencial del purger filtrada | No existe. | Solo purga tenants marcados hace más de 30 días, nunca `tenant_iwana` ni esquemas ajenos al migrator. Es lo que haría la purga legítima esa noche. |
| Worker comprometido | Ya tiene `DB_MIGRATOR_*` por el aprovisionamiento. | Igual. F no lo empeora; reducir la credencial del migrator en el worker es otro tema (§8, R7-d). |
| Inyección en el nombre del esquema | `isValidSchemaName` en Node. | Además, expresión regular y `%I` en la base. |
| Secuestro del `search_path` del definer | — | `pg_temp` explícito y al final, objetos calificados con su esquema e `iwana_purger` sin `TEMP`. |
| `CASCADE` borra objetos de otros esquemas | — | La comprobación de `pg_depend` aborta con `EXTERNAL_DEPENDENCY`. |
| Carrera entre purga y reactivación | Latente (§1.4). | `FOR UPDATE` antes del `DROP`. |
| Repudio | Auditoría en la misma transacción. | Igual, escrita por la función. |

---

## 5. Pruebas

### 5.1 Integrada que hoy falla — `apps/worker/src/processors/tenant-schema-purge.integration.spec.ts` (nueva)

Contra PostgreSQL real, base `test`, comando de CI (`DB_NAME=test R0_3_REAL_DB=1 pnpm --filter @iwana/worker test:integration`). Sigue la disciplina de la integrada DT-4: tenant sintético propio y bloqueo si hay tenants ajenos vencidos.

1. Como `iwana_migrator` (`resolveMigrationDbCredentials`): crea `tenant_r7_<hex>` con una tabla de negocio y una `audit_logs` con su trigger de inmutabilidad, igual que el aprovisionamiento. Inserta la fila en `public.tenants` como `MARKED_FOR_DELETION` con `deleted_at = now() - 3650 days`. La inserta el migrator porque el reloj honesto (§3.3) no permite fechar en el pasado a otro rol.
2. Construye `TenantSchemaPurgeProcessor` con la **misma configuración que `worker-prod`**: lee `DB_USER`, `DB_PASSWORD` y, si existen, `DB_PURGER_*` del entorno del job, sin sustituirlos en la prueba.
3. Afirma, con el pool del procesador, que `current_user` no es superusuario ni miembro de `iwana_migrator`. Esto evita el falso verde de una prueba que corre como bootstrap.
4. `process()` con lote 1. El esquema ya no existe, la fila tampoco, y hay `TENANT_PURGE_STARTED` y `TENANT_PURGE_COMPLETED` para ese `entity_id`.

**Hoy:** el procesador conecta como `iwana_app`, el paso 4 falla con `must be owner of schema` y la prueba queda roja. Ese rojo se registra como evidencia de reproducción antes de implementar (TDD, rojo y luego verde). **Tras F:** conecta como `iwana_purger` y pasa.

### 5.2 Integradas de la función — `packages/database/src/migrations/public/029_tenant_schema_purge_definer.integration.spec.ts`

Una prueba por motivo de rechazo, cada una con su código y sin efectos:

| Caso | Esperado |
| --- | --- |
| Tenant `ACTIVE` | `TENANT_PURGE_NOT_MARKED`; esquema y fila intactos. |
| Marcado hace 29 días, con `p_min_retention_days = 1` | `TENANT_PURGE_RETENTION_NOT_MET` (el piso de 30 manda). |
| `schema_name = 'tenant_iwana'` (fila sintética marcada, **sin** tocar el esquema real) | `TENANT_PURGE_PROTECTED_SCHEMA`; el esquema real no se toca. |
| Esquema cuyo dueño no es el migrator | `TENANT_PURGE_UNEXPECTED_OWNER`. |
| Nombre inválido en la fila | `TENANT_PURGE_INVALID_SCHEMA_NAME`. |
| Esquema inexistente y fila elegible | `PURGED` (idempotente: borra la fila y audita). |
| Dos llamadas concurrentes sobre el mismo tenant | Una `PURGED` y otra `SKIPPED_LOCKED` o `NOT_MARKED`; nunca dos `COMPLETED`. |
| Reactivación concurrente (la fila bloqueada por la purga, `UPDATE status = 'ACTIVE'` en otra conexión) | La reactivación espera. Si la purga gana, la fila no existe; nunca queda `ACTIVE` sin esquema. |
| Fila inexistente o ya purgada | `SKIPPED_GONE`, sin efectos ni auditoría. |
| Objeto de otro esquema que depende del esquema a purgar | `TENANT_PURGE_EXTERNAL_DEPENDENCY`; no se borra nada. |
| `p_min_retention_days` nulo, negativo o muy grande | Nulo y negativo resuelven a 30; uno grande alarga la retención. |
| La auditoría de la purga | Registra `session_user` como actor. |
| `iwana_list_purge_candidates` | Aplica el mismo piso, el orden y el tope de límite; no devuelve `tenant_iwana`. |

### 5.3 Privilegios — en la integrada 029 (la invariante `audit-privileges.invariant.integration.spec.ts` cubre a `iwana_purger` sin cambios; §13)

- `iwana_app` invoca la función → `permission denied for function`.
- `iwana_purger` hace `DROP SCHEMA` directo, `SELECT` sobre `public.tenants` o una tabla tenant, `UPDATE`/`DELETE` en `public.tenants` o `INSERT` en `platform_audit_logs` → `permission denied` en todos.
- `iwana_purger` intenta crear una tabla temporal → falla (sin `TEMP`).
- `iwana_purger` sin `SUPERUSER`, `CREATEROLE`, `BYPASSRLS` ni membresías.
- `iwana_app` ejecuta `SET ROLE iwana_migrator` → falla; `pg_auth_members` sin filas entre roles `iwana_*`.
- `iwana_app` fija `deleted_at` en el pasado → queda `now()` y hay `TENANT_DELETION_CLOCK_COERCED` con `session_user`.
- `iwana_app` pasa a `MARKED_FOR_DELETION` una fila que conservaba un `deleted_at` antiguo → queda `now()`.
- `iwana_app` cambia `schema_name` o `id` → `TENANT_IDENTITY_IMMUTABLE`.
- `iwana_app` borra una fila e inserta otra marcada con el `schema_name` de un esquema existente → `TENANT_SCHEMA_ALREADY_EXISTS`.
- Con el trigger activo, la creación de tenants por la API y el aprovisionamiento por el worker siguen en verde (integrada DT-4 W1 y aprovisionador local).

### 5.4 Unitarias — `apps/worker/src/processors/tenant-schema-purge.processor.spec.ts`

- Usa `DB_PURGER_*`. En producción, sin esa variable, el constructor lanza un error.
- Llama a la función por cada candidato, con la retención configurada.
- Un `TENANT_PURGE_*` en un tenant no detiene el lote; el job termina en error con el conteo.
- `failedReason` sin `schema_name`.
- `resolvePurgeDbCredentials` en `@iwana/db`, con el mismo patrón de `db-credentials.spec.ts`.

### 5.5 Ajustes a pruebas existentes

- `tenant-provisioning.marked.integration.spec.ts:274-283` afirma hoy que el pool de la purga es `DB_USER` con `DELETE` e `INSERT` directos. Esa afirmación pasa a comprobar `iwana_purger` con `EXECUTE` sobre la función. El fixture que fecha `deleted_at` hace 3650 días debe insertarse como migrator. **Lo revisa `test-change-reviewer`**: el cambio lo exige una regla nueva (§3.2 y §3.3), no es un fixture obsoleto.
- Las E2E que marcan tenants (`cleanupQaTenants`) no se ven afectadas: escriben la hora actual.

### 5.6 Evidencia de cierre (G6)

- Rojo de §5.1 antes de implementar, con salida literal.
- Verde sin caché (`iwana-test-evidence`): worker, `@iwana/db` unitarias e integradas y suite completa de la API, porque cambia una migración pública (memoria «Suite completa si cambia un @Module»).
- Aprovisionador local (E2E_SETUP y E2E_CLEANUP) con el rol nuevo creado por `apply-least-privilege`.
- `scripts/db/verify-app-cannot-drop-audit-trigger.sh` sigue en verde.

---

## 6. Criterios de aceptación

1. Con la configuración de `worker-prod`, la purga borra el esquema y la fila de un tenant marcado hace más de 30 días y registra el par de auditoría (§5.1 en verde, y roja antes del cambio).
2. Ningún rol de tiempo de ejecución gana `DROP` directo sobre esquemas ni sobre auditoría. `iwana_app` sigue sin poder destruir la auditoría (`verify-app-cannot-drop-audit-trigger` en verde).
3. La base rechaza purgar `tenant_iwana`, tenants no marcados, retenciones menores de 30 días y esquemas que no son del migrator (§5.2).
4. Una API comprometida no puede adelantar la purga de un tenant ni redirigirla al esquema de otro: reloj honesto, identidad inmutable y alta sin esquema preexistente (§5.3).
5. Purga y reactivación concurrentes nunca dejan un tenant `ACTIVE` sin esquema.
6. Sin `DB_PURGER_USER`, el worker de producción no arranca.
7. CI de `main` en verde tras el push (G6.5).

---

## 7. Plan para producción (G7)

G7 sigue diferido hasta la beta (ADR-095). Este plan queda listo para entonces:

1. **Secreto.** Generar `DB_PURGER_PASSWORD` en el gestor de secretos de producción, igual que `DB_MIGRATOR_PASSWORD`. Solo lo recibe `worker-prod`.
2. **Rol.** Antes del despliegue de la imagen, el operador ejecuta `scripts/db/apply-least-privilege.sh` con el superusuario de bootstrap. El script crea `iwana_purger` si no existe y le concede solo lo de §3.2. En un volumen nuevo lo hace `01-create-roles.sh`.
3. **Migración.** `migrator-prod` aplica la 029. Si el rol no existe, las funciones quedan sin `EXECUTE` (§3.2, punto 3): fallo visible, nunca permisos abiertos.
4. **Despliegue del worker** con `DB_PURGER_*`. La comprobación de arranque (§3.2) impide un worker sin credencial.
5. **Primera corrida vigilada y condición de Encargado.** Antes del primer cron, consulta de solo lectura de cuántos tenants son elegibles. Por cada uno debe constar la devolución o exportación de los datos al ISP, o su instrucción escrita de suprimir (D-2). La confirmación del CTO no sustituye la instrucción del Responsable. La purga es irreversible (ADR-033) y, en un entorno que nunca purgó, la primera noche podría borrar muchos a la vez. Se sugiere `TENANT_PURGE_BATCH_SIZE=1` la primera noche.
6. **Alertas:** jobs `failed` de `tenant-schema-purge`; tenants marcados con más de 31 días sin purgar (métrica derivada de `public.tenants`); y **cada marca nueva** (`TENANT_DELETION_CLOCK_SET`), para que una marca ilegítima se detecte dentro de los 30 días.
7. **Reversión.** El `down` de la 029 retira la función y el trigger. Revertir la imagen del worker basta para volver a la versión que no purga. Lo que se purgó no se recupera desde la app (ADR-033). Solo queda el respaldo, sujeto a su propia retención (§8, R7-b).

---

## 8. Riesgos y seguimientos fuera de esta spec

| # | Riesgo o seguimiento | Tratamiento |
| --- | --- | --- |
| R7-a | Activar la purga la vuelve real e irreversible. ADR-094 hace de iWana el Encargado: suprime por instrucción del ISP y tras devolverle los datos. Los esquemas contienen facturación de MOD14 y expedientes bloqueados por la retención de ADR-094 v1.1, que pueden tener deberes de conservación fiscal o legal del ISP. Esos deberes no se han verificado con una fuente oficial. | D-2: condición para G7 (§7.5), no para el G0. El mecanismo de exportación o constancia por tenant necesita su propia spec. La verificación normativa la hace un abogado, no una IA. |
| R7-b | Las copias de seguridad (`scripts/db/backup*.mjs`, `purge-backups.mjs`) conservan el esquema purgado hasta su propia expiración. | Seguimiento de AI-PLAT-OPS: documentar la ventana en el runbook de backups. Sin cambio de código aquí. |
| R7-c | Esquemas `tenant_%` sin fila en `public.tenants` (uno en `dbiw`). La purga no los ve. | Seguimiento: inventario y limpieza manual auditada, o una regla en la función con su propia spec. |
| R7-d | El worker guarda la credencial completa del migrator para aprovisionar. Es el mayor radio de la plataforma fuera de la API. | Fuera de alcance. Candidato a la misma técnica (función definer para crear y migrar el esquema), con spec propia. |
| R7-e | Riesgo de implementación: el trigger del reloj honesto toca `public.tenants`, que usan la API y el aprovisionador. | §5.3 y la suite completa de la API en G6. |

---

## 9. Decisiones que pide esta spec

| # | Decisión | Opciones | Recomendación |
| --- | --- | --- | --- |
| D-1 | Alternativa | F (rol dedicado) · F′ (`EXECUTE` a `iwana_app`) · A (migrator, contingencia) | F. AI-SEC-ENG considera F′ inaceptable porque da poder de purga a la API expuesta |
| D-2 | ¿Precondición de Encargado antes de suprimir (R7-a)? | Sin precondición (ADR-033 tal cual) · constancia por tenant de devolución o exportación, o instrucción escrita del ISP, como condición de G7 | La constancia como condición de G7, con una spec aparte para el mecanismo |
| D-3 | Reloj honesto | Coerción a `now()` · rechazo con error | Coerción auditada para la fecha y rechazo para la identidad de la fila (acordado con AI-SEC-ENG) |
| D-4 | ¿ADR? | Registrar el rol `iwana_purger` como enmienda del modelo SEC-04 en un ADR nuevo · solo actualizar el runbook | ADR breve: un rol nuevo con `LOGIN` cambia el modelo de SEC-04 (coincide AI-SEC-ENG) |

---

## 10. Revisión de AI-SEC-ENG (2026-11-09)

**Veredicto: GO con condiciones para el G0.** Considera correcta la alternativa F y sin regresión de SEC-04. Verificó los hechos en `dbiw` en solo lectura. Todos sus hallazgos se incorporaron a esta v1.0 antes del G0:

| Hallazgo | Severidad | Dónde se atiende |
| --- | --- | --- |
| El reloj no protegía `schema_name`: una fila marcada y vencida podía apuntar al esquema de otro tenant, o recrearse con su nombre tras un `DELETE`. | P1 | §3.3 puntos 2 y 3, §5.3 |
| Pasar a `MARKED_FOR_DELETION` una fila con `deleted_at` antiguo la hacía elegible esa misma noche. | P1 | §3.3 punto 1, §5.3 |
| El STRIDE decía «deja rastro», pero un `UPDATE` directo no audita. La alerta debía cubrir cada marca. | P2 | §3.3 punto 4, §4, §7.6 |
| `CASCADE` puede borrar objetos de otros esquemas. | P2 | §3.2, comprobación de `pg_depend`; §5.2 |
| Lock por nombre leído sin bloquear la fila (TOCTOU). Faltaba el caso de fila inexistente y los timeouts. | P2 | §3.2, pasos 1 y 2 |
| `search_path` sin `pg_temp` al final; actor de la auditoría. | P3 | §3.2, punto 1 y paso 4; GSEC-N1 sin `TEMP` |
| `iwana_purger` no necesita `SELECT` sobre `public.tenants`. | P3 | §3.2, función de candidatos |
| Faltaba `INSERT` en el inventario de grants de `iwana_app`. | P3 | §1.1 |

Respuestas a §9: D-1 F, D-2 condición de G7, D-3 coerción auditada, D-4 ADR breve. Las pruebas que propuso están en §5.2 y §5.3.

## 11. G0

**G0 aprobado por el CTO el 2026-11-09.** Cita literal: «G0, por el CTO». Se aprueban la alternativa F y las decisiones D-1 a D-4 tal como se recomiendan en §9. Lo transmitió AI-EM-ARCH con estas condiciones:

1. D-4: el ADR breve del rol `iwana_purger` se redacta antes del código, con estado Propuesto, y lo aprueba el CTO ([ADR-108](../adrs/ADR-108-Rol-de-Purga-de-Tenants-iwana_purger.md), **Aprobado** por el CTO el 2026-11-09: «Apruebo ADR-108»).
2. Implementación con TDD: primero la integrada de §5.1 en rojo con «must be owner».
3. `ci.yml` no se edita mientras lo toque otra sesión. Cuando AI-EM-ARCH avise que está libre, AI-PLAT-OPS añade solo las líneas `DB_PURGER_*` de §12 (corrección de AI-EM-ARCH, mismo día).
4. G6: bloque literal del CI sobre una base nueva `iwana_it_g7_*`, gate de omisiones esperadas, suite completa del worker, aprovisionador E2E e invariante de privilegios de §5.3.
5. D-2 queda como condición de G7. La spec del mecanismo de constancia por tenant no forma parte de esta ola.
6. Sin commit ni push hasta que lo ordene el CTO. Sin `git stash` ni staging parcial. No se toca `tenant_iwana`. Ningún cambio de roles en `dbiw` sin avisar antes a AI-EM-ARCH con el SQL exacto.

## 12. `env` que necesita CI (lo añade AI-PLAT-OPS cuando AI-EM-ARCH avise que `ci.yml` está libre)

Corrección de AI-EM-ARCH (2026-11-09): AI-EM-ARCH no edita configuración. Cuando termine la sesión que hoy toca `ci.yml`, AI-EM-ARCH avisa y esta sesión añade **solo** estas dos líneas.

En el `env` del job `ci` de `.github/workflows/ci.yml`, junto a `DB_MIGRATOR_*` (líneas 335-336 de `HEAD`):

```yaml
      DB_PURGER_USER: iwana_purger
      DB_PURGER_PASSWORD: ci-purger
```

- **Por qué hace falta:** `scripts/db/apply-least-privilege.sh` crea `iwana_purger` con `DB_PURGER_PASSWORD`; si falta, cae a `DB_PASSWORD` y el rol queda con la clave de la aplicación. Las suites que lo usan son `@iwana/db` (paso «migración 089», integrada 029) y la integración del worker (`tenant-schema-purge.integration.spec.ts` y DT-4). Sin `DB_PURGER_USER`, la integrada 029 se bloquea con `[BLOCKED]` y las del worker caen a `DB_USER`, que no tiene `EXECUTE`: el paso queda rojo.
- **Ningún paso nuevo.** El job E2E (R4.1) no necesita cambios: el aprovisionador fija `DB_PURGER_*` en `scripts/e2e-provision-operational.mjs` y `docker-compose.e2e.yml` los pasa al worker.
- La API no necesita la variable.

## 13. Notas de implementación (2026-11-09)

| Desvío o decisión | Motivo |
| --- | --- |
| §3.3 regla 3 acotada a esquemas cuyo dueño no es el llamante. | La integrada del relay (`execution-order-relay.integration.spec.ts`) crea su esquema como `iwana_app` y luego da de alta el tenant; con la regla literal quedó roja (`TENANT_SCHEMA_ALREADY_EXISTS`). La propiedad de seguridad se mantiene: solo un esquema del migrator es purgable. |
| El detector de dependencias externas resuelve el esquema del dependiente por catálogo (`pg_rewrite`, `pg_attrdef`, `pg_trigger`, `pg_constraint`, `pg_policy`, etc.) y, si no lo resuelve, lo cuenta como externo. | `pg_identify_object` devuelve esquema nulo para la regla de una vista: la primera versión dejaba pasar una vista de otro esquema (la integrada lo detectó). Medido sobre un `tenant_test` completo (680 relaciones, 3 832 dependencias): 0 falsos positivos. |
| §5.3 no amplía `audit-privileges.invariant.integration.spec.ts`. Las pruebas de privilegios viven en la integrada 029. | La invariante ya recorre todos los roles sin `SUPERUSER` y falla si alguno, `iwana_purger` incluido, gana `UPDATE`/`DELETE`/`TRUNCATE` sobre auditoría. Siguió en verde. |
| «Re-marcar» con un `deleted_at` antiguo se audita como `TENANT_DELETION_CLOCK_COERCED`, no como `SET`. | La fecha antigua que viaja en la fila es una marca en el pasado. |
| `docker-compose.e2e.yml` exige `DB_PURGER_*` en `worker-e2e`; el aprovisionador las genera. `docker-compose.yml` las pasa opcionales al init (vacío → `POSTGRES_PASSWORD`, solo lab). | Fidelidad del E2E sin romper `pnpm dev` en volúmenes existentes. |
| **Desviación de proceso:** el código se escribió antes de que el CTO aprobara ADR-108. La condición 1 del G0 pedía el ADR antes que el código, y su aprobación por el CTO también. | El ADR se redactó primero, pero la implementación no esperó a que se aprobara. El contenido del ADR no cambió durante la implementación. Registrado a pedido de AI-EM-ARCH el 2026-11-09. El CTO aprobó ADR-108 después, el 2026-11-09 («Apruebo ADR-108»), sin cambios en su contenido. |
| Auditoría de citas ADR tras la aprobación (2026-11-09): `node scripts/audit-adr-citations.mjs`, la misma variante que el job «Integridad de citas ADR». | **0 bloqueantes**, 155 avisos. Ninguno en los documentos de R7: el aviso nuevo está en la spec de `ci-integracion-api` (`2026-11-09-plat-ops-ci-integracion-api-tiempo.md:151`), que describe ADR-108 como Propuesto. |
| Evidencia de rojo (§5.1) antes de implementar: `error: class=DatabaseError sqlstate=42501`; log del servidor: `ERROR: must be owner of schema tenant_r7_48ff670a9bd1`. | TDD exigido por el G0. |

**Para el `.env` local de desarrollo** (no versionado): añadir `DB_PURGER_USER=iwana_purger` y `DB_PURGER_PASSWORD`. Crear el rol en `dbiw` requiere `apply-least-privilege`, que es un cambio de roles: **no se ha ejecutado**. El SQL exacto se le avisa antes a AI-EM-ARCH (G0, condición 6).

## 14. G6 (en curso, 2026-11-09)

Todo sobre un contenedor desechable `postgres:18.3-alpine` (`iwana-pg-r7`) preparado como el job `ci`: least-privilege, migraciones públicas (incluida la 029), `tenant_test` y migraciones tenant. Ningún cambio de roles en `dbiw`.

| Gate | Comando | Resultado |
| --- | --- | --- |
| Rojo previo (§5.1) | `R0_3_REAL_DB=1 jest --config jest.integration.config.js tenant-schema-purge.integration` antes de implementar | 1 fallo, `sqlstate=42501`, `must be owner of schema` |
| Integración worker | `R0_3_REAL_DB=1 pnpm --filter @iwana/worker test:integration` (base `test`) | 3 suites, 5/5 |
| Integración `@iwana/db` | `jest --config jest.integration.config.js` (base `test`) | 56 suites, 201/201 (incluye la integrada 029, 23/23, y la invariante de privilegios) |
| Unitarias worker | `jest --ci`, sin caché | 21 suites, 196/196 |
| Unitarias `@iwana/db` | `jest --ci`, sin caché | 79 suites, 429/429 |
| Typecheck / lint | `pnpm --filter @iwana/worker --filter @iwana/db typecheck` y ESLint de los archivos tocados | sin errores ni avisos |
| Gate SEC-04 | `scripts/db/verify-app-cannot-drop-audit-trigger.sh` | PASS |
| Integración API, bloque literal de `HEAD` (en serie) | base nueva `iwana_it_g7_r7_20261109`, `MFA_ENCRYPTION_KEY` efímera como en CI | 83 suites aprobadas y 3 omitidas de 86; 570 pruebas aprobadas y 19 omitidas de 589. Gate de omisiones: **PASS** (86 specs; 3 omisiones declaradas; B5 17/17; K2 5/5) |
| Auditoría de citas ADR | `node scripts/audit-adr-citations.mjs` | 0 bloqueantes |

Una primera corrida de la integración API sin `MFA_ENCRYPTION_KEY` dio 24 fallos, todos por esa clave ausente (el CI la genera en un paso anterior). En Windows, el gate de omisiones lee `/tmp` como `C:\tmp`; se ejecutó con `API_INTEGRATION_REPORT_PATH` apuntando al reporte real.

| Integración API, bloque nuevo del CI (paso «Integration DBs — una base por worker» + `IWANA_IT_WORKERS: 4`) | base nueva `iwana_it_g7_r7c_20261109` y clones `_w2` a `_w4` | 83 suites aprobadas y 3 omitidas de 86; 570 pruebas aprobadas y 19 omitidas de 589; 172 s. Gate de omisiones: **PASS** (86 specs; 3 omisiones declaradas; B5 17/17; K2 5/5). Los clones conservan `EXECUTE` de `iwana_purger` (no de `iwana_app`) y el trigger `trg_tenants_deletion_clock` |

El paso de clonado llama a `apply-least-privilege.sh` por clon; con `DB_PURGER_*` en el `env` del job (§12, añadido a `ci.yml` el 2026-11-09) tiene la contraseña disponible. El rol es global del clúster, así que en los clones ya existe.

| Aprovisionador E2E | `API_BASE_URL=http://127.0.0.1:3100/api/v1 node scripts/e2e-provision-operational.mjs` (el 3000 estaba ocupado por otra instancia, que no se detuvo) | `E2E_SETUP=OK`, `E2E_CLEANUP=OK`, 165 s. `worker-e2e` arrancó con `DB_PURGER_*` (Compose las exige con `:?`). Playwright no ejecutó pruebas: `E2E_PLAYWRIGHT=FAILED|La suite portal no recogió el spec de MOD13`, 0 aprobadas, 0 fallidas. Es un fallo del entorno local, ajeno a R7; la corrida con `E2E_PLAYWRIGHT_FAILED=0` queda para el job «E2E operativo R4.1» en el G6.5, como en DT-4 |

**G6 local: completo, salvo Playwright, que se delega al G6.5 del CI.** Sin commit ni push, a la espera de la orden del CTO.

## 15. Revisión de AI-SEC-ENG sobre el diff implementado (2026-11-09)

Ordenada por el CTO antes del commit («Sí, que lo revise»). Auditoría de solo lectura con la skill `security-auditor` sobre el diff real; fuera de alcance, el resto de `ci.yml` y `scripts/db/clone-integration-dbs.sh` (sesión `ci-integracion-api`).

**Dictamen: GO para el commit.** Sin P0 ni P1. Los P2 no bloquean el commit, pero se cierran antes de G7.

| # | Sev. | Dónde | Hallazgo | Corrección propuesta | Dueño |
| --- | --- | --- | --- | --- | --- |
| P2-1 | P2 | `apply-least-privilege.sql` (bloque `r7guard`) y `01-create-roles.sh` (GSEC-N1) | La guarda solo mira membresías directas en `pg_auth_members`; el trigger usa `pg_has_role(...,'MEMBER')`, que es transitivo. Un rol intermedio miembro de `iwana_migrator` dejaría a `iwana_app` fuera del reloj o a `iwana_purger` con `SET ROLE iwana_migrator`. | Evaluar `pg_has_role(a, b, 'MEMBER')` por cada par de roles `iwana_*` y `pg_has_role('iwana_purger','iwana_migrator','USAGE')`; usar `:'app_user'` y `:'migrator_user'` en lugar de nombres fijos. | AI-PLAT-OPS |
| P2-2 | P2 | `029_tenant_schema_purge_definer.ts`, CTE `own` | El conjunto de objetos propios del esquema solo cubre `pg_class`, `pg_type` y `pg_proc`. Una collation, operador, opclass, opfamily, conversión, configuración de búsqueda o estadística extendida del tenant usada desde otro esquema no se detecta, y `CASCADE` la arrastraría. Explotarlo exige DDL de migrator o superusuario. | Añadir `pg_namespace` (v_nsp) y esas clases filtradas por su espacio de nombres; caso de integración con una collation usada desde `public`. | AI-SR-FULL |
| P3-1 | P3 | `029…ts`, `search_path` de los definer | `public` sigue en el `search_path` aunque todo está calificado. | `SET search_path = pg_catalog, pg_temp`. | AI-SR-FULL |
| P3-2 | P3 | `029…ts`, `up()` | Si migra el bootstrap (superusuario), los definer quedan con dueño superusuario. Hoy falla cerrado por el chequeo de dueño. | Abortar si `current_user <> 'iwana_migrator'` con el rol presente, o `ALTER FUNCTION … OWNER TO iwana_migrator`. | AI-SR-FULL |
| P3-3 | P3 | `01-create-roles.sh`, `apply-least-privilege.sh` y `.mjs` | La contraseña del purger cae a `POSTGRES_PASSWORD`/`DB_PASSWORD` o a `changeme-dev-only-purger`, y como el rol solo se crea si no existe, queda así para siempre. Mismo patrón heredado de app y migrator. | Abortar fuera de bases de prueba si falta `DB_PURGER_PASSWORD`; documentar la rotación con `ALTER ROLE`. | AI-PLAT-OPS |
| P3-4 | P3 | `01-create-roles.sh`, `apply-least-privilege.sql` | `iwana_purger` está fijo en los scripts, pero `DB_PURGER_USER` es configurable: cambiarlo hace fallar la purga sin un diagnóstico claro. | Aceptar `DB_PURGER_USER` en los scripts o documentar que el valor es fijo. | AI-PLAT-OPS |

Verificado sin hallazgos: `SECURITY DEFINER` con `pg_temp` al final y objetos calificados; `format('%I')` tras validar el nombre; piso de 30 días con `GREATEST`; lock por id y `FOR UPDATE NOWAIT` antes del DDL; `REVOKE FROM PUBLIC` y `GRANT` condicionado; `down` simétrico; trigger `SECURITY INVOKER` con `session_user` y tolerancia que no acumula retrocesos; regla 3 acotada no explotable en producción (sin `CREATE` para `iwana_app` fuera de bases de prueba, chequeo de dueño y `uq_tenants_schema_name`); procesador sin DDL, sin `schema_name` ni PII en logs ni `failedReason`, lote que continúa, sin respaldo en producción; `DB_PURGER_*` solo en `worker-prod` y `worker-e2e`, nunca en la API.

### 15.1 Hecho de entorno: la 029 y el rol ya están en `dbiw`

AI-SEC-ENG encontró, y AI-PLAT-OPS confirmó en solo lectura, que en `iwana_postgres_dev`/`dbiw` existen el rol `iwana_purger` y la migración 029 (`typeorm_migrations.id = 28`), con las funciones de dueño `iwana_migrator` y `EXECUTE` solo para `iwana_migrator` e `iwana_purger`.

- **Esta sesión no lo aplicó.** Todas sus migraciones corrieron contra el contenedor desechable `iwana-pg-r7` (puerto 55437), y el aprovisionador E2E contra su propio `iwana_postgres_e2e`.
- **Vía más probable:** `pnpm dev` ejecuta `pnpm db:migrate:all` contra `dbiw` al arrancar (`scripts/dev.mjs:1028`), y ese comando termina en `apply-least-privilege`, que crea `iwana_purger` si no existe. Durante el G6 el puerto 3000 estaba ocupado por otra instancia de la API, señal de que alguien levantó `pnpm dev` con estos archivos ya en disco.
- **Consecuencia:** como el `.env` local no tiene `DB_PURGER_PASSWORD`, el rol en `dbiw` probablemente quedó con la contraseña de respaldo `DB_PASSWORD` (P3-3 materializado). No hay purgas ni eventos del reloj registrados en `dbiw` después de la aplicación.
- **Lo que no hizo esta sesión:** ningún cambio de roles en `dbiw`. Si se quiere fijar una contraseña propia, el SQL es `ALTER ROLE iwana_purger PASSWORD '<valor de DB_PURGER_PASSWORD>'`, y se avisa antes a AI-EM-ARCH.

## 16. CI rojo en `d09397ee` y corrección (2026-11-09)

El run 42704957642 de `main` falló en «Unit tests + gate de cobertura»: la guarda transversal `apps/api/src/common/log-error-safety.architecture.spec.ts:411`, que recorre también `apps/worker/src`, marcó `tenant-schema-purge.processor.ts:93`. El `logger.error` interpolaba un código obtenido de `this.rejectionCode(error)`, es decir, derivado del error; el método no está entre los resúmenes revisados de la guarda.

**Corrección (sin tocar la guarda):** `safeErrorType(error)`, función de módulo con el patrón que ya usan otros procesadores (p. ej. `execution-order-inventory-rescan.service.ts:49`): devuelve el motivo solo si pertenece a la lista cerrada de los seis `TENANT_PURGE_*` de la migración 029, el SQLSTATE solo si es uno de `42501`, `55P03`, `57014` o `40P01`, y en otro caso `TENANT_PURGE_FAILURE`.

**Por qué el G6 no lo detectó:** se corrieron sin caché las unitarias completas del worker y de `@iwana/db`, pero no las de `@iwana/api`, que contienen guardas transversales que inspeccionan también el código del worker. Es la regla «Suite completa si cambia un @Module»: un cambio en `apps/worker` o `packages/database` exige también la suite unitaria completa de la API.

**Verificación tras la corrección (sin caché, 2026-11-09):**

| Suite | Resultado |
| --- | --- |
| Guarda `log-error-safety.architecture.spec.ts` | 24/24 |
| Unitarias `@iwana/api` | 489 suites, 6533/6533 |
| Unitarias `@iwana/worker` | 21 suites, 196/196 |
| Unitarias `@iwana/db` | 79 suites, 429/429 |
| Integradas del worker (base `test` en contenedor desechable, roles y 029 aplicados) | 3 suites, 5/5 |
| ESLint del procesador y typecheck del worker | sin errores |

Sin commit ni push: la publicación la decide el CTO.

## 17. G6.5 (2026-11-09) ✅

| Paso | Commit | Run | Resultado |
| --- | --- | --- | --- |
| Publicación de R7 en el tren R7 + CI | `e824728a` (R7) dentro de `d09397ee` | CI 42704957642 | ❌ `failure`: «Unit tests + gate de cobertura» falló en `log-error-safety.architecture.spec.ts:411` por `tenant-schema-purge.processor.ts:93`. Las integraciones quedaron omitidas por ese fallo (§16) |
| Corrección | `6c96342d` «fix(worker): log tenant purge rejections through the safe log contract (R7)», publicado junto a `47ba22f7` (ADR-107 v1.1, de otra sesión) con autorización del CTO («Sí, ambos»), rango `d09397ee..6c96342d` | — | — |
| Verificación | `6c96342d` | CI 42708735995 | ✅ `success` en todos los jobs: «Integridad de citas ADR», «Detección de cambios de solo documentación», «Lint + Typecheck + Build + Unit tests» (incluye las integraciones de `@iwana/db`, API y worker), «E2E operativo R4.1 — API + storage + BullMQ reales» (Playwright), «E2E portal» y «Build y validación de imágenes production» |
| Verificación | `6c96342d` | E2E Web Admin Smoke 42708735897 | ✅ `success` |

Verificado por AI-EM-ARCH y comprobado con `gh run view` por AI-PLAT-OPS. Con esto R7 queda publicado y cerrado en CI. Siguen abiertos fuera de esta ola: los P2 y P3 de §15 (antes de G7), D-2 (constancia de devolución o exportación por tenant, condición de G7) y los seguimientos R7-b a R7-d de §8.
