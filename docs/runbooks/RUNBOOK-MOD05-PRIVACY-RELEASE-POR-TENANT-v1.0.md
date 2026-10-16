# Runbook — Release MOD05 + privacidad por tenant

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Estado:** M4 aplicado (pasos 4, 8 y 11): `--rollback-in-place` implementado, ensayado en base desechable y autorevisado con checklist sec-eng sin bloqueantes; pendiente GO formal de `sec-eng` y decisión CTO/G7
**Propósito:** Secuenciar el release MOD05 + `privacy` por tenant, con artefactos versionados y rollback explícito.
**Autoridad:** AI-PLAT-OPS opera; `sec-eng` revisa controles; AI-EM-ARCH recomienda y el CTO aprueba el G7 y la ventana. Este runbook no concede G7 ni autoriza producción.

**Fuentes:** [Plan MOD05 + privacy camino a G7, §2](../plans/2026-10-15-mod05-privacy-g7-release.md) · [Prompt G7, §2 C-M1](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md) · [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) · [ADR-094 §D7](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md).

**Integra sin duplicar:** [backfill Party B13](RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md) · [bloqueo y supresión manual](RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md) · [release y rollback](RUNBOOK-RELEASE-ROLLBACK-v1.0.md) · [Media/MinIO](RUNBOOK-MEDIA-MINIO-v1.0.md) · [rotación de claves](RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md).

> **Estado de plataforma:** el G7 de estas fases depende del G7 de plataforma. Las decisiones de producción, dominio/TLS y los ensayos de restore/rollback descritos en el plan siguen siendo gates separados. No usar este runbook para procesar PII real mientras esas condiciones estén pendientes.

## Reglas de operación

- Este flujo escribe datos y contiene datos personales en sus backups. El operador usa únicamente el secret store aprobado, guarda dumps y evidencia en almacenamiento restringido fuera del repositorio y registra resultados agregados. No se copian PII, ciphertexts, tokens, claves, URLs firmadas ni filas de negocio a logs o informes.
- El operador resuelve `TENANT_REF` como UUID o slug desde el registro aprobado; los CLIs resuelven `schema_name` desde `public.tenants`. No derivar schemas de slugs ni ejecutar SQL sin `SET LOCAL search_path` dentro de una transacción.
- La ventana es **de flota** para la preparación y migraciones: el preflight, backup global, backup de todos los tenants `ACTIVE` y runner de migraciones se ejecutan una sola vez. Los pasos 3–10 se completan en orden para cada tenant inventariado, de uno en uno. El runner tenant no admite limitarse a un schema.
- El rollback se decide conforme a §11 y al [runbook release/rollback](RUNBOOK-RELEASE-ROLLBACK-v1.0.md). No improvisar `down()`, `DROP SCHEMA ... CASCADE`, borrar objetos de Media ni restaurar sobre el origen sin aprobación expresa.
- Antes de cada acción mutante, validar el tenant y el destino dos veces contra el acta de ventana. No usar `--yes` salvo cuando el paso documenta una confirmación aprobada.

## Variables operativas

Los siguientes nombres son marcadores, no valores. Cargarlos en la sesión desde el secret store o el perfil protegido del operador; no escribir credenciales en argumentos, historial, Compose ni evidencia.

| Variable                                                                                    | Contenido                                                                                                 |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `RELEASE_ID`                                                                                | Identificador aprobado de la ventana                                                                      |
| `TENANT_REF`                                                                                | UUID o slug verificado del tenant                                                                         |
| `TENANT_INVENTORY`                                                                          | Archivo externo restringido, una fila por UUID de cada tenant `ACTIVE` aprobado para esta ventana         |
| `TENANT_SCHEMA`                                                                             | `schema_name` leído de `public.tenants`, validado contra `^tenant_[a-z][a-z0-9_]{0,54}$`                  |
| `SECURE_BACKUP_DIR`                                                                         | Destino cifrado y restringido fuera del repositorio                                                       |
| `GLOBAL_DUMP`, `TENANT_DUMP`                                                                | Rutas correlacionadas registradas en el acta, con sidecar tenant cuando aplique                           |
| `TENANT_DUMP_MANIFEST`                                                                      | Archivo externo restringido con una ruta de dump tenant por cada UUID del inventario                      |
| `RESTORE_DB_GLOBAL`, `RESTORE_DB_TENANT`                                                    | Bases desechables, distintas de la base origen                                                            |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, roles `DB_BOOTSTRAP_USER`/`DB_MIGRATOR_USER`/`DB_APP_USER` | Conexión cargada desde el secret store/perfil autorizado; nunca pasar contraseñas como argumentos         |
| `API_BASE_URL`                                                                              | URL HTTPS aprobada del API                                                                                |
| `ADMIN_CURL_CONFIG`, `OFFICER_CURL_CONFIG`                                                  | Archivos `curl` protegidos fuera del repo; contienen encabezados de autenticación/tenant y no se imprimen |
| `AUTHORIZATION_JSON`                                                                        | Archivo fuera del repo con el texto legal aprobado, versión y tipo `AUTORIZACION`                         |
| `MC_CONFIG_DIR`, `MC_ALIAS`, `S3_BUCKET`                                                    | Configuración protegida del cliente MinIO/S3 y bucket activo                                              |
| `SYNTHETIC_PARTY_ID`, `SYNTHETIC_AUTHORIZATION_ID`, `SYNTHETIC_CONTRACT_ID`   | IDs sintéticos del tenant de QA para el paso 8; fuera del repo, nunca completos en el acta                 |
| `SYNTHETIC_EVIDENCE_MEDIA_ID`, `SYNTHETIC_UPLOAD_FIXTURE`                     | Asset de evidencia y archivo fixture sintético para las comprobaciones negativas 8d; fuera del repo        |

## Pasos de ventana

Cada paso conserva su propia evidencia, parada y rollback. Ejecutar los pasos 0, 1 y 2 una sola vez para toda la flota aprobada. Después, por cada UUID del inventario, ejecutar en orden los pasos 3–10 y completar el paso 11 al cerrar la ventana.

### Paso 0 — Preflight y autoridad

**Comandos exactos:**

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml config --quiet
git rev-parse --verify HEAD
psql --host "$DB_HOST" --port "$DB_PORT" --username "$DB_APP_USER" \
  --dbname "$DB_NAME" -X -v ON_ERROR_STOP=1 -At \
  -c "SELECT id::text FROM public.tenants WHERE status = 'ACTIVE' ORDER BY id" \
  > "$TENANT_INVENTORY"
```

`config --quiet` no debe imprimir la configuración expandida. El inventario contiene solo UUID de tenant, vive fuera del repo y se coteja con la lista aprobada de la ventana; no agregar tenants después de aplicar migraciones. Registrar solo su conteo/checksum junto con el código de salida, SHA, digests/etiquetas aprobados y versiones de migración. Adjuntar fuera del repositorio: G7 de plataforma aprobado, go de CTO para esta ventana, plan RPO/RTO/rollback, evaluación contable de ADR-093/M03, dictamen jurídico de ADR-094 §7.3, Oficial de privacidad designado por el ISP y texto de autorización aprobado. Confirmar K1/K2 y la revisión de seguridad sin bloqueantes.

**Evidencia sin PII:** SHA y digests; resultado booleano de cada precondición y referencia controlada a cada aprobación. No guardar `.env.production`, tokens ni texto de autorización en el acta.

**Parada:** cualquier decisión, dictamen, backup/restore previo, gate K, responsable, TLS o digest ausente/fallido → `NO-GO`; no iniciar la ventana.

**Rollback:** no hay cambios de datos. Cancelar la ventana y retirar cualquier aviso de mantenimiento que aún no se hubiera activado.

### Paso 1 — Backup global y backup de toda la flota con restore aislado

**Comandos exactos:** el acceso a la base usa credenciales del secret store; `BACKUP_DIR` apunta fuera del repo.

```bash
BACKUP_DIR="$SECURE_BACKUP_DIR/$RELEASE_ID" pnpm db:backup
while IFS= read -r TENANT_REF; do
  [ -n "$TENANT_REF" ] || continue
  BACKUP_DIR="$SECURE_BACKUP_DIR/$RELEASE_ID" pnpm db:backup:tenant --tenant="$TENANT_REF"
done < "$TENANT_INVENTORY"
```

Registrar en `$TENANT_DUMP_MANIFEST` cada ruta `.dump` informada por el CLI, una por UUID, y comprobar que existe su `.tenant.json`. Después verificar checksums y restores aislados:

```bash
sha256sum "$GLOBAL_DUMP"
pg_restore --list "$GLOBAL_DUMP" > "$GLOBAL_DUMP.toc"
createdb --host "$RESTORE_DB_HOST" --port "$RESTORE_DB_PORT" \
  --username "$RESTORE_ADMIN_USER" "$RESTORE_DB_GLOBAL"
pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname="$RESTORE_DB_GLOBAL" "$GLOBAL_DUMP"
while IFS= read -r TENANT_DUMP; do
  [ -n "$TENANT_DUMP" ] || continue
  sha256sum "$TENANT_DUMP" "${TENANT_DUMP%.dump}.tenant.json"
  pg_restore --list "$TENANT_DUMP" > "$TENANT_DUMP.toc"
  pnpm db:restore:tenant --file="$TENANT_DUMP" --into="$RESTORE_DB_TENANT"
done < "$TENANT_DUMP_MANIFEST"
DB_NAME="$RESTORE_DB_GLOBAL" pnpm db:apply-least-privilege
DB_NAME="$RESTORE_DB_TENANT" pnpm db:apply-least-privilege
```

Completar los checks de restore de [RUNBOOK-RELEASE-ROLLBACK §6.3](RUNBOOK-RELEASE-ROLLBACK-v1.0.md#63-restore-y-criterios-de-evidencia), incluida conexión de runtime, grants y health/smoke aislados. Los destinos son desechables y diferentes de la base origen. El dump global debe cubrir `public` y todos los schemas; cada dump tenant y su `.tenant.json` forman un solo artefacto. La base de ensayo tenant debe conservar los schemas previos mientras restaura cada tenant del manifiesto.

**Evidencia sin PII:** código de salida, SHA-256, duración, identificador de backup, nombre de base de ensayo, conteo de tablas y resultado de grants/health. No adjuntar dumps, sidecars ni filas de negocio al informe.

**Parada:** falta cualquier dump/sidecar del inventario, los conteos de artefactos no coinciden, checksum inválido, restore incompleto, grant ausente, o fallo de health/smoke → no migrar la flota.

**Rollback:** no hay escrituras de release todavía. Mantener intactos los backups, destruir las bases de ensayo por el procedimiento aprobado y cancelar la ventana.

### Paso 2 — Detener escrituras y aplicar migraciones en orden

**Comandos exactos:** con mantenimiento ya activado en el ingress aprobado:

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml stop api-prod worker-prod
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up --abort-on-container-exit \
  --exit-code-from migrator-prod migrator-prod
```

El migrator se ejecuta **una sola vez** y aplica las migraciones públicas pendientes (026 y 027 en este release) y luego las tenant pendientes en el orden explícito del runner, incluidas 143–148. No ejecutar en paralelo `pnpm db:migrate:all` desde otro actor. El runner alcanza toda la flota `ACTIVE`; antes de iniciarlo, cotejar que cada tenant activo esté en `$TENANT_INVENTORY` y tenga backup íntegro. Migración 146 puede informar conteos agregados de filas reconciliadas/no reconciliadas; no ampliar sus logs ni imprimir filas para investigar.

**Evidencia sin PII:** salida sanitizada del migrator, exit code real y presencia/ausencia de cada nombre de migración por esquema en el registro controlado. Registrar únicamente conteos por migración y tenant pseudonimizado en el repositorio restringido.

**Parada:** código distinto de cero, tenant parcial, registro desigual, error de preflight, logs con PII/secreto o falta del cableado de `PII_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY_PREVIOUS` o `PII_DECRYPT_LEGACY_MFA` en el servicio de migración → abortar la promoción de toda la flota y conservar el estado para diagnóstico.

**Rollback:** antes del paso 3, restaurar el backup global previo con el procedimiento de [RUNBOOK-RELEASE-ROLLBACK §5.7 y §6](RUNBOOK-RELEASE-ROLLBACK-v1.0.md). No ejecutar reverts de tenant/públicos por reflejo.

### Ciclo por tenant — pasos 3–10

Tras el paso 2, procesar los UUID de `$TENANT_INVENTORY` en orden, de uno en uno. Para cada UUID resolver `TENANT_REF` y `TENANT_SCHEMA` desde `public.tenants`; ejecutar los pasos 3–10 completos antes de pasar al siguiente. No repetir backup ni migraciones dentro del ciclo. Un fallo o conteo fuera de criterio en cualquier tenant detiene la promoción de toda la flota y conserva los artefactos de diagnóstico.

### Paso 3 — Backfill Party de la migración 143 (B13)

**Comandos exactos:** compilar el artefacto revisado y correr primero dry-run:

```bash
pnpm --filter @iwana/api build
pnpm --filter @iwana/api backfill:party-pii -- --tenant="$TENANT_REF" --dry-run
```

Después de resolver candidatos con el Oficial y dejar su decisión en el registro operativo restringido, aplicar solo con aprobación explícita de la ventana:

```bash
pnpm --filter @iwana/api backfill:party-pii -- --tenant="$TENANT_REF" --apply
```

Seguir íntegramente [RUNBOOK B13 §3–§7](RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md): preflight de migración, decisión humana de candidatos y conteos de verificación. No seleccionar una identidad canónica por script ni actualizar filas manualmente.

**Evidencia sin PII:** modo, `applied`, conteos de candidatos/fallos y conteos de verificación, exit code y referencia de aprobación. La resolución humana no registra nombres, documentos, teléfonos, direcciones ni valores cifrados.

**Parada:** cualquier candidato sin resolución, error, `blockedReason`, `applied` distinto del esperado o conteo final no cero → detener este tenant y promoción.

**Rollback:** después de iniciar este paso no ejecutar `down()` de 143 ni 146. Si el dry-run falla, detener este tenant sin aplicar y mantener las escrituras en mantenimiento. Si se requiere restaurar tras iniciar el paso 3, usar solo el restore tenant de §11; no hacer restore global ni alterar otros tenants.

### Paso 4 — Conciliar las filas heredadas de privacidad de la migración 146

**Precondición (G7-4):** solo `consent_records` puede existir como origen heredado. Ninguna migración crea `habeas_data_consents` ni `arco_requests` —solo aparecen como fixtures de `146_privacy_module.integration.spec.ts`—; ambas se registran como «no aplica: la tabla nunca se creó» y **no** detienen la ventana. Verificarlo antes de conciliar:

```bash
psql --host "$DB_HOST" --port "$DB_PORT" --username "$DB_APP_USER" \
  --dbname "$DB_NAME" -X -v ON_ERROR_STOP=1 -v tenant_schema="$TENANT_SCHEMA" <<'SQL'
BEGIN READ ONLY;
SELECT format('SET LOCAL search_path TO %I', :'tenant_schema') \gexec
SELECT 'consent_records' AS tabla, (to_regclass('consent_records') IS NOT NULL) AS existe
UNION ALL SELECT 'habeas_data_consents', (to_regclass('habeas_data_consents') IS NOT NULL)
UNION ALL SELECT 'arco_requests', (to_regclass('arco_requests') IS NOT NULL);
ROLLBACK;
SQL
```

**Comando exacto de conciliación:** consulta de solo lectura; `TENANT_SCHEMA` debe venir de `public.tenants` y pasar el validador documentado en B13. La conexión se autentica por `.pgpass` o el mecanismo aprobado, nunca por contraseña en argumentos. Solo concilia los orígenes que existen (`consent_records`):

```bash
psql --host "$DB_HOST" --port "$DB_PORT" --username "$DB_APP_USER" \
  --dbname "$DB_NAME" -X -v ON_ERROR_STOP=1 -v tenant_schema="$TENANT_SCHEMA" <<'SQL'
BEGIN READ ONLY;
SELECT format('SET LOCAL search_path TO %I', :'tenant_schema') \gexec
WITH consent_mapped AS (
  SELECT c.id,
         CASE c.consent_type
           WHEN 'TRATAMIENTO_DATOS' THEN 'TRATAMIENTO_CONTRACTUAL'
           WHEN 'CONTACTO_OPERATIVO' THEN 'TRATAMIENTO_CONTRACTUAL'
           WHEN 'CONTACTO_COMERCIAL' THEN 'CONTACTO_COMERCIAL'
           ELSE NULL
         END AS purpose,
         COALESCE(
           (SELECT s.party_id FROM subscribers s
             WHERE s.expediente_id = c.expediente_id AND s.party_id IS NOT NULL
             ORDER BY s.id LIMIT 1),
           (SELECT s.party_id FROM subscribers s
             WHERE s.id = c.prospect_id AND s.party_id IS NOT NULL
             ORDER BY s.id LIMIT 1)
         ) AS party_id
    FROM consent_records c
)
SELECT 'consent_records.sin_party' AS categoria, count(*)::bigint AS filas
  FROM consent_mapped WHERE party_id IS NULL
UNION ALL
SELECT 'consent_records.sin_finalidad', count(*)::bigint
  FROM consent_mapped WHERE purpose IS NULL;
ROLLBACK;
SQL
```

El resultado contiene categorías y conteos solamente. Registrar además, por cada tenant: `habeas_data_consents: no aplica (la tabla nunca se creó)` y `arco_requests: no aplica (la tabla nunca se creó)`, con la evidencia de que ninguna migración las crea. El Oficial resuelve los casos de `consent_records` en el flujo autorizado o deja una decisión operativa explícita antes de continuar; no reparar datos por SQL directo. La migración conserva las filas origen y el runbook no modifica `data_authorizations`, la solicitud ni Billing.

**Evidencia sin PII:** existencia de cada tabla origen, conteos por categoría antes/después y decisión aprobada del Oficial. No extraer IDs ni valores fuente en el acta.

**Parada:** cualquier residuo de `consent_records` sin decisión, finalidad no reconocida, `consent_records` ausente cuando el tenant la requiere, o imposibilidad de explicar los conteos → mantener ventana y escalar a DATA-ENG/SEC-ENG; no avanzar al backfill. La ausencia de `habeas_data_consents`/`arco_requests` no es parada.

**Rollback:** no hay cambios de datos en este paso. Tras migraciones/backfills previos, el retorno se gobierna por §11; no se revierte la 146 para investigar.

### Paso 5 — Limpiar contactos placeholder

**Comandos exactos:**

```bash
pnpm --filter @iwana/api exec node dist/cli/backfill-placeholder-contacts.js \
  --tenant="$TENANT_REF" --dry-run
pnpm --filter @iwana/api exec node dist/cli/backfill-placeholder-contacts.js \
  --tenant="$TENANT_REF" --apply
```

El `--apply` se ejecuta solo después de revisar el dry-run. El CLI se limita a un tenant `ACTIVE`, toma `PII_HASH_KEY` por configuración y reporta conteos; no poner salida cruda en un ticket o log compartido. Revisar en el resultado agregado la cantidad de suscriptores `ACTIVE` sin contacto y entregársela al operador para planificar la comunicación.

**Evidencia sin PII:** modo, exit code, conteos agregados por estado y campos limpiados; sin emails/teléfonos ni hashes.

**Parada:** el dry-run no coincide con el tenant, el conteo `ACTIVE` no se comunica al operador, el CLI falla o la verificación no queda en cero.

**Rollback:** si `--apply` no inició, cancelar el paso. Si aplicó, no reconstruir placeholders ni reinsertar datos; restaurar el tenant con §11 si el negocio autoriza volver al snapshot.

### Paso 6 — Recifrar PII a `PII_ENCRYPTION_KEY` (Frente K2)

**Contrato K2:** `pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --schema=<tenant> [--apply]`; la verificación es `pnpm --filter @iwana/api encryption:reencrypt -- --verify-pii-only --schema=<tenant>`. Ambos modos requieren `--schema` explícito y rechazan `public` antes de abrir la conexión. Resuelven el `schema_name` parametrizado en `public.tenants` sin filtrar por status y exigen fila de tenant registrada y namespace físico existente; cubren cualquier estado retenido, como `ACTIVE`, `INACTIVE`, `SUSPENDED` y `MARKED_FOR_DELETION`. Schema ausente/no registrado falla antes de consultar tablas tenant; tablas u objetivos faltantes impiden completar verify. No ofrecen corrida de flota. MFA general conserva el alcance `ACTIVE`. No reactivar ni cambiar el estado de tenants para el recifrado. `--schema` recibe el `schema_name` validado (`$TENANT_SCHEMA`), no UUID ni slug. El CLI ejecuta `node dist/cli/reencrypt-aes.js`; compilar `@iwana/api` antes de invocarlo. K2Δ retiró los cuatro objetivos sin migración y la integración PostgreSQL quedó actualizada a 17 destinos migrados; véase [informe K2Δ](../informes/INFORME-MOD05-G7-K2-v1.1.md). Los conteos de producción se toman del dry-run de cada tenant, no de este fixture sintético.

**Comandos exactos:** mantener `PII_DECRYPT_LEGACY_MFA=true` durante todo el barrido. Ejecutar por cada schema de tenant registrado, sin importar su estado, conforme a la ventana aprobada; el CLI valida el registro y la existencia del namespace:

```bash
pnpm --filter @iwana/api build
pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --schema="$TENANT_SCHEMA"
pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --apply --schema="$TENANT_SCHEMA"
pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --apply --schema="$TENANT_SCHEMA"
pnpm --filter @iwana/api encryption:reencrypt -- --verify-pii-only --schema="$TENANT_SCHEMA"
```

Revisar el dry-run antes de escribir; la segunda aplicación evidencia idempotencia. Para cada tenant, continuar solo si no hay errores de descifrado, los conteos del verify son cero y la segunda aplicación no recifra filas. La salida operativa solo puede contener modo, schema y conteos agregados; nunca valores, ciphertext, HMAC, claves ni IDs de fila.

**Evidencia sin PII:** salida sanitizada de dry-run/apply/segunda aplicación/verify con conteos por tabla y columna, total de candidatos/recifrados, errores de descifrado y cero filas pendientes de MFA por cada tenant procesado; registrar también versión del artefacto y exit codes. El inventario de verificación debe cubrir todo schema de tenant registrado, sin importar status. Si el schema no existe en el registro o namespace, faltan tablas/objetivos o el verify no termina en cero, conservar `PII_DECRYPT_LEGACY_MFA=true` y escalar. La integración K2Δ usa 17 destinos respaldados por migraciones, con dry-run/apply y verify; no extrapolar esos conteos al tenant de release. El informe K2Δ registra 3 suites/53 pruebas enfocadas y 1 integración PostgreSQL aprobada; véase [K2Δ v1.1](../informes/INFORME-MOD05-G7-K2-v1.1.md). La corrida Turbo API posterior a K2Δ/L1 reporta sus conteos en los informes de esos bloques y no sustituye los conteos por tenant del CLI.

**Parada:** K1/K2 no están aprobados por SEC-ENG para la ventana, clave PII ausente/no separada, bandera legado distinta de `true`, cualquier tenant registrado sin evidencia, error de descifrado, tablas/objetivos ausentes, verify distinto de cero o segunda aplicación no idempotente. No cambiar la bandera a `false` hasta que cada schema tenant registrado, cualquiera que sea su status, tenga verify cero.

**Rollback:** dry-run no modifica. Si una aplicación falla, detener el barrido y conservar ambas familias de clave y `PII_DECRYPT_LEGACY_MFA=true`; obtener conteos/verificación antes de decidir. Ante cambios persistidos con verify incompleto, seguir el restore por tenant de §11 dentro del mecanismo aprobado. Nunca retirar claves previas ni recifrar hacia atrás como atajo.

### Paso 7 — Activar autorización, Oficial y retención

**Publicar el texto autorizado:** el archivo JSON incluye el contenido aprobado y vive fuera del repo; el token y el slug se cargan en `ADMIN_CURL_CONFIG` desde un mecanismo protegido.

```bash
curl --config "$ADMIN_CURL_CONFIG" --fail-with-body --silent --show-error \
  --header 'Content-Type: application/json' \
  --data-binary "@$AUTHORIZATION_JSON" \
  "$API_BASE_URL/api/v1/privacy/legal-texts" |
  jq -e '.data | select(.type == "AUTORIZACION") | {type, version, sha256, isCurrent}'
curl --config "$ADMIN_CURL_CONFIG" --fail-with-body --silent --show-error \
  "$API_BASE_URL/api/v1/privacy/legal-texts/current?type=AUTORIZACION" |
  jq -e '.data | {type, version, sha256, isCurrent}'
```

El Administrador del tenant asigna `privacy.manage` al perfil del Oficial en **Administración → Usuarios → Perfiles de acceso**, preservando los demás perfiles que ya tenía. No usar DML directo ni una llamada de reemplazo con una lista parcial. El Oficial inicia sesión con su configuración protegida y comprueba su permiso efectivo:

```bash
curl --config "$OFFICER_CURL_CONFIG" --fail-with-body --silent --show-error \
  "$API_BASE_URL/api/v1/access-control/me/effective-permissions" |
  jq -e '.data.effectivePermissions | index("privacy.manage") != null'
curl --config "$OFFICER_CURL_CONFIG" --fail-with-body --silent --show-error \
  "$API_BASE_URL/api/v1/privacy/retention-policies" |
  jq -e '[.data[] | {category, years, startEvent, isLegalMinimum}]'
```

El Oficial revisa que las políticas corresponden al catálogo aprobado por ADR-094; solo se alargan por el endpoint aprobado, nunca se acortan por debajo del mínimo legal.

**Evidencia sin PII:** tipo, versión, SHA-256 y estado vigente del texto; `privacy.manage=true`; categorías y plazos de retención; referencias a la aprobación del texto y designación del Oficial. No guardar contenido legal si el ISP lo reserva, tokens ni identidad del usuario en el informe compartido.

**Parada:** falta versión vigente `AUTORIZACION`, API devuelve 422/403, permiso efectivo ausente, oficial no designado o catálogo de retención inconsistente → no abrir captura/conversión ni solicitudes productivas.

**Rollback:** las versiones de texto son inmutables. Si se publica una versión errónea, no borrarla ni sobrescribirla: parar el release, obtener texto corregido aprobado y publicar una versión nueva. Retirar `privacy.manage` solo mediante gestión de perfiles aprobada y dejando el servicio en NO-GO.

### Paso 8 — Bucket privado y URL temporal de Media

**Precondiciones:** IDs sintéticos autorizados del tenant de QA segregado (`SYNTHETIC_PARTY_ID`, `SYNTHETIC_AUTHORIZATION_ID` con evidencia `privacy_evidence`, `SYNTHETIC_CONTRACT_ID` con `stratum_evidence`, y `SYNTHETIC_EVIDENCE_MEDIA_ID` de un asset de evidencia). Viven fuera del repo, en el registro restringido de la ventana; nunca se imprimen completos en el acta (solo su existencia y el resultado).

**8a. Bucket privado.** El servicio de bootstrap crea el bucket configurado y aplica privacidad. El directorio de configuración de `mc` ya debe tener un alias provisionado fuera de la línea de comandos con credenciales del secret store.

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up --abort-on-container-exit \
  --exit-code-from minio-init minio-init
mc --config-dir "$MC_CONFIG_DIR" anonymous get "$MC_ALIAS/$S3_BUCKET"
```

Resultado esperado: acceso `private` (o `none`): ninguna política anónima/pública. Confirmar `S3_BUCKET_PUBLIC=false` y que no exista una base pública/URL pública (`S3_PUBLIC_BASE_URL` vacío o interno) que permita eludir las rutas controladas.

**8b. URL firmada de evidencia de privacidad (TTL ≤ 300 s).** `stratum_evidence` y `privacy_evidence` son usos de Media en el bucket privado; las APIs de evidencia generan URL firmada con máximo 300 s (`media.service.ts`: `generateSignedUrl(..., 300, ...)` en ambos usos). Verificarlo con IDs sintéticos y filtrar la URL antes de guardar la respuesta (el `jq` descarta la URL firmada: es una credencial temporal y no se escribe ni se copia):

```bash
curl --config "$OFFICER_CURL_CONFIG" --fail-with-body --silent --show-error \
  "$API_BASE_URL/api/v1/privacy/parties/$SYNTHETIC_PARTY_ID/authorizations/$SYNTHETIC_AUTHORIZATION_ID/proof" |
  jq -e '
    .data.evidenceUrl as $url |
    if $url == null then {hasEvidence: false}
    else
      ($url | split("?")[1] | split("&") |
        map(select(startswith("X-Amz-Expires="))) | first | split("=")[1] | tonumber) as $ttl |
      if $ttl > 0 and $ttl <= 300 then {hasEvidence: true, ttlSeconds: $ttl}
      else error("TTL fuera del máximo de 300 segundos") end
    end'
```

**8c. URL firmada de `stratum_evidence` (TTL ≤ 300 s).** Mismo criterio sobre el endpoint de contratos:

```bash
curl --config "$ADMIN_CURL_CONFIG" --fail-with-body --silent --show-error \
  "$API_BASE_URL/api/v1/crm/contracts/$SYNTHETIC_CONTRACT_ID/stratum-evidence/signed-url" |
  jq -e '
    .data.signedUrl as $url |
    ($url | split("?")[1] | split("&") |
      map(select(startswith("X-Amz-Expires="))) | first | split("=")[1] | tonumber) as $ttl |
    if $ttl > 0 and $ttl <= 300 then {ttlSeconds: $ttl}
    else error("TTL fuera del máximo de 300 segundos") end'
```

**8d. Endpoints genéricos bloqueados para evidencia.** Los usos de evidencia no se sirven por las rutas genéricas de Media (comportamiento cubierto por specs de integración: `contracts.service.postgres.integration.spec.ts`):

```bash
curl --config "$OFFICER_CURL_CONFIG" --silent --show-error -o /dev/null -w '%{http_code}\n' \
  -F "file=@$SYNTHETIC_UPLOAD_FIXTURE" -F "usage=stratum_evidence" \
  "$API_BASE_URL/api/v1/media/upload"
# esperado: 400 (el endpoint genérico rechaza el uso stratum_evidence)
curl --config "$OFFICER_CURL_CONFIG" --silent --show-error -o /dev/null -w '%{http_code}\n' \
  "$API_BASE_URL/api/v1/media/$SYNTHETIC_EVIDENCE_MEDIA_ID/signed-url"
# esperado: 404 (el signed-url genérico no sirve assets de evidencia)
```

No escribir ni copiar `signedUrl`: es una credencial temporal. El smoke de autorización/Media se hace con IDs sintéticos autorizados; los `jq` anteriores descartan la URL firmada.

**Evidencia sin PII:** resultado `private`, booleanos de configuración, por cada comprobación 8a–8d su PASS/FAIL con código HTTP o expiración calculada ≤300 s; sin claves, URLs, nombres ni contenido de evidencia.

**Parada:** política anónima/pública, acceso genérico a esos usos, URL pública o TTL mayor de 300 s, `S3_PUBLIC_BASE_URL` que publique el asset, error de bootstrap o error de firma, o cualquiera de las dos comprobaciones 8d con código distinto del esperado → NO-GO.

**Rollback:** mantener el bucket privado; revertir solo la configuración versionada/de secret store al valor conocido si fue aprobada, invalidar el despliegue de aplicación y seguir §11 para datos. No hacer bucket público para recuperar acceso.

### Paso 9 — Arrancar aplicaciones y smoke funcional

**Comandos exactos:**

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d \
  api-prod web-prod portal-prod worker-prod
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml exec -T api-prod \
  wget -qO- http://127.0.0.1:3000/api/v1/health
```

Después del healthcheck, QA ejecuta el smoke en el Portal con un tenant y usuarios de prueba autorizados, contra el API real. Recorrer: autorización aprobada en una captura; conversión de expediente; contacto pendiente; solicitud de privacidad de prueba; y registro de suplantación que suspende el servicio impugnado. Verificar los estados finales del Portal/API y que worker registre el job de alertas. No usar el E2E local cuya configuración inicia Next en `127.0.0.1:3002` como sustituto de este smoke productivo; la prueba productiva requiere el tenant de QA segregado y sus fixtures sintéticas.

**Evidencia sin PII:** health status, resultados PASS/FAIL por criterio, conteos, códigos HTTP, duración y estado agregado del job. No guardar trazas, screenshots o reportes HTML con datos del titular; desactivar adjuntos o limpiarlos de PII antes de archivarlos.

**Parada:** API/dependencias unhealthy, aislamiento tenant fallido, cualquier flujo rojo, job ausente, placeholder visible, PII en logs/salida o evidencia pública → mantener mantenimiento y abortar.

**Rollback:** volver los componentes a sus digests registrados solo si son compatibles con el esquema; si hubo escritura incompatible, restaurar según §11. No borrar Redis ni sus colas para limpiar el smoke.

### Paso 10 — Poner en vigor el procedimiento manual de privacidad

**Orden operativa exacta (no existe CLI de fase 1a para el registro):** el Oficial abre el registro en el repositorio operativo restringido del ISP conforme a [RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL §7–§8](RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md), registra fecha de inicio, responsables y canal de escalamiento, y agenda el reporte mensual al CTO. Desde ese momento, tramita bloqueo y supresión según §§4–5 del mismo runbook. No crear archivos de casos en Git ni en carpetas de logs.

**Evidencia sin PII:** identificador restringido del registro, fecha de vigencia, responsables por rol y calendario del reporte. No anexar casos o titulares al informe de release.

**Parada:** no hay Oficial, registro restringido, doble control técnico/aprobador, SLA operativo o canal de incidente → no abrir el servicio a nuevos trámites; escalar al CTO.

**Rollback:** mantener el procedimiento manual vigente y el servicio en mantenimiento. No borrar ni editar el registro como mecanismo de reversión; cualquier corrección se deja como nueva entrada auditada.

### Paso 11 — Rollback y cierre de ventana

Ejecutar este cierre una sola vez, después de completar los pasos 3–10 para cada tenant inventariado. La frontera de rollback fijada por el plan es: **antes del paso 3**, restore global; **después de iniciar/aplicar el paso 3**, restore solamente del tenant afectado, preservando el estado de otros tenants. Congelar las escrituras del tenant afectado hasta completar health/smoke y su reactivación aprobada.

**Comandos exactos para el restore global (antes del paso 3):**

```bash
pnpm db:restore --target="$DB_NAME" --from="$GLOBAL_DUMP"
```

Requiere la confirmación interactiva del nombre de backup; en automatización solo se añade `--yes` tras aprobación explícita. Después aplicar el paso de arranque/health/smoke de [RUNBOOK-RELEASE-ROLLBACK §5.7 y §6.3](RUNBOOK-RELEASE-ROLLBACK-v1.0.md).

**Mecanismo de rollback por tenant (M1-G2, con `--rollback-in-place` de SPEC v1.1 §3.2):** el estado deseado conserva el tenant suspendido y las escrituras congeladas, renombra el schema actual a `<TENANT_SCHEMA>__pre_rollback_<UTC>`, restaura el dump sobre el nombre original con el modo nuevo, reaplica grants H-1, compara conteos y reabre el tenant solo al final. El schema renombrado se conserva hasta autorización expresa del CTO; nunca ejecutar `DROP SCHEMA`. El CLI verifica las tres precondiciones solo con lectura antes de escribir: schema destino ausente, fila de `public.tenants` existente e idéntica al sidecar en `id`/`slug`/`schema_name`, y tenant `SUSPENDED`. Si alguna falla, aborta sin escribir nada ni modificar `public.tenants`.

```bash
TENANT_SCHEMA="<schema resuelto desde public.tenants>"
ROLLBACK_TS="<UTC sin separadores>"
ARCHIVE_SCHEMA="${TENANT_SCHEMA}__pre_rollback_${ROLLBACK_TS}"
[[ "$TENANT_SCHEMA" =~ ^tenant_[a-z][a-z0-9_]{0,54}$ ]] || exit 2
(( ${#ARCHIVE_SCHEMA} <= 63 )) || exit 2
psql --host "$DB_HOST" --port "$DB_PORT" --username "$DB_MIGRATOR_USER" \
  --dbname "$DB_NAME" -X -v ON_ERROR_STOP=1 \
  -v tenant_schema="$TENANT_SCHEMA" -v archive_schema="$ARCHIVE_SCHEMA" <<'SQL'
BEGIN;
SELECT format('ALTER SCHEMA %I RENAME TO %I', :'tenant_schema', :'archive_schema') \gexec
COMMIT;
SQL
pnpm db:restore:tenant --file="$TENANT_DUMP" --into="$DB_NAME" --force-same-database --rollback-in-place
DB_NAME="$DB_NAME" pnpm db:apply-least-privilege
```

La confirmación interactiva del restore exige teclear el schema exacto. Después del restore, comparar los conteos exactos por tabla con el manifiesto del dump, comprobar permisos del rol runtime, ejecutar health/smoke y reactivar el tenant por el control aprobado. Para revertir la maniobra antes de reabrir tráfico, renombrar el schema restaurado a una ubicación de cuarentena y luego invertir el `RENAME` del schema previo; conservar ambos schemas hasta autorización CTO. Si el nombre inverso no está libre, detenerse y escalar, nunca borrar.

**Evidencia sin PII:** rollback sí/no, componente/tenant pseudonimizado, backup y checksum, códigos de salida, health/grants/smoke, duración y responsables. Nunca guardar filas de negocio, dumps, claves ni signed URLs.

**Parada:** el destino no coincide con el backup, falta sidecar/checksum, el schema no puede liberarse de manera aprobada, grants/health/smoke fallan o hace falta restaurar otros tenants → detenerse; ninguna migración `down()` queda autorizada por este runbook.

**Cierre sin rollback:** solo retirar mantenimiento después de completar todos los pasos, comprobar health/smoke y registrar el go de CTO/G7. Emitir acta externa del release con todos los gates por tenant y sin PII.

## Estado de revisión

Este borrador no autoriza la ventana. La revisión documental de `sec-eng` no reportó hallazgos bloqueantes, incluido el procedimiento común de generación segura de claves. Esto no declara G-SEC, no concede G7 ni cierra M1. M1-G1 (Compose) y M1-G3 (orden de flota) quedaron documentados; M1-G2 quedó resuelto en M4:

1. ~~Actualizar y ensayar el restore para un tenant cuyo registro `public.tenants` ya existe~~ — **resuelto**: `restore-tenant.mjs` soporta `--rollback-in-place` (SPEC v1.1 §3.2), con gate fail-closed de solo lectura (schema ausente, fila idéntica en `id`/`slug`/`schema_name`, tenant `SUSPENDED`), sin DML sobre `public.tenants` y sin eliminar schemas. Ensayo desechable completo (RENAME → restore → grants → conteos → reactivar → RENAME inverso → limpieza) y tests del camino feliz y de cada precondición incumplida. Revisión con checklist sec-eng sin bloqueantes (GO formal de `sec-eng` pendiente: el despacho anidado no está disponible en esta sesión; se solicita al orquestador).

La validación sintética de Compose y la revisión documental no sustituyen el ensayo del restore. M1 y el runbook no se declaran cerrados ni aptos para release hasta el GO formal de `sec-eng` y la decisión CTO/G7.
