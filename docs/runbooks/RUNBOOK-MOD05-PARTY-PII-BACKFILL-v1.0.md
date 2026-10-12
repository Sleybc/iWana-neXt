# Runbook — MOD05 Party PII: migración y backfill por tenant

**Versión:** 1.0  
**Fecha:** 2026-10-12  
**Propósito:** Procedimiento operativo para cumplir G7 antes de habilitar el código B5.  
**Estado:** Revisable por `sec-eng`; no autoriza por sí solo una ventana productiva.  
**Referencias:** [Plan de remediación MOD05 v1.3](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md) · [PROMPT v1.3, §1 B13](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.3.md) · [Informe B1](../informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B1-v1.0.md) · [Informe B7, B7-02](../informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B7-v1.0.md) · [Rotación de claves](RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md) · [Restore por tenant](RUNBOOK-RELEASE-ROLLBACK-v1.0.md#62-backup-por-tenant)

## 1. Alcance y reglas de parada

Este procedimiento expande el esquema de cada tenant con la migración 143, calcula los HMAC y cifra los datos históricos con el CLI `backfill:party-pii`, y habilita B5 en el mismo release solo tras verificar los resultados. No fusiona identidades: los candidatos requieren resolución humana.

El flujo es por tenant: backup restaurable → migración 143 → dry-run → resolución humana → `--apply` → verificación de conteos → despliegue de B5. El runner existente de migraciones tenant no admite seleccionar un schema: `migration:tenant:run` procesa **todos los tenants `ACTIVE`** y todas sus migraciones pendientes, de manera secuencial. El backfill, en cambio, recibe un único tenant por invocación. El runner no es atómico entre tenants; si alguno falla, puede haber aplicado la 143 a otros. Por ello, inventariar y respaldar la flota antes de migrar y comprobar el registro 143 por schema.

Abortar el tenant y detener la promoción del release cuando ocurra cualquiera de estos casos:

- El backup no tiene dump y sidecar correlacionados, checksum, o no pasa el ensayo de restore aislado requerido por el procedimiento de release.
- La migración 143 falla, presenta duplicados de expediente, o el inventario de migraciones queda desigual entre tenants `ACTIVE`.
- El dry-run informa candidatos de fusión, fallos, `blockedReason` distinto de `null`, o no se puede explicar un `NODATA` reportado.
- `--apply` termina con error, `applied` no es `true`, o los conteos finales no son cero.
- Las claves de cifrado/HMAC no están disponibles o existe una rotación concurrente sin una ventana coordinada conforme a ADR-058.

No se continúa por omisión manual, actualización directa de filas ni selección de una identidad canónica por script. Conservar evidencia operativa sanitizada; no publicar documentos, nombres, teléfonos, direcciones, ciphertext, claves, credenciales ni dumps en Git, tickets abiertos o logs compartidos.

## 2. Precondiciones

1. Tener ventana, aprobación del owner del entorno y plan de reversión conforme al runbook de release. En producción, confirmar el go/no-go del CTO requerido por los procedimientos vigentes. G7 sigue NO-GO hasta concluir este runbook en todos los tenants aplicables.
2. Fijar el SHA y artefacto que contienen migración 143, CLI B1 y código B5; identificar release, operador, base y todos los tenants. El inventario autoritativo sale de `public.tenants`; no construir schemas a partir de slugs.
3. Ejecutar el proceso tenant en estado `ACTIVE`, pues el backfill solo acepta tenants activos. Inventariar también tenants no activos: no reactivarlos para eludir la guarda del CLI. Su situación debe resolverse por el owner del ciclo de vida y no se puede declarar completa la contracción mientras quede algún tenant sin evidencia de backfill.
4. Confirmar que `MFA_ENCRYPTION_KEY` (AES-256-GCM) y `PII_HASH_KEY` están configuradas en el secret store del entorno, válidas y no débiles; mantenerlas fuera de argumentos de CLI, logs y repositorio. `MFA_ENCRYPTION_KEY_PREVIOUS` se mantiene solo si la ventana de doble lectura de ADR-058 lo requiere.
5. No generar ni rotar `MFA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY_PREVIOUS` o `PII_HASH_KEY` como parte de este backfill. `PII_HASH_KEY` es independiente de la clave AES y su rotación requiere recalcular todas las columnas `*_hmac`; no mezclarla con B13. Si hay una rotación ADR-058 en curso, coordinar primero la secuencia y la versión activa/previous con PLAT-OPS y SEC-ENG. Nunca retirar `MFA_ENCRYPTION_KEY_PREVIOUS` antes de que el recifrado ADR-058 haya pasado su verificación al 100 % con `--verify-active-only`.
6. En el checkout/artefacto de release, compilar las herramientas que usan `dist/`:

   ```bash
   pnpm --filter @iwana/db build
   pnpm --filter @iwana/api build
   ```

   La conexión a PostgreSQL debe tomar sus credenciales del secret store o `.pgpass`; no poner contraseñas en la línea de comandos.

## 3. Inventario y backup verificable por tenant

Registrar para cada tenant el UUID, slug, `schema_name`, estado, artefactos de backup, checksum, SHA de release y estado final de cada gate. El schema solo se obtiene de la fila de `public.tenants` y se valida con el patrón operativo `^tenant_[a-z][a-z0-9_]{0,54}$`.

Antes de la migración, generar un backup por tenant usando la herramienta versionada. La opción `--tenant` recibe UUID o slug, no schema:

```bash
pnpm db:backup:tenant --tenant=<uuid-o-slug>
```

El comando debe terminar en código 0 y producir juntos `<schema>-<utc>.dump` y `<schema>-<utc>.tenant.json`; el sidecar contiene el registro de tenant y el SHA-256 del dump. Guardar ambos fuera del repositorio y bajo el control de acceso/retención del entorno. Un archivo existente, dump parcial, sidecar ausente o error de `pg_dump` no es un backup válido.

Un backup se considera **verificado** solo después de restaurarlo en una base aislada, con dump y sidecar juntos, y confirmar el resumen sanitizado del restore. Seguir [RUNBOOK-RELEASE-ROLLBACK §6.3](RUNBOOK-RELEASE-ROLLBACK-v1.0.md#63-restore-y-criterios-de-evidencia); el comando de ensayo es:

```bash
pnpm db:restore:tenant --file=<ruta-al-dump.dump> --into=<base-aislada>
```

La base destino debe ser distinta de `DB_NAME`; no añadir `--force-same-database`. Este restore de ensayo no sustituye el backup global compatible ni la evidencia de restore requerida por el entorno. El dump por tenant no incluye por sí solo `public.tenants`; el sidecar es parte inseparable del artefacto.

**GO del paso:** backup y restore aislado verificados para cada tenant que se procesará; existe además el backup global compatible requerido por el plan de recuperación. Si no se puede demostrar restore, no migrar.

## 4. Migración tenant 143

Revisar que el inventario `ACTIVE` y sus backups estén completos. La migración 143 ejecuta primero un preflight de hasta 50 grupos con más de un Subscriber no eliminado por `expediente_id`; si encuentra duplicados, aborta antes de su DDL con IDs y conteos para resolverlos manualmente. No iniciar el backfill de ese tenant ni desplegar B5 hasta resolver la causa con el dueño del dato y obtener un nuevo resultado sin duplicados.

El comando soportado es global para los tenants activos y procesa todas las migraciones tenant pendientes; no existe un argumento de schema ni una opción para limitarlo a la 143:

```bash
pnpm --filter @iwana/db migration:tenant:run
```

Revisar salida/código de salida y la comprobación de paridad que realiza el runner. Para cada schema `ACTIVE`, verificar que `typeorm_migrations` contiene exactamente el registro `AddSubscriberPartyPiiHmac1430000000000`. Consulta de verificación, usando el nombre de schema obtenido y validado desde `public.tenants`:

```sql
SELECT name
FROM tenant_schema_verificado.typeorm_migrations
WHERE name = 'AddSubscriberPartyPiiHmac1430000000';
```

El resultado esperado es una fila por tenant procesado. La migración 143 no cifra ni calcula HMAC de las filas existentes. Un fallo del runner puede dejar la 143 aplicada en unos schemas y pendiente en otros: detener la promoción, registrar el estado por schema, no ejecutar `--apply` ni B5 en una flota desigual. Corregir duplicados/errores y rerun del migrador, o seguir §8 para revertir schemas ya expandidos antes de cualquier `--apply`.

**GO del paso:** código 0 y registro 143 presente en todos los tenants `ACTIVE` inventariados; resolver expresamente todo tenant no activo. No inferir éxito por el resultado de un solo schema.

## 5. Dry-run y resolución humana

Ejecutar una vez por UUID o slug de tenant. El modo por defecto también es dry-run, pero especificar la bandera deja evidencia inequívoca:

```bash
pnpm --filter @iwana/api backfill:party-pii -- --tenant=<uuid-o-slug> --dry-run
```

El reporte JSON incluye modo, contadores, `mergeCandidates`, `failures`, `applied` y `blockedReason`; no imprime valores personales. Para autorizar el paso siguiente, comprobar:

- `mode` es `dry-run` y `applied` es `false`;
- `mergeCandidates` es `[]` y `failures` es `[]`;
- `blockedReason` es `null`;
- los conteos pendientes son coherentes con el inventario y los registros legados de ese tenant.

Si hay candidatos, pausar ese tenant. Una persona con autoridad de datos debe revisar los IDs opacos a través del flujo interno autorizado, resolver cada caso y dejar constancia restringida de la decisión. No hacer merge automático ni convertir este reporte en una autorización para elegir canónico. Después de la resolución, repetir dry-run hasta que no queden candidatos.

Si hay fallos (por ejemplo, documento ilegible, tipo no soportado o contacto ilegible), no ignorarlos ni forzar `--apply`. Derivar el código estable y el ID opaco al dueño técnico; resolver la fuente por un procedimiento autorizado y repetir dry-run. Si el CLI reporta `noDataValues`, verificar que corresponden únicamente a Party con documento `NODATA-*`, que son la excepción explícita del conteo HMAC. `party_contact` con `value_encrypted IS NULL` no tiene excepción en este runbook: cualquier contacto NODATA que impida satisfacer el conteo final bloquea el tenant y requiere decisión de producto/ingeniería antes de continuar.

**GO del paso:** informe dry-run guardado en el repositorio operativo restringido, sin datos personales; todos los bloqueos resueltos y una nueva corrida limpia. La aprobación humana se registra por tenant y operador.

## 6. Aplicación y verificación por conteo

Solo después del GO humano del dry-run, ejecutar `--apply` para un único tenant:

```bash
pnpm --filter @iwana/api backfill:party-pii -- --tenant=<uuid-o-slug> --apply
```

El CLI bloquea la escritura cuando quedan candidatos o fallos. Revisar el código de salida y el reporte: `mode` debe ser `apply`, `applied` debe ser `true`, `mergeCandidates` y `failures` vacíos, y `blockedReason` nulo. Si no se cumple, detener el rollout; no despachar B5 para ese tenant. No redirigir stdout/stderr a ubicaciones compartidas sin control de acceso.

Conectar con el rol autorizado de operaciones usando credenciales fuera de la línea de comandos. En cada tenant ejecutar los conteos siguientes con `SCHEMA_NAME` asignado exclusivamente al `schema_name` verificado de `public.tenants` (regex indicado en §3). En `psql`, el identificador `:"schema_name"` se cita como identificador SQL:

```bash
psql --host "$DB_HOST" --port "$DB_PORT" --username "$DB_BOOTSTRAP_USER" \
  --dbname "$DB_NAME" -v ON_ERROR_STOP=1 -v schema_name="$SCHEMA_NAME" <<'SQL'
SELECT COUNT(*) AS party_document_hmac_missing
  FROM :"schema_name".party
 WHERE document_number_hmac IS NULL
   AND (document_number IS NULL OR document_number NOT LIKE 'NODATA-%');

SELECT COUNT(*) AS party_contact_value_encrypted_missing
  FROM :"schema_name".party_contact
 WHERE value_encrypted IS NULL;
SQL
```

Resultados esperados, exactamente: `party_document_hmac_missing = 0` para filas fuera de `NODATA-*`; `party_contact_value_encrypted_missing = 0` para todas las filas de contacto. No relajar estas condiciones ni excluir filas borradas: la condición acordada del gate solo exceptúa `NODATA-*` para Party. Si cualquier conteo no es cero, bloquear tenant/release y escalar; no editar la fila o la evidencia para forzar el pase.

Archivar solo: ID/slug/schema del tenant, SHA del release, timestamp/operador, código de salida, reporte sanitizado, SQL de conteos y valores agregados. No archivar consultas que impriman filas o PII.

## 7. Despliegue de B5 en el mismo release

Cuando todos los tenants activos tengan respaldo verificado, registro 143, dry-run limpio, `--apply` completado y ambos conteos en cero, coordinar el despliegue de B5 **en el mismo release/change window** de esta expansión. B5 no debe recibir tráfico antes de esos resultados. No declarar G7 completado hasta cubrir también los tenants no activos conforme al ciclo de vida autorizado y guardar evidencia por tenant.

Si un tenant queda pendiente, detener la promoción de B5 y conservar compatibilidad de lectura/escritura durante la ventana de expansión. El estado pendiente debe aparecer en la lista de tenants del release; no marcarlo como excepción implícita.

## 8. Rollback

### 8.1 Antes de `--apply`

Solo si no se ejecutó `--apply` en ese schema, se permite revertir la migración 143. El comando de revert afecta a la última migración aplicada de un schema, por lo que primero hacer dry-run e inspeccionar que el único paso previsto sea la 143:

```bash
pnpm --filter @iwana/db migration:tenant:revert -- --schema="$SCHEMA_NAME" --dry-run
```

Si no muestra `AddSubscriberPartyPiiHmac1430000000000` como migración a revertir, detenerse: no incrementar `--steps` ni revertir migraciones posteriores como atajo. Si el plan confirma la 143, hacer el revert interactivo tecleando el nombre exacto del schema:

```bash
pnpm --filter @iwana/db migration:tenant:revert -- --schema="$SCHEMA_NAME"
```

En ejecución sin TTY, `--yes` es obligatorio y solo se añade después de verificar el mismo dry-run:

```bash
pnpm --filter @iwana/db migration:tenant:revert -- --schema="$SCHEMA_NAME" --yes
```

Repetir por cada schema donde la 143 esté aplicada y que aún no haya recibido `--apply`. Después confirmar el registro de migraciones y el estado de índices/columnas mediante el runbook del cambio. No ejecutar el revert en paralelo con migraciones.

### 8.2 Después de `--apply`

**No ejecutar `down()` de la 143.** El backfill ya transformó filas; `down()` elimina columnas cifradas/HMAC y no restaura el contenido original. La reversión es restaurar el backup verificado previo al cambio, siguiendo [RUNBOOK-RELEASE-ROLLBACK §6.3](RUNBOOK-RELEASE-ROLLBACK-v1.0.md#63-restore-y-criterios-de-evidencia), con bloqueo de escrituras del tenant, ventana y autorización que exija el entorno/CTO. El comando `db:restore:tenant` aborta si el schema existe; para producción usar el procedimiento gobernado de reemplazo de schema de §6.3. No improvisar `DROP SCHEMA ... CASCADE` ni restaurar sobre el único origen sin autorización explícita.

Restaurar cada tenant afectado desde sus artefactos emparejados y un backup global compatible cuando sea necesario. Tras restore, re-aplicar grants de runtime y ejecutar los checks de §6.3. Conservar evidencia de tenant/base, checksum, operador y validación, sin filas de negocio ni secretos.

## 9. Contracción posterior de plaintext

El retiro de `party_contact.value` y `subscribers.whatsapp` en claro **no forma parte** de la migración 143 ni de este release de expansión. Será una migración tenant separada, versionada, reversible según el patrón del repo y acompañada por su propia ventana de despliegue.

Criterio de entrada obligatorio: `--apply` completado y conteos aprobados en **todos los tenants**, no solo en los activos que aparecen en una corrida del migrador; todos los tenants no activos deben tener estado resuelto y evidencia antes de declarar la flota completa. Además, demostrar que ningún código desplegado lee o escribe esas columnas, revisar el plan de rollback y obtener el GO de seguridad/operaciones. Si cualquier tenant sigue pendiente, la contracción es NO-GO. No retirar columnas ni mezclar esta contracción con una rotación de claves ADR-058.

## 10. Evidencia y referencias de implementación

Registrar por tenant un checklist con: backup dump+sidecar+SHA y restore aislado; código de salida del runner y fila de migración 143; JSON del dry-run; aprobación de resolución humana cuando aplique; JSON de `--apply`; conteos finales; SHA/ventana del despliegue B5; y resultado del smoke de lectura/escritura autorizado. Los reportes deben ser agregados y sanitizados.

Comportamiento que fija los comandos del runbook: `packages/database/src/cli/tenant-migrate.ts` (migrador de todos los tenants `ACTIVE`), `packages/database/src/cli/tenant-revert.ts` (revert de una migración por schema), `packages/database/src/migrations/tenant/143_subscriber_party_pii_hmac.ts` (preflight de duplicados y DDL), `apps/api/src/cli/backfill-party-pii.ts` (dry-run predeterminado, un tenant `ACTIVE`, bloquea candidatos/fallos) y `scripts/db/backup-tenant.mjs` / `restore-tenant.mjs` (artefactos tenant y ensayo de restore).
