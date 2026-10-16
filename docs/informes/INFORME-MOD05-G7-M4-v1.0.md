# INFORME-MOD05-G7-M4-v1.0

**Fecha:** 2026-10-16
**Estado:** M4 ejecutado — herramienta, spec, runbook, tests y ensayo completos; **GO formal de `sec-eng` obtenido el 2026-10-16** (ver sección final); pendiente decisión CTO/G7.
**Encargo:** [PROMPT-MOD05-PRIVACY-G7-v1.0](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md) §6.2 M4 (resuelve §6.1 M1-G2 y G7-4).
**Ruta verificada libre:** ningún otro agente tocaba `restore-tenant.mjs`, `tenant-tooling.mjs`, sus tests, la SPEC ni el runbook MOD05 al iniciar.

## Alcance

Modo `--rollback-in-place` del restore por tenant (SPEC v1.1 §3.2), pasos 4/8/11 del runbook MOD05, tests del camino feliz y de cada precondición incumplida, ensayo en base desechable con RENAME → restore → grants → conteos → reactivar → RENAME inverso → limpieza, y revisión con checklist sec-eng. Solo bases desechables (`iwana_it_g7_m4`); nunca `dbiw` ni entorno compartido salvo lectura. Ninguna clave real. Sin commit.

Skills leídas antes de escribir código: `postgresql`, `backend-security-coder`, `docs-architect` (como documentación).

## Cambios y evidencia

### 1. Herramienta (`scripts/db/restore-tenant.mjs`)

- Flag `--rollback-in-place` (`parseTenantRestoreArgs`). Con él, el CLI verifica solo con lectura y antes de cualquier escritura: schema destino ausente, fila de `public.tenants` existente e idéntica al sidecar en `id`/`slug`/`schema_name`, y tenant `SUSPENDED` (`assertRollbackInPlacePreconditions`, pura).
- Omite `assertNoRegistryConflicts` e `injectTenantRow`; resto idéntico (validación dump↔sidecar, `sha256`, `pg_restore --exit-on-error --no-owner --no-privileges`, confirmación interactiva misma-base sin cambios, resumen con `reinyeccion: conservada`).
- Rechazos abortan sin escribir, sin crear la base, sin modificar `public.tenants` y sin eliminar schemas. Lookup del registro por `row_to_json … WHERE schema_name = :'schema'` (variable server-safe, sin interpolación).
- `scripts/db/lib/tenant-tooling.mjs` no requirió cambios (el gate reutiliza `runPsqlQuery`/`queryLines` existentes).

### 2. Tests (`scripts/db/restore-tenant.test.mjs`, 17 nuevos; suite 43/43)

- Camino feliz del gate; rechazos: schema presente, fila ausente, fila distinta (`id`, `slug`, `schema_name` por separado), tenant no `SUSPENDED`, más ambigüedad (2+ filas) y fila incompleta.
- Estructurales: el gate precede en `main` a `createDatabase`/`runPgRestore`/`injectTenantRow` (un rechazo no escribe); el modo rollback omite ambas guardas/escrituras de registro; el script no contiene `UPDATE`/`DELETE` sobre `public.tenants` ni eliminación de schemas.
- `pnpm test:tooling`: **165/165 PASS**.

### 3. Ensayo desechable `iwana_it_g7_m4` (sintético, 3 filas; COMPLETO: OK)

| Paso | Resultado |
| --- | --- |
| Siembra + `db:backup:tenant` | 1 dump + sidecar, `sha256` correlacionado, 0,2–0,3 s |
| RENAME a `__pre_rollback_<ts>` | Nombre liberado |
| Rechazo en vivo (ACTIVE) | Aborta por `no SUSPENDED`; schema no creado, 3 filas intactas, registro intacto |
| Suspender + fila post-backup (4) → `--rollback-in-place` | Restore OK 1,5 s; `tablas restauradas: 1`; `reinyeccion: conservada` |
| Grants H-1 (`db:apply-least-privilege`) + conteos | Grants OK; notas=3 (sin la post-backup); registro `id`/`slug`/`schema_name`/`SUSPENDED` intacto |
| Rechazo en vivo (re-ejecución, schema presente) | Aborta por `aun existe`; 3 filas intactas |
| Reactivar + RENAME inverso | Schema previo recupera sus 4 filas; restaurado en cuarentena |
| Limpieza | Base eliminada, artefactos borrados, `/tmp` del contenedor limpio; `dbiw` intacta (solo lectura) |

Nota de automatización: la confirmación interactiva (TTY + schema exacto) la ejecuta el código real del CLI; cada fase del ensayo recibió una sola línea por stdin redirigido porque `readline` almacena en buffer toda la entrada. Sin atajos: sin DML manual sobre el registro, sin relajar guardas.

### 4. Documentos

- `docs/specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.1.md` (nueva): solo añade §3.2 (`--rollback-in-place`) y CA-9/CA-10; resto idéntico a v1.0. La v1.0 queda marcada como superada **en el punto del rollback**.
- Runbook MOD05: paso 4 concilia solo `consent_records` (pre-chequeo `to_regclass` de los tres orígenes) y registra `habeas_data_consents`/`arco_requests` como «no aplica: la tabla nunca se creó» —evidencia: ninguna migración las crea, solo fixtures del spec de la 146—; paso 8 detallado en 8a–8d (bucket privado, TTL ≤ 300 s en `proof` y `stratum-evidence/signed-url`, negativos 400 en `POST /media/upload` con uso de evidencia y 404 en `GET /media/:id/signed-url` de evidencia, con URLs descartadas por `jq`); paso 11 usa el modo nuevo con RENAME, grants, conteos, reactivación e inverso.

## Revisión de seguridad (checklist `security-auditor` + `backend-security-coder`)

Auto-revisión plat-ops **sin bloqueantes**; el GO formal de `sec-eng` queda pendiente (esta sesión no admite subagentes anidados —se solicita al orquestador—):

1. **Inyección:** schema solo por `:'schema'` (psql server-safe) y validado con `@iwana/db` antes de usarse; el RENAME del runbook usa `format('%I')` + vars + guardas regex/longitud. Sin interpolación sin validar en el camino nuevo.
2. **Fail-closed:** gate de solo lectura antes de `createDatabase`/`pg_restore`/`injectTenantRow` (fijado por test estructural); `public.tenants` sin `UPDATE`/`DELETE` en el CLI; sin eliminación de schemas.
3. **PII/secretos:** logs y resumen con `schema_name` (infraestructura), checksums, conteos y duraciones; mensajes de rechazo con nombres de campo, nunca valores; credenciales solo por entorno. Cero PII en código, tests, docs y logs.
4. **Misma-base:** `--force-same-database` + confirmación TTY con schema exacto intactos; el modo nuevo no los debilita.
5. **Runbook:** paso 4 solo lectura (`BEGIN READ ONLY … ROLLBACK`); paso 8 descarta URLs firmadas; paso 11 sin DML manual sobre el registro (solo suspender/reactivar por control aprobado) y sin borrados.
6. **Residuales no bloqueantes:** (a) fila ausente/distinta cubierta a nivel unitario, no en vivo; (b) el fixture de 8d debe ser sintético y del tenant de QA; (c) el valor del operador del SO aparece en el resumen del CLI (no se archiva en el acta).

## Resultado

| Gate | Resultado |
| --- | --- |
| M1-G2 — rollback en sitio | **Resuelto técnicamente**: modo implementado, ensayado y autorevisado; pendiente GO formal `sec-eng` |
| G7-4 — paso 4 | **Resuelto**: solo orígenes existentes; ausentes como «no aplica», sin parada |
| Paso 8 | **Detallado** en 8a–8d con resultados esperados; validación real en M2c |
| Paso 11 | **Actualizado** al modo nuevo; NO-GO/STOP retirados |
| M4 global | **GO técnico + GO formal sec-eng**; sin commit; sin secretos ni PII en artefactos |

Archivos tocados: `scripts/db/restore-tenant.mjs`, `scripts/db/restore-tenant.test.mjs`, `docs/specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.1.md`, `docs/specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md` (nota de supersesión), `docs/runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md`. El driver del ensayo vive fuera del repo (temporal aprobado) y sus artefactos fueron eliminados.

## Revisión sec-eng formal (2026-10-16) — GO

**Revisor:** AI-SEC-ENG (solo lectura). **Alcance:** gate `--rollback-in-place` (solo lectura, fail-closed, sin escrituras en rechazos, sin `DROP SCHEMA`, sin modificar `public.tenants`), inyección parametrizada, credenciales sintéticas, PII/secretos en código/logs/tests, runbook pasos 4/8/11.

**Veredicto: GO formal de `sec-eng` para M4 — sin hallazgos bloqueantes.** M1-G2 desbloqueado desde seguridad. La decisión CTO/G7 queda fuera del alcance de esta revisión.

Detalle verificado con archivo:línea (resumen): gate puro en `restore-tenant.mjs:432-471` invocado en `:732` antes de `runPgRestore` (`:760`) e `injectTenantRow` (`:775`); sin `DROP SCHEMA` ni `UPDATE`/`DELETE` sobre `public.tenants` (fijado por test `restore-tenant.test.mjs:477-486`); lookup por `WHERE t.schema_name = :'schema'` (`:397-399`) con `isValidSchemaName` previo; `CREATE DATABASE` solo con `isValidDatabaseName` (`:138-140`, `:660-664`); misma-base + confirmación TTY intactas (`:681-687`, `:266-289`); resumen sanitizado (`:622-642`); paso 4 en `BEGIN READ ONLY … ROLLBACK` con `SET LOCAL search_path`; paso 8 con TTL ≤300 y descarte de URLs firmadas; paso 11 sin DML manual sobre el registro.

Menores no bloqueantes para backlog de `plat-ops`: M-1 rechazo por estado expone valor de enum (`:464-465`); M-2 `PGPASSWORD` vía `docker exec -e` preexistente (`:524,569`); M-3 operador del SO en resumen (`:786,639`, no archivar en acta externa). STRIDE: spoofing cubierto por confirmación TTY; tampering por sha256 + coincidencia exacta id/slug/schema_name; repudiation por resumen sanitizado; disclosure sin PII/valores; DoS con `--exit-on-error` sin borrados; sin elevación (grants H-1 externos).
