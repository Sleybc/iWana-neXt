# Informe de ejecución — MOD05 E-3 · E2 backend y CLI

**Fecha:** 2026-10-15  
**Responsable:** AI-SR-FULL  
**Estado:** E2 implementado y verificado; no declara cerrados E3–E4 ni la fase E-3 completa.  
**Alcance:** reglas R1–R7, contrato compartido C-E3-API, backfill C-E3-CLI y pruebas reales PostgreSQL según §5 E2.

## Resultado

El backend acepta convertir expedientes sin contacto en suscriptores `PROSPECT`, expone `contactPending` en detalle, 360°, lista y respuestas de alta/edición, y bloquea las activaciones sin contacto real. El alta directa exige al menos un correo o teléfono; editar un suscriptor `ACTIVE` no puede quitar su último canal. No se producen placeholders al convertir desde expediente. Las rutas de parties guardan `NULL` en lugar del centinela vacío.

La guarda de expediente para `CLIENTE_ACTIVO` es síncrona y ocurre antes de cualquier escritura, auditoría o evento. La activación desde el listener también tiene defensa en profundidad: si el contacto falta, registra `ACTIVATION_BLOCKED_CONTACT_PENDING` sin PII y retorna `null`.

Los rechazos usan `422 SUBSCRIBER_CONTACT_REQUIRED` para activación/edición y `422 EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED` para el expediente, con los mensajes de §4 del prompt.

El CLI procesa un tenant por transacción. Por defecto informa conteos sin PII; `--apply` limpia cifrado y HMAC de los placeholders, elimina los contactos coincidentes y convierte los valores vacíos a `NULL`. Requiere que la migración 148 ya haya relajado las columnas. La selección de clave HMAC pasa por `ConfigService` y `resolvePiiHashKey`; los reportes son idempotentes.

## Cambios de E2

- `packages/shared/src/schemas/subscriber.schema.ts`: email/teléfono opcionales en `CreateSubscriberSchema`, con `superRefine` que exige uno; `contactPending` en `SubscriberListItem`.
- `apps/api/src/modules/crm/subscribers/**`: función `hasRealContact`, conversión sin placeholders, validaciones R3/R4/R6, proyección de lista, `sanitizeResponse` y defensa en `activateFromExpediente`.
- `apps/api/src/modules/crm/expedientes/expediente.service.ts`: guarda R5 y spec; un rechazo no guarda el expediente ni emite auditoría/evento.
- `apps/api/src/modules/parties/party-pii.util.ts` y `parties/services/party-contact.service.ts`: el centinela se reemplaza por `NULL`.
- Extensión mínima requerida para alinear el modelo TypeORM con la nulabilidad del DDL: `apps/api/src/modules/parties/entities/party-contact.entity.ts` declara `value: string | null` y `nullable: true`, para alinear TypeORM con la migración 148. Se actualizó únicamente la expectativa de `party-write.adapter.spec.ts`; el adapter productivo no se modificó.
- `apps/api/src/cli/backfill-placeholder-contacts.ts` y specs: dry-run por defecto, `--apply`, selección explícita `--tenant=<id|slug>`, HMAC desde configuración, conteos agregados e idempotencia. Tras compilar, se ejecuta con `pnpm --filter @iwana/api exec node dist/cli/backfill-placeholder-contacts.js --tenant=<id|slug> [--dry-run|--apply]`.

## Evidencia de pruebas

| Gate                                     | Comando / entorno                                                                                                                                                                                                                             | Resultado                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias E2                             | Comando completo abajo                                                                                                                                                                                                                        | 12 suites y 291 tests aprobados. Incluye el spec actualizado del adapter: 11/11.                                                                                                                                                                                                                                                                                                                           |
| Flujo API real PostgreSQL                | `pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --runTestsByPath src/modules/crm/subscribers/contact-pending.postgres.integration.spec.ts`                                                                | 1 suite, 1 test aprobado en schema tenant efímero creado desde cero y migrado en orden hasta la 148. Convierte sin contacto a `PROSPECT`; verifica `contactPending` y ausencia de placeholders; ambas activaciones devuelven 422 sin escritura; al agregar un canal la activación funciona. No usa schema tenant de origen.                                                                                |
| Backfill C-E3-CLI contra PostgreSQL real | La misma orden con `src/cli/backfill-placeholder-contacts.postgres.integration.spec.ts`; ejercita `runPlaceholderBackfillInTenantSchema` con fixtures sintéticos                                                                              | 1 suite, 1 test aprobado. Dry-run conserva filas; `--apply` limpia cifrado/HMAC y contactos; la segunda aplicación no encuentra cambios. El conteo mantiene el suscriptor `ACTIVE` sin contacto para que el operador lo complete. El entrypoint compilado se validó con `--help`; no se aplicó el CLI sobre un tenant con datos existentes.                                                                |
| Rotación AES con NULL                    | La misma orden con `src/modules/crm/subscribers/subscriber-null-encryption-rotation.postgres.integration.spec.ts`                                                                                                                             | 1 suite, 1 test aprobado: NULL permanece NULL y el ciphertext sintético no nulo se recifra con la clave activa.                                                                                                                                                                                                                                                                                            |
| B5 identidad/conversión PostgreSQL       | `E2E_TENANT_SLUG` apuntó a un tenant activo resuelto consultando únicamente `id`, `slug` y `schema_name` de `public.tenants`; `DB_HOST=127.0.0.1`, `DB_PORT=5433`, `DB_NAME=dbiw`; spec `b5-identity-conversion.postgres.integration.spec.ts` | 1 suite, 16 tests aprobados. El tenant se usa solo como plantilla DDL: el spec copia tablas con `LIKE ... INCLUDING ALL`, opera sobre un schema clon efímero y lo elimina al terminar. Aplica explícitamente las migraciones necesarias, incluida la 148. No escribe filas en el origen ni consulta `typeorm_migrations` del origen. El slug `test` no existe en esta base; no es dependencia del caso B5. |
| Typecheck                                | `pnpm --filter @iwana/api typecheck`; `pnpm --filter @iwana/shared typecheck`                                                                                                                                                                 | Ambos exit 0.                                                                                                                                                                                                                                                                                                                                                                                              |
| Build forzado                            | `pnpm exec turbo run build --filter=@iwana/api --filter=@iwana/shared --force`                                                                                                                                                                | Exit 0; 4/4 paquetes, incluidos los paquetes dependientes `@iwana/db` y `@iwana/storage`.                                                                                                                                                                                                                                                                                                                  |
| Lint                                     | `pnpm --filter @iwana/api lint`; `pnpm --filter @iwana/shared lint`                                                                                                                                                                           | Exit 0. API: 0 errores y 7 warnings preexistentes en `main.ts`, `audit-export.helper.ts`, soporte de tests de inventory, `execution-order-templates.controller.ts` y `tax-presets.seeder.ts`. Shared: sin hallazgos.                                                                                                                                                                                       |
| Formato y diff                           | `pnpm exec prettier --check` sobre los archivos E2 modificados; `git diff --check`                                                                                                                                                            | Exit 0; archivos con formato correcto y sin errores de whitespace.                                                                                                                                                                                                                                                                                                                                         |
| CLI compilado                            | `pnpm --filter @iwana/api exec node dist/cli/backfill-placeholder-contacts.js --help`                                                                                                                                                         | Exit 0; muestra uso, modo predeterminado y opciones.                                                                                                                                                                                                                                                                                                                                                       |

La suite unitaria se ejecutó con:

```powershell
pnpm --filter @iwana/api exec jest --runInBand --runTestsByPath `
  src/modules/crm/expedientes/tests/expediente.service.spec.ts `
  src/modules/crm/subscribers/tests/create-subscriber-contact.contract.spec.ts `
  src/modules/crm/subscribers/tests/subscriber-contact.util.spec.ts `
  src/modules/crm/subscribers/tests/subscriber-creation.service.spec.ts `
  src/modules/crm/subscribers/tests/subscriber-projection.spec.ts `
  src/modules/crm/subscribers/tests/subscriber-status-transition.service.spec.ts `
  src/modules/crm/subscribers/tests/subscribers.service.spec.ts `
  src/modules/crm/subscribers/vat-treatment.service.spec.ts `
  src/modules/parties/adapters/party-write.adapter.spec.ts `
  src/modules/parties/party-pii.util.spec.ts `
  src/modules/parties/services/party-contact.service.spec.ts `
  src/cli/backfill-placeholder-contacts.spec.ts
```

Las tres integraciones autónomas se ejecutaron en un solo proceso Jest con `IWANA_DB_INTEGRATION_AVAILABLE=true`, `DB_HOST=127.0.0.1`, `DB_PORT=5433` y `DB_NAME=dbiw`:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE = 'true'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '5433'
$env:DB_NAME = 'dbiw'
pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --runTestsByPath `
  src/modules/crm/subscribers/contact-pending.postgres.integration.spec.ts `
  src/cli/backfill-placeholder-contacts.postgres.integration.spec.ts `
  src/modules/crm/subscribers/subscriber-null-encryption-rotation.postgres.integration.spec.ts
```

La corrida B5 válida usó el tenant activo `srqa-mod11-r5-20261006` solo como origen de DDL:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE = 'true'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '5433'
$env:DB_NAME = 'dbiw'
$env:E2E_TENANT_SLUG = 'srqa-mod11-r5-20261006'
pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --runTestsByPath `
  src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts
```

La primera ejecución de B5 con `E2E_TENANT_SLUG=test` no encontró ese tenant y no llegó a crear el clon. La corrida válida seleccionó un tenant activo usando solo metadatos; el schema fuente no recibió escrituras. El flujo de contacto pendiente se evidencia en su spec independiente, que aplica el runner completo sobre un schema sintético; B5 valida el clon de DDL y su independencia del estado de migraciones del origen.

## Gobernanza y límites

Se aplicaron `AGENTS.md`, el bootstrap del workspace, el plan MOD05 E-3, `PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md` §§1–3 y §5 E2, `.github/instructions/api.instructions.md`, PRDs vigentes de Fase 03/Fase 04, HLD MOD05, ADR-027 y las skills `nestjs-expert`, `backend-security-coder`, `test-driven-development` y `postgresql`. La ruta del informe estaba libre antes de crear este archivo.

La búsqueda en código productivo de subscribers/parties no encontró escritores de los placeholders de correo/teléfono ni del valor vacío. No se añadieron dependencias npm ni se modificaron rutas fuera de la propiedad E2 y de las dos extensiones mínimas descritas en este informe. Se conservaron los cambios preexistentes de otras superficies.
