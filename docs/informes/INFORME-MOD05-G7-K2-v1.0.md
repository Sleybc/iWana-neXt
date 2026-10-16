# INFORME-MOD05-G7-K2-v1.0

**Estado:** K2 y hardening SEC implementados; tests CLI, typecheck y Turbo API final aprobados.

**Alcance:** recifrado de PII de claves MFA históricas a `PII_ENCRYPTION_KEY`, por schema tenant.

**Cambios de código:** únicamente `apps/api/src/cli/reencrypt-aes*`; sin cambios en objetivos MFA ni en módulos de producción.

## Contrato operativo

El CLI obtiene las claves mediante `ConfigService`. Los modos `--mfa-to-pii` y `--verify-pii-only` requieren `--schema=<tenant>` explícito y rechazan schemas inválidos o `public` antes de inicializar la conexión; no existe ejecución de flota para el modo PII. El lookup parametrizado exige exactamente una fila registrada de `public.tenants` con namespace real en `pg_catalog.pg_namespace`; no filtra por estado. Por tanto, cubre ACTIVE, INACTIVE, SUSPENDED, MARKED_FOR_DELETION y cualquier otro estado registrado cuyo schema siga retenido. Un schema no registrado, ya purgado o con resolución distinta de una fila falla con mensaje genérico antes de consultar tablas tenant. Si faltan tablas objetivo o no se pueden leer, el proceso permanece bloqueante y no reporta verificación exitosa. `--mfa-to-pii` usa dry-run por defecto, procesa por lotes, conserva `NULL`, reconoce ciphertext ya cifrado con la clave PII y es idempotente. `--apply` escribe con la clave PII activa. `--verify-pii-only` comprueba que ninguna fila objetivo siga siendo descifrable solo con las claves MFA. Los informes del CLI contienen modos, nombres de schema/tipo y conteos; omiten valores cifrados, texto claro e identificadores de fila. Las flags desconocidas producen un mensaje genérico sin reflejar el argumento.

El ciclo MFA general filtra los objetivos tenant que coinciden por tabla y columna con las 20 columnas migradas a PII. Conserva, entre otros, `users.mfa_secret` y `users.email`; la lista pública MFA, incluido `platform_users.mfa_secret`, permanece sin cambios. El CLI de integración falla antes de conectar si el host no es loopback o la base no tiene prefijo `iwana_it_g7_`.

Comandos para un tenant registrado en cualquier estado cuyo namespace aún exista. El schema siempre debe indicarse de forma explícita:

```powershell
# Inspección sin escritura (modo por defecto)
pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --schema=<tenant>

# Aplicar el recifrado
pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --apply --schema=<tenant>

# Verificar con PII activa/previa, sin usar las claves MFA
pnpm --filter @iwana/api encryption:reencrypt -- --verify-pii-only --schema=<tenant>
```

El comando del paquete ejecuta `node dist/cli/reencrypt-aes.js`; se debe compilar `@iwana/api` antes de invocarlo. El destino PII activo debe ser distinto de las claves MFA de origen. El flujo MFA→MFA previo y sus objetivos se mantienen.

## Inventario MFA→PII

El modo cubre estas 20 columnas cifradas:

| Familia                                 | Tabla y columnas                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Suscriptores                            | `subscribers.document_number_encrypted`, `email_encrypted`, `phone_encrypted`, `alt_contact_phone_encrypted`, `whatsapp_encrypted`                                                               |
| Expedientes                             | `expediente_records.document_number_encrypted`, `phone_primary_encrypted`, `phone_secondary_encrypted`, `email_primary_encrypted`, `alt_contact_phone_encrypted`, `site_contact_phone_encrypted` |
| Contactos                               | `subscriber_contacts.email_encrypted`, `phone_encrypted`                                                                                                                                         |
| Potenciales                             | `potential_leads.email_encrypted`, `phone_encrypted`                                                                                                                                             |
| Party                                   | `party.document_number`, `party_contact.value_encrypted`                                                                                                                                         |
| Identidad del solicitante de privacidad | `data_subject_requests.requester_name_encrypted`, `requester_document_encrypted`, `requester_contact_encrypted`                                                                                  |

La integración cargó 21 valores sintéticos entre estas columnas, incluyendo una fila cifrada con la clave MFA previa. Los objetivos del inventario MFA no se recorren en el modo PII.

## Evidencia

| Verificación                                                                                                                                                                              | Resultado                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests CLI enfocados: `pnpm --filter @iwana/api exec jest --runInBand --runTestsByPath src/cli/reencrypt-aes.spec.ts src/cli/reencrypt-aes.pii.spec.ts`                                    | 2 suites aprobadas; 51 tests aprobados                                                                                                                                            |
| Formato de clave MFA activa                                                                                                                                                               | Rechaza longitud incorrecta, cualquier carácter no hexadecimal en 64 posiciones y entropía nula                                                                                   |
| Error por clave activa ausente/inválida                                                                                                                                                   | Remite al procedimiento seguro del runbook §1; no recomienda un comando que imprima la clave                                                                                      |
| Validación de `--schema`                                                                                                                                                                  | MFA permite `public` o tenant válido; entradas inválidas reciben error genérico sin reflejar el valor                                                                             |
| Schema MFA no registrado y log inicial                                                                                                                                                    | Preflight contra schemas ACTIVE devuelve error genérico; el log indica `explicit`/`all` sin interpolar el schema                                                                  |
| Error fatal del CLI                                                                                                                                                                       | Salida estática genérica; el sentinel de texto de driver/constraint no aparece en el log                                                                                          |
| Typecheck: `pnpm --filter @iwana/api typecheck`                                                                                                                                           | Exit 0 tras los guards de formato MFA, errores, schema y preflight MFA                                                                                                            |
| Integración PostgreSQL real: `pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --runTestsByPath src/cli/reencrypt-aes.pii.postgres.integration.spec.ts` | 1 suite aprobada; 1 test aprobado                                                                                                                                                 |
| Lookup real de estado/schema                                                                                                                                                              | El namespace registrado resolvió en ACTIVE, INACTIVE, SUSPENDED y MARKED_FOR_DELETION; schema no registrado rechazado genéricamente                                               |
| Integración: dry-run                                                                                                                                                                      | 21 valores candidatos; ninguna escritura antes de `--apply`                                                                                                                       |
| Integración: apply e idempotencia                                                                                                                                                         | 21 recifrados iniciales; 0 recifrados en la segunda aplicación                                                                                                                    |
| Integración: `NULL` y objetivos MFA                                                                                                                                                       | El `NULL` se conserva; `users.email` y `users.mfa_secret` permanecen sin cambios                                                                                                  |
| Integración: verificación                                                                                                                                                                 | 0 filas que solo abran con claves MFA; todos los objetivos PII abren con la clave PII activa                                                                                      |
| Aislamiento y limpieza                                                                                                                                                                    | Base `iwana_it_g7_k2_f1020b6e6b` en contenedor Postgres efímero, loopback; fixture sintético en schema tenant mínimo sin ejecutar migraciones; `EPHEMERAL_CONTAINER_REMOVED=True` |
| Turbo API final tras el guard de error fatal: `pnpm exec turbo run test --filter=@iwana/api --force`                                                                                      | Exit 0; 380 suites aprobadas, 4 omitidas (384 total); 5.097 tests aprobados, 15 omitidos (5.112 total); `Cached: 0 cached, 4 total`                                               |
| Integración DB en el Jest completo                                                                                                                                                        | Condicional y omitida por el runner general; la integración PostgreSQL real de K2 se ejecutó aparte y aprobó (ver evidencia anterior)                                             |
| Prettier                                                                                                                                                                                  | Los seis archivos CLI y el informe K2 pasan `prettier --check`                                                                                                                    |
| `git diff --check`                                                                                                                                                                        | Sin errores en los archivos trackeados de CLI K2                                                                                                                                  |

La integración se protege antes de conectar: cuando está habilitada, exige una `DB_NAME` `iwana_it_g7_*` y un `DB_HOST` loopback (`127.0.0.1`, `localhost` o `::1`; ausente equivale a `127.0.0.1`). Los tests CLI enfocan el rechazo de host externo; la integración PostgreSQL real prueba el lookup PII con cada estado retenido citado arriba y el rechazo del schema no registrado. Se ejecutó en el contenedor `iwana-it-g7-k2-f1020b6e6b`, con credenciales sintéticas asignadas solo en memoria tanto a `DB_USER` como a `DB_MIGRATOR_USER`. El test reportó únicamente el nombre de la DB y el destino loopback. El contenedor temporal se eliminó en `finally` (`EPHEMERAL_CONTAINER_REMOVED=True`). No se usaron bases o contenedores preexistentes. No se repitió la integración PostgreSQL: los cambios posteriores son de validación y salida del CLI y no alteran la ruta DB.

La fixture de integración crea y elimina su propio schema mínimo, sin depender del estado de migración de ningún tenant origen. Las claves y textos de la prueba son constantes sintéticas dentro de tests; no se guardaron secretos ni datos personales reales.

## Cierre

El flujo de recifrado y el lookup por schema retenido quedan verificados en tests CLI y PostgreSQL real, con typecheck aprobado. El hardening de parser, aislamiento, ciclo MFA/PII, selección de cualquier estado de tenant, formato hexadecimal MFA, mensajes de error seguros, validación de schema, redacción del log inicial y preflight MFA está cubierto. El Turbo API `--force` final aprobó con cero cache hits. Las integraciones condicionales del Jest general no sustituyen la integración PostgreSQL real de K2 que se reporta por separado. No se ejecutó el CLI contra tenants existentes. No se realizó commit.
