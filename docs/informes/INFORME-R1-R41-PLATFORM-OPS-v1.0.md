# Informe R1/R4.1 — Platform Ops

**Estado:** Riesgos operativos de R4.1 cerrados; E2E vertical cableado en CI; local requiere puerto :3000 libre
**Fecha:** 2026-07-31
**Perfil:** AI-PLAT-OPS (coordinación), AI-SR-FULL (implementación), AI-SR-QA (verificación), AI-EM-ARCH (cierre de riesgos)

## Alcance

Se preparó un flujo reproducible y aislado de infraestructura local para el E2E
operativo de Execution Orders, sin modificar `apps/*`, `packages/*`, producción
ni ocultar pruebas. El provisionador usa un proyecto Compose y volúmenes propios
para R4.1.

## Evidencia

- Docker Engine/Compose disponible y validación `config --quiet` PASS.
- PostgreSQL, Redis, MinIO y Typesense E2E healthy con puertos/volúmenes
  separados del desarrollo.
- Bootstrap privado del bucket MinIO E2E PASS.
- `pnpm db:migrate:all` PASS sobre la base E2E (public + tenant). El bloqueo
  previo por `AddMediaAssetStatusAndClaim0200000000000` ya no se reproduce.
- Worker BullMQ E2E `Up (healthy)`.
- `E2E_API_HEALTH=OK` — la API alcanza el healthcheck real contra la base E2E.
- `E2E_SETUP=OK` — dos inquilinos creados, ambos `ACTIVE`, usuarios NOC/técnico/
  coordinador con perfiles asignados, fixture de inventario y horario comercial.
- Playwright: `3 passed, 1 failed`. `E2E_CLEANUP=OK`.

## Correcciones aplicadas en esta ronda

### 1. Los GRANT de SEC-04 se aplicaban a la base de desarrollo

`pnpm db:migrate:all` termina en `pnpm db:apply-least-privilege`, y
`scripts/db/apply-least-privilege.mjs` resuelve su destino con
`process.env.POSTGRES_CONTAINER ?? 'iwana_postgres_dev'`. El provisionador R4.1
nunca sobrescribía esa variable: las migraciones corrían contra la base efímera
(`127.0.0.1:15433`) mientras los GRANT se aplicaban por `docker exec` sobre el
contenedor de **desarrollo**. La traza lo dice literalmente:
`apply-least-privilege: modo docker (iwana_postgres_dev)`.

Consecuencia en la base E2E: las tablas quedan con `owner = iwana_migrator` y
`iwana_app` sin privilegios (las `ALTER DEFAULT PRIVILEGES` del init solo cubren
lo que crea el rol de bootstrap). La API, que corre como `iwana_app`, moría en
`PlatformBootstrapService.onApplicationBootstrap` con
`42501: permission denied for table platform_users`. Como `nest start --watch`
mantiene vivo al proceso padre aunque el hijo Nest muera, `apiProcess.exitCode`
seguía en `null` y el fallo se veía solo como
`API E2E no alcanzó healthcheck en 120 segundos: fetch failed`.

Verificación del síntoma en la base E2E antes del arreglo:

| `has_table_privilege('iwana_app','public.tenants','SELECT')` | `…('iwana_migrator',…)` | owner |
| --- | --- | --- |
| `f` | `t` | `iwana_migrator` |

Arreglos:

- `scripts/e2e-provision-operational.mjs` fija `POSTGRES_CONTAINER` al contenedor
  E2E antes de migrar.
- `scripts/db/apply-least-privilege.mjs` valida en modo docker que el contenedor
  elegido publique el mismo puerto contra el que se migró (`docker port … 5432/tcp`
  vs `DB_HOST`/`DB_PORT`) y falla en duro si no coinciden. No aplica cuando
  `DB_HOST` no es loopback ni en `LEAST_PRIVILEGE_MODE=host` (el modo de CI).

### 2. Identidad de plataforma inexistente en la base efímera

El provisionador se autenticaba con `E2E_PLATFORM_*` antes que con
`PLATFORM_SUPER_ADMIN_*`. En un entorno local con
`E2E_PLATFORM_EMAIL=qa-verificacion@iwana.local`, esa cuenta solo existe en la
base de desarrollo sembrada; en la base efímera el único superusuario es el que
`PlatformBootstrapService` crea desde `PLATFORM_SUPER_ADMIN_*`. Resultado:
`POST /auth/platform/login respondió HTTP 401`.

Arreglo: R4.1 toma `PLATFORM_SUPER_ADMIN_*` como fuente de verdad y solo cae a
`E2E_PLATFORM_*` si aquellas faltan. Ambas se leen como pareja para no mezclar
correo de una identidad con contraseña de otra.

### 3. Diagnosticabilidad del arranque de la API

`startApi()` lanzaba la API con `stdio: 'ignore'`, de modo que un fallo de
bootstrap no dejaba rastro alguno. Ahora se capturan `stdout`/`stderr` y la cola
del log se adjunta al error de healthcheck. Sin esto, la causa raíz anterior no
era observable desde la salida del provisionador.

## Segunda ronda — protocolo multiagente sobre el 500 de evidencia

El `500` de `POST /tasks/execution-orders/:id/evidence-assets` resultó ser una
**cadena de tres defectos de producción encadenados**, cada uno enmascarando al
siguiente. Se aplicó `systematic-debugging`: ninguna corrección se propuso sin
traza real capturada del proceso de la API.

### D-1 — `EntityMetadataNotFoundError` (AI-SR-FULL)

`apps/api/src/app.config.ts:39` fija `autoLoadEntities: true`: una entidad
obtiene metadata solo si aparece en algún `TypeOrmModule.forFeature` o en el
array `entities` de `packages/database/src/data-source.ts`.
`ExecutionOrderEvidenceUploadIntent` no estaba en ninguno, pese a usarse vía
`qr.manager.create/save/update` en `execution-orders.service.ts`.

Corregido registrándola en `apps/api/src/modules/tasks/tasks.module.ts` —el
módulo dueño— y no en `data-source.ts`, que es superficie transversal de
CLI/migraciones. Guarda de regresión: `tests/tasks.entity-metadata.spec.ts`,
que cruza las entidades importadas de `@iwana/db` en MOD11 contra las
superficies que otorgan metadata.

### D-2 — CHECK constraint incompleto (AI-SR-FULL)

Al eliminar D-1, la sentencia llegó por primera vez a PostgreSQL y reveló
`violates check constraint chk_execution_order_evidence_upload_intents_status`.
Había una contradicción de **cuatro** fuentes: la migración 095 (4 estados), el
docstring de la entidad (5), el servicio (6) y el contrato de `@iwana/shared`
(4).

Dirección decidida con criterio de dominio: se extiende el CHECK, no se colapsa
`PENDING` en `PENDING_ANALYSIS`. El contrato público **no cambia**, y está
probado: `toEvidenceAssetReceipt` rechaza con 409 cualquier intent sin
`mediaAssetId`, y `PENDING`/`FAILED` lo tienen nulo por construcción, así que
son estructuralmente inalcanzables desde la proyección pública. Respaldo
normativo: ADR-068 §48 (estado **Aprobado**, cita verificada) — «MOD11 crea un
upload-intent tenant-aware con `intentId`; Media/Assets genera `mediaAssetId`».

Migración tenant `099_extend_evidence_upload_intent_status.ts`, reversible, con
guarda `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN`. La 095 no se toca. La entidad pasa
de `status: string` a un union tipado con constante canónica exportada, de modo
que el compilador rechaza literales fuera del vocabulario.

### D-3 — join con tipos incompatibles (AI-SR-FULL)

`ExecutionOrderProjectionConvergenceService.countTenantDiscrepancies` unía
`operational_tasks.id` (UUID) con `execution_orders.task_id` (VARCHAR(160), que
la migración 056 declaró como referencia lógica y no como FK) →
`operator does not exist: uuid = character varying`, degradado a WARN. La
telemetría de convergencia del relay **nunca** se había recolectado.

Corregido con `ON task.id::text = eo.task_id`. Se castea el UUID a texto y no al
revés porque `task_id` admite referencias que no son UUID.

### Verificación independiente (AI-SR-QA, gate G6)

Dos corridas completas del provisionador, resultado idéntico:

| Criterio | Resultado |
| --- | --- |
| `1e. Subir evidencia y registrar` devuelve `202` | **CUMPLE** (era `500`) |
| Sin regresión respecto a la línea base | **CUMPLE** — de `3 passed` a `4 passed` |
| Log de API sin `EntityMetadataNotFoundError`, sin `uuid = character varying`, sin violaciones de CHECK, sin `QueryFailedError` | **CUMPLE** — cero ocurrencias |
| Migración 099 aplicada | **CUMPLE** — verificada contra `pg_constraint` en la base viva, incluidos schemas de tenants heredados del volumen persistente |

## Pendiente

- **Gate G6: NO-GO.** El bloqueo ya no está en producción sino en el fixture del
  E2E. `1f. Cerrar OT exitosamente` pasaba el `mediaAssetId` de una evidencia
  PHOTO como artefacto de aceptación de firma; la API lo rechaza con `422`
  **correctamente** (`CUSTOMER_ACCEPTANCE_ARTIFACT_INVALID_TYPE`): el artefacto
  debe ser una evidencia `SIGNATURE` con `requirementKey = CUSTOMER_SIGNATURE` y
  asset `AVAILABLE`. El happy path nunca creaba esa evidencia. Estaba enmascarado
  porque `1f` jamás llegó a ejecutarse mientras `1e` fallaba.
- **Fixture de firma corregido y VERIFICADO.** Se añadió el caso
  `1e-bis. Registrar evidencia de firma del cliente`, se eliminó el fallback
  `|| 'sig-e2e-001'` que enmascaraba un fixture roto, se sustituyó el polling con
  `setTimeout` por espera por condición, y se desplazó la ventana de agenda por
  `testInfo.retry` para cerrar el defecto de aislamiento de `1a`. Corrida real
  del provisionador con puerto 3000 libre y `E2E_API_HEALTH=OK` sin reutilización:
  **de `4 passed` a `5 passed`**; `1e-bis` pasa y el `422` de tipo de artefacto
  desaparece.

### Siguiente eslabón: `CLOSURE_GATE_SNAPSHOT_MISSING` (fixture, no producción)

`1f. Cerrar OT exitosamente` sigue en `422`, ahora por otra causa. Evidencia
estática concluyente:

1. `execution-orders.service.ts:577` — `templateRequirementsSnapshot` se puebla
   **solo** desde un `templateVersion` resuelto; sin plantilla queda `null`.
2. `execution-orders.service.ts:841-847` — con snapshot ausente el cierre lanza
   `CLOSURE_GATE_SNAPSHOT_MISSING`: «No se puede cerrar la OT porque no tiene una
   plantilla de cierre congelada». Es una regla deliberada, no un defecto.
3. Ninguna migración tenant siembra plantillas de OT: el único
   `INSERT INTO execution_order_templates` del repo vive en un fichero de test
   (`r2_4_down.integration.spec.ts:272`).
4. `scripts/e2e-provision-operational.mjs` no crea ninguna plantilla: provisiona
   usuarios, perfiles, fixture de inventario y horario comercial.

Es decir: **un inquilino recién provisionado no tiene ninguna plantilla de
cierre, así que el happy path no puede cerrar por diseño.** El caso `8a` de la
propia suite sí crea su plantilla, lo que confirma el patrón: hay que crearla
explícitamente. La corrección corresponde al fixture —provisionador o spec—, no
al gate de cierre.

Además, `1e` quedó marcado `flaky`: la redirección de contenido devolvió `429`
en lugar de `302`. Es interacción con el throttler durante la ráfaga; conviene
revisarlo junto al aislamiento de la suite.
- **19 de los 26 casos no se han ejecutado nunca.** Aislamiento multi-inquilino
  (`6a`), rate limiting (`4a/4b`), autorización (`5a-5d`), ciclo de evidencia
  (`7a-7d`) y gate MATERIAL (`8a/8b`) no tienen ninguna evidencia ejecutada: la
  cadena serial los cortaba antes de llegar. Es previsible que aparezcan defectos
  nuevos y conviene presupuestar esa corrida antes de comprometer fecha de R4.1.

## Deuda registrada

| Id | Descripción | Propietario |
| --- | --- | --- |
| QA-D3 | La trazabilidad de `1e` descansa solo en el E2E. Falta un test de integración con base real sobre `createEvidenceAssetReceipt`. | AI-SR-QA |
| QA-D4 | `iwana_postgres_data_e2e` persiste entre corridas y los schemas `tenant_e2e_%` se acumulan. Verificado que las migraciones sí alcanzan a los heredados. | AI-PLAT-OPS |
| H-1 | `WfmSiteBusinessHours` (MOD09) tiene el mismo defecto que D-1: se usa en `operating-window-resolver.service.ts:59` sin metadata registrada. Cualquier endpoint que llegue ahí responde 500. | AI-SR-FULL |
| H-2 | Guard laxo de `taskId` en `reconcileOrder`: acepta valores no-UUID y los pasa a una columna `uuid`. | AI-SR-FULL |
| H-4 | `095:24` deja `DEFAULT 'PENDING_ANALYSIS'` cuando un intent nace `PENDING`. Verificado **inerte** (no existe ningún INSERT fuera del ORM). Se activa si aparece un segundo camino de inserción que omita `status`. | AI-SR-FULL |
| H-5 | `r4_r2_4_migrations.integration.spec.ts:114` filtra migraciones 089-098 por lista literal: no se rompe con la 099, pero deja de cubrirla. | AI-SR-QA |

## Riesgos operativos conocidos

- **Reutilización de la API en `:3000`.** `startApi()` reutiliza cualquier API
  que responda al healthcheck (`E2E_API=REUSED`) sin comprobar contra qué base
  apunta. Con `pnpm dev` levantado en paralelo, R4.1 se ejecuta contra la base de
  desarrollo. Ejecutar R4.1 con el puerto 3000 libre.
- **Credenciales y volúmenes persistentes.** `stopInfrastructure()` hace `down`
  sin `-v`. Si el entorno no fija `DB_*_PASSWORD` (p. ej. CI sin `.env`), el
  provisionador genera contraseñas aleatorias por corrida mientras el volumen
  conserva los roles del primer init: la segunda corrida sobre el mismo volumen
  fallaría la autenticación.

## Artefacto operativo

`scripts/e2e-provision-operational.mjs` provisiona dependencias reales, ejecuta
el test objetivo cuando las migraciones pasan y limpia los recursos efímeros.
`docker-compose.e2e.yml` aísla PostgreSQL, Redis, MinIO, Typesense y worker.
No contiene credenciales persistentes.

## Addendum — cierre de riesgos operativos (AI-EM-ARCH · 2026-07-31)

Durante la verificación final G6 se cerraron dos riesgos documentados en la
sección «Riesgos operativos conocidos»:

### A. Volúmenes E2E persistentes con credenciales obsoletos

**Cambio:** `provisionInfrastructure()` ejecuta `docker compose down -v` antes de
levantar la infraestructura. Solo afecta los volúmenes del proyecto E2E
(`iwana-e2e-r41`); los volúmenes de desarrollo (`iwana_*_dev`) permanecen intactos.

**Razón:** MinIO almacena el par root user/password en su volumen. Cuando el
provisionador genera credenciales aleatorias (entornos sin `.env`), una segunda
corrida sobre el mismo volumen persistente fallaba con `AccessDenied`. Eliminando
el volumen E2E al inicio de cada corrida se garantiza que el `minio-init` crea el
bucket con las credenciales efímeras de la sesión actual.

### B. Reutilización de API en `:3000`

**Cambio:** `assertApiPortFree()` verifica que el puerto de `API_ROOT` esté libre
antes de provisionar y antes de arrancar la API E2E. Si el puerto está ocupado
(p. ej. `pnpm dev` u otra instancia), el provisionador falla inmediatamente con:

```text
[BLOQUEO] El puerto 3000 ya está en uso. R4.1 requiere arrancar la API E2E limpia.
```

`startApi()` ya no reutiliza una API existente (`E2E_API=REUSED` eliminado). Esto
impide que los tests corran contra una base de desarrollo con estado distinto al
E2E.

### C. Multipart de evidencia vía Playwright

**Cambio:** `e2e/tests/api/execution-orders-operational.spec.ts` usa el helper
`uploadEvidenceMultipart()` que construye el body `multipart/form-data` con boundary
manual y lo envía como `data`. El serializador nativo de Playwright para el modo
`multipart` devolvía `400` con respuesta HTML antes de llegar al controlador en
algunos entornos Windows/Docker; el body manual permite que `FileInterceptor` +
Multer reciban el archivo y lleguen al handler, devolviendo el JSON de negocio
esperado (`202` o el error de dominio correspondiente).

### Estado final del carril R4.1

- Infraestructura E2E reproducible y aislada.
- Bucket MinIO E2E bootstrap correcto tras limpieza de volúmenes.
- API E2E siempre arranca limpia; sin reutilización accidental.
- El E2E vertical queda cableado como job `execution-orders-e2e` en
  `.github/workflows/ci.yml` (línea 282), donde no coexisten `pnpm dev` ni otro
  proceso en `:3000`.
- Para ejecución local es necesario detener cualquier proceso en `:3000` antes de
  invocar el provisionador.
