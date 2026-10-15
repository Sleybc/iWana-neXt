# [SEC-REVIEW] Informe de seguridad — MOD05 E-3 · E4-B

**Fecha:** 2026-10-15  
**Responsable:** AI-SEC-ENG  
**Veredicto:** **GO**  
**Alcance:** revisión de solo lectura del CLI C-E3-CLI, presencia de escritores productivos de placeholders y `''`, exposición de `contactPending` y errores 422 R4/R5/R6.

## Resultado

No encontré defectos de seguridad en el alcance revisado. No hay hallazgos críticos ni hallazgos que bloqueen el merge desde esta revisión. El GO aplica a E4-B; el informe E4-A registra por separado que la corrida E2E quedó bloqueada antes de ejecutar las aserciones de interfaz y CA-E3-01..04.

## Controles revisados

- **Clave HMAC:** el entrypoint crea `ConfigService` y llama `resolvePiiHashKey` antes de abrir la conexión (`apps/api/src/cli/backfill-placeholder-contacts.ts:272-274`). El utilitario exige `PII_HASH_KEY`, valida longitud/formato y rechaza claves débiles; `hmacPii` usa HMAC-SHA-256 (`apps/api/src/common/crypto/pii-hash-key.util.ts:41-86`). No hay clave incrustada en el CLI.
- **Dry-run y cambio explícito:** el parser inicia en `dry-run`; solo cambia con `--apply` (`apps/api/src/cli/backfill-placeholder-contacts.ts:193-216`). El dry-run retorna antes de las escrituras (`:147`); la guía del CLI lo declara como modo predeterminado (`:256-263`).
- **Aislamiento y atomicidad:** el CLI resuelve el tenant con consultas parametrizadas y exige estado `ACTIVE` y schema válido (`apps/api/src/cli/backfill-placeholder-contacts.ts:233-254`). Ejecuta el trabajo con `runInTenantSchema` (`:179-190`), que valida el nombre del schema, usa `SET LOCAL search_path` y abre una única transacción con rollback ante error (`packages/database/src/data-source.ts:197-220`).
- **Idempotencia y escrituras:** al aplicar, elimina cifrado y HMAC de los contactos placeholder en `subscribers`, convierte `party_contact.value = ''` en `NULL` y elimina lógicamente las filas `party_contact` coincidentes cuando existe `deleted_at` (o las borra en el esquema compatible); la selección se basa en hashes parametrizados (`apps/api/src/cli/backfill-placeholder-contacts.ts:103-145,149-176`). El informe E2 registra la integración Postgres sintética: dry-run sin cambios, aplicación y segunda aplicación sin cambios adicionales (`docs/informes/INFORME-MOD05-E3-E2-v1.0.md:32-33`).
- **Salida y logs:** el reporte contiene únicamente modo, conteos y bandera de aplicación (`apps/api/src/cli/backfill-placeholder-contacts.ts:13-24`). La salida imprime UUID/schema del tenant y ese agregado; no imprime contactos, valores descifrados ni HMAC (`:283-284`). El manejador de error escribe un mensaje constante y genérico (`:290-295`).
- **Placeholders en código productivo:** la búsqueda literal de `@placeholder.iwana.co` solo encontró la constante de detección del CLI; las otras coincidencias están en pruebas. La búsqueda de asignaciones/escrituras `party_contact.value = ''` solo encontró el conteo y la limpieza a `NULL` del mismo CLI (más su prueba de integración). No encontré productores productivos de los placeholders ni del centinela vacío. Las constantes de detección están en `apps/api/src/cli/backfill-placeholder-contacts.ts:43-44` y se usan para eliminar valores heredados, no para crearlos.
- **`contactPending`:** es un booleano derivado de la presencia de campos cifrados; el flag no añade ni expone esos valores (`apps/api/src/modules/crm/subscribers/subscriber-contact.util.ts:3-8`; `subscriber-projection.ts:75-90`; `subscribers.controller.ts:513-562`). No condiciona ni filtra el resto de la proyección. La lista conserva su mapa explícito de campos por rol (`subscriber-projection.ts:91-110`); detalle y 360° mantienen guards de JWT, roles y permisos del controlador (`subscribers.controller.ts:81-84,351-365,451-465`).
- **Errores 422 sin PII:** R4 devuelve código y mensaje constantes (`apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts:153-158`); R6 usa el mismo código y mensaje constante (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:700-707`); R5 devuelve código y mensaje constantes antes de mutar el expediente (`apps/api/src/modules/crm/expedientes/expediente.service.ts:1105-1113`). Ninguno incorpora nombre, contacto, ID de expediente ni datos del request en la respuesta.

## Ruta y límites de la revisión

La ruta `docs/informes/INFORME-MOD05-E3-E4-SEC-v1.0.md` estaba libre antes de crear este informe. La revisión fue estática y no ejecutó pruebas; la evidencia de integración citada corresponde al informe E2.
