# INFORME-MOD05-G7-K3-SEC-v1.0

| Campo       | Valor                                                                              |
| ----------- | ---------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                         |
| Responsable | AI-SEC-ENG                                                                         |
| Alcance     | Revisión de seguridad K1/K2 y revisión documental M1                               |
| Modo        | Solo lectura; no se modificó código ni se ejecutó el CLI contra tenants existentes |

## [SEC-REVIEW] Veredicto

**K1: GO. K2: GO.** No quedan hallazgos de seguridad bloqueantes en el código revisado. La separación de claves, el recifrado, la verificación, el aislamiento por schema y la salida agregada tienen controles explícitos; el hardening detectado durante esta revisión quedó cubierto por cambios y specs.

**M1 documental: GO sin bloqueantes SEC. M1 release: NO-GO mientras continúen abiertos los tres gates operativos del informe M1.** Este veredicto no autoriza despliegue, acceso a PII real ni cierre de G7.

## Evidencia K1 — separación MFA/PII

- ADR-058 §3 mantiene MFA en `MFA_ENCRYPTION_KEY`, migra CRM/parties a una clave independiente y limita el fallback MFA a no-producción ([ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md#L53)). La configuración exige `PII_ENCRYPTION_KEY` en producción y rechaza igualdad con MFA; la clave previa y `PII_DECRYPT_LEGACY_MFA` son variables separadas ([app.config.ts](../../apps/api/src/app.config.ts#L260)).
- El cargador runtime falla cerrado si producción no tiene clave PII; el fallback a MFA solo ocurre fuera de producción y emite un aviso constante sin valor de clave. Valida formato/entropía y mantiene la lectura anterior PII → MFA solo cuando el flag legado está habilitado ([aes-gcm.util.ts](../../apps/api/src/common/crypto/aes-gcm.util.ts#L152), [aes-gcm.util.ts](../../apps/api/src/common/crypto/aes-gcm.util.ts#L176), [aes-gcm.util.ts](../../apps/api/src/common/crypto/aes-gcm.util.ts#L196)). K1 reporta GO de código y no autoriza despliegues ([informe K1](INFORME-MOD05-G7-K1-v1.0.md#L4)).

## Evidencia K2 — claves, inventario y tenancy

- Las claves MFA se cargan desde `ConfigService`; la activa requiere 64 caracteres hexadecimales y entropía, mientras que la previa solo se usa para lectura. El mensaje de clave ausente/inválida remite al procedimiento seguro del runbook, sin sugerir imprimir material secreto ([reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L230), [reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L235), [spec](../../apps/api/src/cli/reencrypt-aes.spec.ts#L283)). La clave PII activa se carga mediante el cargador K1 y se rechaza si coincide con cualquiera de las claves MFA de origen ([reencrypt-aes.pii.ts](../../apps/api/src/cli/reencrypt-aes.pii.ts#L172)).
- K2 limita el recifrado MFA a los objetivos que no se migraron a PII; conserva `users.mfa_secret`, `users.email` y los objetivos MFA públicos, incluido `platform_users.mfa_secret` ([reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L163), [spec](../../apps/api/src/cli/reencrypt-aes.spec.ts#L185)). El inventario PII cubre 20 columnas cifradas y no añade las columnas HMAC ([CLI PII](../../apps/api/src/cli/reencrypt-aes.pii.ts#L66), [informe K2](INFORME-MOD05-G7-K2-v1.0.md#L32)).
- Los modos PII exigen schema tenant explícito y rechazan `public` o entrada inválida antes de abrir la conexión ([reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L134)). El lookup ata el nombre con parámetro, exige una fila registrada y namespace físico, no consulta tablas tenant antes de resolverlo y no filtra por estado; el test PostgreSQL cubre `ACTIVE`, `INACTIVE`, `SUSPENDED` y `MARKED_FOR_DELETION` ([reencrypt-aes.pii.ts](../../apps/api/src/cli/reencrypt-aes.pii.ts#L120), [integración PostgreSQL](../../apps/api/src/cli/reencrypt-aes.pii.postgres.integration.spec.ts#L249)). Para el flujo MFA general, los schemas explícitos se validan contra los tenants `ACTIVE` y los fallos son genéricos; el log inicial informa `explicit`/`all` sin interpolar el valor ([reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L173), [reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L182), [reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L289), [reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L322), [spec](../../apps/api/src/cli/reencrypt-aes.spec.ts#L150)).
- El adaptador tenant usa `runInTenantSchema`/`SET LOCAL search_path`, valida el schema, mantiene estáticos los identificadores de tabla/columna y enlaza valores e IDs como parámetros ([reencrypt-aes.db-adapter.ts](../../apps/api/src/common/crypto/reencrypt-aes.db-adapter.ts#L50), [reencrypt-aes.db-adapter.ts](../../apps/api/src/common/crypto/reencrypt-aes.db-adapter.ts#L74), [data-source.ts](../../packages/database/src/data-source.ts#L212)). El logger TypeORM no escribe query/parameters y limita errores a operación y SQLSTATE ([safe-typeorm.logger.ts](../../packages/database/src/safe-typeorm.logger.ts#L49)).
- El modo PII es dry-run por defecto, conserva `NULL`, no recifra valores ya protegidos por la clave PII y bloquea verify ante tablas/objetivos ausentes, error de descifrado o ciphertext aún legible solo por MFA ([reencrypt-aes.pii.ts](../../apps/api/src/cli/reencrypt-aes.pii.ts#L233), [reencrypt-aes.pii.ts](../../apps/api/src/cli/reencrypt-aes.pii.ts#L349)). La salida contiene modo, schema/tipo y conteos; no emite ciphertext, texto claro ni IDs ([reencrypt-aes.pii.ts](../../apps/api/src/cli/reencrypt-aes.pii.ts#L367)).
- El parser no refleja flags desconocidas; el fatal del CLI es fijo y no imprime mensajes de driver/constraint. Las specs verifican que los sentinels de entrada/driver no aparezcan en la salida ([reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L126), [reencrypt-aes.ts](../../apps/api/src/cli/reencrypt-aes.ts#L187), [spec](../../apps/api/src/cli/reencrypt-aes.spec.ts#L170)). No observé claves ni PII real en código, fixtures, informes K1/K2 o logs del flujo revisado.

## Evidencia de verificación K2

Tomé como evidencia la corrida final coordinada por el padre y publicada por K2; no repetí pruebas ni ejecuté contra tenants existentes.

- Tests CLI: 2 suites, 51 tests aprobados; typecheck: exit 0.
- PostgreSQL real aislado: 1 suite / 1 test aprobado; 21 valores sintéticos en dry-run, 21 recifrados en apply, 0 en la segunda aplicación; verify con 0 filas MFA-only. El fixture comprobó estados registrados y conservó campos MFA y `NULL`; el contenedor efímero se eliminó.
- Turbo API forzado: 380 suites aprobadas, 4 omitidas; 5.097 tests aprobados, 15 omitidos (5.112 total); `Cached: 0 cached, 4 total`.

Detalle y comandos: [informe K2](INFORME-MOD05-G7-K2-v1.0.md#L49).

## [SEC-REVIEW] Revisión documental M1

- El procedimiento común de generación crea el secreto en un temporal restringido, comprueba solo el conteo de bytes, importa desde archivo por un mecanismo aprobado sin exponerlo y limpia el archivo; prohíbe `cat`, `echo`, salida visible y guardar valores en el repo o `.env` ([runbook de claves](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md#L23)). §2, §6bis y §6ter remiten a ese flujo. No encontré instrucciones M1 que revelen claves o datos personales.
- El runbook release exige evidencia agregada, prohíbe copiar PII/ciphertext/tokens/claves/URLs firmadas a logs o informes, protege archivos de autenticación y evita desplegar la configuración expandida ([runbook release](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md#L15), [runbook release](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md#L23), [runbook release](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md#L48)). Prohíbe improvisar `DROP SCHEMA ... CASCADE` o restaurar sobre el origen ([runbook release](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md#L18)).
- El fallback `PII_DECRYPT_LEGACY_MFA=true` debe conservarse hasta que cada schema registrado, sin importar estado, tenga verify en cero; no se debe cambiar el estado del tenant para procesarlo ([runbook de claves](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md#L148), [informe M1](INFORME-MOD05-G7-M1-v1.0.md#L29)).

**M1 sigue NO-GO para release** hasta resolver los tres gates que el informe M1 deja abiertos: Compose no cablea las variables PII en API/migrator; falta un mecanismo aprobado de restore tenant sobre schema existente; y la migración tenant alcanza la flota ACTIVE, no un schema individual ([informe M1](INFORME-MOD05-G7-M1-v1.0.md#L19), [informe M1](INFORME-MOD05-G7-M1-v1.0.md#L20), [informe M1](INFORME-MOD05-G7-M1-v1.0.md#L21)). El propio runbook conserva condiciones STOP; la revisión documental sin hallazgos bloqueantes no resuelve esos gates ni concede autorización operativa.

## Riesgo residual y límites

- **Bajo, operacional:** la salida incluye `schema_name` y tipo de entidad para correlación por tenant. El contrato K2 los trata como identificadores técnicos; no pasar PII como nombre de schema ni reutilizar nombres de personas. Los valores de schema de entradas rechazadas o no registradas no se reflejan.
- La integración real fue sintética y aislada. No valida datos, permisos, Compose, migraciones ni restore de tenants existentes; esos puntos permanecen sujetos a gates M1 y a la ventana autorizada.
- **Sin escalación crítica.** No quedan hallazgos SEC bloqueantes en K1/K2 ni en el texto operativo M1 revisado.

## Verificación de este informe

- Ruta comprobada libre antes de crear este informe.
- `pnpm exec prettier --check docs/informes/INFORME-MOD05-G7-K3-SEC-v1.0.md`: aprobado.
- `git diff --no-index --check -- /dev/null docs/informes/INFORME-MOD05-G7-K3-SEC-v1.0.md`: sin diagnósticos de whitespace; el código de salida 1 corresponde al diff esperado de un archivo nuevo.
- Sin commit.
